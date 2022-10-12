import { OctokitInterface, PRDetails, RepositoryDetails, Template } from './types'

const baseBranchName = 'centralized-templates'
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`

const getOrCreateNewBranch =
  (octokit: OctokitInterface) => async (repository: RepositoryDetails, baseBranchRef: string) => {
    try {
      console.debug(`Creating new branch on SHA: '${baseBranchRef}'.`)
      const newBranch = (await octokit.git.createRef({ ...repository, ref: fullBranchName, sha: baseBranchRef })).data
      console.debug(`Created new branch with ref: '${newBranch.ref}'.`)
      return newBranch
    } catch {
      console.debug(`Failed to create a new branch with ref: '${fullBranchName}'.`)
      console.debug(`Fetching existing branch with ref: '${reducedBranchName}'.`)

      const { data: foundBranch } = await octokit.git.getRef({ ...repository, ref: reducedBranchName })
      console.debug(`Found new branch with ref: '${foundBranch.ref}'.`)

      return foundBranch
    }
  }

const createTreeWithChanges =
  (octokit: OctokitInterface) => (templates: Template[], repository: RepositoryDetails) => async (treeSha: string) => {
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
    const createdTree = await octokit.git.createTree({
      ...repository,
      tree: [...templateTree, ...existingTree] as [],
    })
    console.debug(`Created git tree with SHA '${createdTree.data.sha}'.`)

    return createdTree
  }

const createCommitWithChanges =
  (octokit: OctokitInterface) =>
  (repository: RepositoryDetails, title: string) =>
  async (currentCommit: { data: { sha: string } }, createdTree: { data: { sha: string } }) => {
    console.debug('Creating git commit with modified templates.')

    const newCommit = await octokit.git.createCommit({
      ...repository,
      message: title,
      tree: createdTree.data.sha,
      parents: [currentCommit.data.sha],
    })
    console.debug(`Created git commit with SHA '${newCommit.data.sha}'.`)

    return newCommit
  }

const createPullRequest =
  (octokit: OctokitInterface) => async (repository: RepositoryDetails, details: PRDetails, baseBranch: string) => {
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
  (octokit: OctokitInterface) => async (repository: RepositoryDetails, details: PRDetails, number: number) => {
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

const getExistingPullRequest = (octokit: OctokitInterface) => async (repository: RepositoryDetails) => {
  const { data: openPullRequests } = await octokit.pulls.list({
    ...repository,
    head: fullBranchName,
    state: 'open',
  })
  console.debug(`Found ${openPullRequests.length} open PRs.`)

  const toUpdate = openPullRequests.sort(pr => pr.number).shift()

  return toUpdate
}

const mergePullRequest = (octokit: OctokitInterface) => async (number: number, repository: RepositoryDetails) => {
  console.debug(`Attempting automerge of PR #${number}.`)
  const merged = await octokit.rest.pulls.merge({
    ...repository,
    pull_number: number,
    merge_method: 'squash',
  })
  console.debug(`Merged PR #${number}.`)

  return merged
}

const maintainPullRequest =
  (octokit: OctokitInterface) =>
  async (repository: RepositoryDetails, details: PRDetails, baseBranch: string, automerge?: boolean) => {
    const currentPullRequest = await getExistingPullRequest(octokit)(repository)

    const pr = currentPullRequest
      ? await updatePullRequest(octokit)(repository, details, currentPullRequest.number)
      : await createPullRequest(octokit)(repository, details, baseBranch)

    if (automerge) {
      await mergePullRequest(octokit)(pr.data.number, repository)
    }
    return pr
  }

const updateBranch =
  (octokit: OctokitInterface) => async (newBranch: string, newCommit: string, repository: RepositoryDetails) => {
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

export const commitFiles =
  (octokit: OctokitInterface) => async (repository: RepositoryDetails, version: string, templates: Template[]) => {
    console.debug('Fetching base branch.')
    const {
      data: { default_branch: baseBranch },
    } = await octokit.repos.get({ ...repository })
    console.debug(`Fetching base branch ref 'heads/${baseBranch}'.`)
    const {
      data: {
        object: { sha: baseBranchRef },
      },
    } = await octokit.git.getRef({ ...repository, ref: `heads/${baseBranch}` })

    const {
      object: { sha: newBranch },
    } = await getOrCreateNewBranch(octokit)(repository, baseBranchRef)

    console.debug('Determining current commit.')
    const currentCommit = await octokit.git.getCommit({ ...repository, commit_sha: baseBranchRef })

    console.debug(`Using base branch '${baseBranch}'.`)
    console.debug(`Using base commit '${currentCommit.data.sha}'.`)

    const prDetails = {
      title: 'Update templates based on repository configuration',
      description: generatePullRequestDescription(version, templates),
    }

    const createdTree = await createTreeWithChanges(octokit)(templates, repository)(baseBranchRef)
    const {
      data: { sha: newCommit },
    } = await createCommitWithChanges(octokit)(repository, prDetails.title)(currentCommit, createdTree)
    const updatedRef = await updateBranch(octokit)(newBranch, newCommit, repository)
    console.debug(`Updated branch ref: ${updatedRef}`)

    const {
      data: { number },
    } = await maintainPullRequest(octokit)(repository, prDetails, baseBranch)

    return number
  }
