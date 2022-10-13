import { OctokitInstance, PRDetails, RepositoryDetails, Template } from './types'

const baseBranchName = 'centralized-templates'
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`

export const getCommitFiles =
  (repository: RepositoryDetails, sha: string) => async (octokit: Pick<OctokitInstance, 'repos'>) => {
    const commit = await octokit.repos.getCommit({
      ...repository,
      ref: sha,
    })
    console.debug('Fetched commit:')
    console.debug(commit)
    const {
      data: { files },
    } = commit

    const filenames = files?.map(f => f.filename)
    console.debug(`Saw changed files in ${sha}:`)
    console.debug(filenames)

    return filenames ?? []
  }

const getOrCreateNewBranch =
  (repository: RepositoryDetails, baseBranchRef: string) => async (octokit: Pick<OctokitInstance, 'git'>) => {
    try {
      console.debug(`Creating new branch on SHA: '${baseBranchRef}'.`)
      const newBranch = (await octokit.git.createRef({ ...repository, ref: fullBranchName, sha: baseBranchRef })).data
      console.debug(`Created new branch with ref: '${newBranch.ref}'.`)

      const {
        object: { sha },
      } = newBranch

      return sha
    } catch {
      console.debug(`Failed to create a new branch with ref: '${fullBranchName}'.`)
      console.debug(`Fetching existing branch with ref: '${reducedBranchName}'.`)

      const { data: foundBranch } = await octokit.git.getRef({ ...repository, ref: reducedBranchName })
      console.debug(`Found new branch with ref: '${foundBranch.ref}'.`)

      const {
        object: { sha },
      } = foundBranch

      return sha
    }
  }

const createTreeWithChanges =
  (templates: Template[], repository: RepositoryDetails, treeSha: string) =>
  async (octokit: Pick<OctokitInstance, 'git'>) => {
    const templateTree = templates.map(template => ({
      path: template.path,
      mode: '100644',
      type: 'blob',
      content: template.contents,
    }))

    console.debug(`Fetching existing trees from '${treeSha}'.`)
    const {
      data: { tree: existingTree },
    } = await octokit.git.getTree({ ...repository, tree_sha: treeSha })

    console.debug('Creating git tree with modified templates.')
    const {
      data: { sha: createdTreeSha },
    } = await octokit.git.createTree({
      ...repository,
      tree: [...templateTree, ...existingTree] as [],
    })
    console.debug(`Created git tree with SHA '${createdTreeSha}'.`)

    return createdTreeSha
  }

const createCommitWithChanges =
  (repository: RepositoryDetails, title: string, currentCommitSha: string, createdTreeSha: string) =>
  async (octokit: Pick<OctokitInstance, 'git'>) => {
    console.debug('Creating git commit with modified templates.')

    const {
      data: { sha: newCommitSha },
    } = await octokit.git.createCommit({
      ...repository,
      message: title,
      tree: createdTreeSha,
      parents: [currentCommitSha],
    })
    console.debug(`Created git commit with SHA '${newCommitSha}'.`)

    return newCommitSha
  }

const createPullRequest =
  (repository: RepositoryDetails, details: PRDetails, baseBranch: string) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const { title, description } = details

    console.debug('Creating PR.')
    const created = await octokit.pulls.create({
      ...repository,
      title,
      body: description,
      head: fullBranchName,
      base: baseBranch,
    })
    console.debug(`Created PR #${created.data.number}.`)

    return created
  }

const updatePullRequest =
  (repository: RepositoryDetails, details: PRDetails, number: number) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const { title, description } = details

    console.debug(`Updating PR #${number}.`)
    const updated = await octokit.pulls.update({
      ...repository,
      pull_number: number,
      head: fullBranchName,
      body: description,
      title: title,
      state: 'open',
    })
    console.debug(`Updated PR #${updated.data.number}.`)

    return updated
  }

const getExistingPullRequest = (repository: RepositoryDetails) => async (octokit: Pick<OctokitInstance, 'pulls'>) => {
  const { data: openPullRequests } = await octokit.pulls.list({
    ...repository,
    head: fullBranchName,
    state: 'open',
  })
  console.debug(`Found ${openPullRequests.length} open PRs.`)

  const toUpdate = openPullRequests.sort(pr => pr.number).shift()

  return toUpdate
}

const mergePullRequest =
  (number: number, repository: RepositoryDetails) => async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    console.debug(`Attempting automerge of PR #${number}.`)
    const merged = await octokit.pulls.merge({
      ...repository,
      pull_number: number,
      merge_method: 'squash',
    })
    console.debug(`Merged PR #${number}.`)

    return merged
  }

const maintainPullRequest =
  (repository: RepositoryDetails, details: PRDetails, baseBranch: string, automerge?: boolean) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const currentPullRequest = await getExistingPullRequest(repository)(octokit)

    const pr = currentPullRequest
      ? await updatePullRequest(repository, details, currentPullRequest.number)(octokit)
      : await createPullRequest(repository, details, baseBranch)(octokit)

    if (automerge) {
      await mergePullRequest(pr.data.number, repository)(octokit)
    }
    const {
      data: { number: prNumber },
    } = pr
    return prNumber
  }

const updateBranch =
  (newBranch: string, newCommit: string, repository: RepositoryDetails) =>
  async (octokit: Pick<OctokitInstance, 'git'>) => {
    console.debug(`Setting new branch ref '${newBranch}' to commit '${newCommit}'.`)
    const {
      data: { ref: updatedRef },
    } = await octokit.git.updateRef({
      ...repository,
      ref: reducedBranchName,
      sha: newCommit,
      force: true,
    })
    return updatedRef
  }

const generatePullRequestDescription = (version: string, templates: Template[]) => {
  const stringifiedTemplateNames = templates.map(t => `- \`${t.path}\``).join('\n')

  return `
  ---

  Template version: \`${version}\`

  ---
  
  This will update templates based on the current repository configuration.
  
  ---
  
  This updates:

  ${stringifiedTemplateNames}
  `
}

const extractBranchInformation =
  (repository: RepositoryDetails) => async (octokit: Pick<OctokitInstance, 'repos' | 'git'>) => {
    console.debug('Fetching base branch.')
    const {
      data: { default_branch: baseBranch },
    } = await octokit.repos.get({ ...repository })
    console.debug(`Using base branch '${baseBranch}'.`)

    console.debug(`Fetching base branch ref 'heads/${baseBranch}'.`)
    const {
      data: {
        object: { sha: baseBranchRef },
      },
    } = await octokit.git.getRef({ ...repository, ref: `heads/${baseBranch}` })

    const newBranch = await getOrCreateNewBranch(repository, baseBranchRef)(octokit)

    console.debug('Determining current commit.')
    const {
      data: { sha: currentCommitSha },
    } = await octokit.git.getCommit({ ...repository, commit_sha: baseBranchRef })

    console.debug(`Using base commit '${currentCommitSha}'.`)

    return { baseBranch, currentCommitSha, newBranch, baseBranchRef }
  }

export const commitFiles =
  (repository: RepositoryDetails, version: string, templates: Template[]) =>
  async (octokit: Pick<OctokitInstance, 'git' | 'repos' | 'pulls'>) => {
    const { baseBranch, currentCommitSha, newBranch, baseBranchRef } = await extractBranchInformation(repository)(
      octokit,
    )

    const prDetails = {
      title: 'Update templates based on repository configuration',
      description: generatePullRequestDescription(version, templates),
    }

    const createdTree = await createTreeWithChanges(templates, repository, baseBranchRef)(octokit)
    const newCommit = await createCommitWithChanges(repository, prDetails.title, currentCommitSha, createdTree)(octokit)
    const updatedRef = await updateBranch(newBranch, newCommit, repository)(octokit)
    console.debug(`Updated branch ref: ${updatedRef}`)

    return await maintainPullRequest(repository, prDetails, baseBranch)(octokit)
  }
