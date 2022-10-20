import { Logger } from 'probot'
import { OctokitInstance, PRDetails, RepositoryDetails, Template } from './types'

const baseBranchName = 'centralized-templates'
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`

export const getCommitFiles =
  (repository: RepositoryDetails, sha: string) => (log: Logger) => async (octokit: Pick<OctokitInstance, 'repos'>) => {
    const commit = await octokit.repos.getCommit({
      ...repository,
      ref: sha,
    })
    log.debug('Fetched commit:')
    log.debug(commit)
    const {
      data: { files },
    } = commit

    const filenames = files?.map(f => f.filename) ?? []
    log.debug(`Saw changed files in ${sha}:`)
    log.debug(filenames)

    return filenames
  }

export const getFilesChanged =
  (repository: RepositoryDetails, pullRequestNumber: number) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    log.debug(`Fetching files changed for PR #${pullRequestNumber}.`)
    const { data: filesChanged } = await octokit.pulls.listFiles({
      ...repository,
      pull_number: pullRequestNumber,
    })
    const filenames = filesChanged.map(file => file.filename)
    log.debug(`Saw files changed in #${pullRequestNumber}:`)
    log.debug(filenames)
    return filenames
  }

const getOrCreateNewBranch =
  (repository: RepositoryDetails, baseBranchRef: string) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'git'>) => {
    try {
      log.debug(`Creating new branch on SHA: '${baseBranchRef}'.`)
      const newBranch = (await octokit.git.createRef({ ...repository, ref: fullBranchName, sha: baseBranchRef })).data
      log.debug(`Created new branch with ref: '${newBranch.ref}'.`)

      const {
        object: { sha },
      } = newBranch

      return sha
    } catch {
      log.debug(`Failed to create a new branch with ref: '${fullBranchName}'.`)
      log.debug(`Fetching existing branch with ref: '${reducedBranchName}'.`)

      const { data: foundBranch } = await octokit.git.getRef({ ...repository, ref: reducedBranchName })
      log.debug(`Found new branch with ref: '${foundBranch.ref}'.`)

      const {
        object: { sha },
      } = foundBranch

      return sha
    }
  }

const createTreeWithChanges =
  (templates: Template[], repository: RepositoryDetails, treeSha: string) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'git'>) => {
    const templateTree = templates.map(template => ({
      path: template.destinationPath,
      mode: '100644',
      type: 'blob',
      content: template.contents,
    }))

    log.debug(`Fetching existing trees from '${treeSha}'.`)
    const {
      data: { tree: existingTree },
    } = await octokit.git.getTree({ ...repository, tree_sha: treeSha })

    log.debug('Creating git tree with modified templates.')
    const {
      data: { sha: createdTreeSha },
    } = await octokit.git.createTree({
      ...repository,
      tree: [...templateTree, ...existingTree] as [],
    })
    log.debug(`Created git tree with SHA '${createdTreeSha}'.`)

    return createdTreeSha
  }

const createCommitWithChanges =
  (repository: RepositoryDetails, title: string, currentCommitSha: string, createdTreeSha: string) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'git'>) => {
    log.debug('Creating git commit with modified templates.')

    const {
      data: { sha: newCommitSha },
    } = await octokit.git.createCommit({
      ...repository,
      message: title,
      tree: createdTreeSha,
      parents: [currentCommitSha],
    })
    log.debug(`Created git commit with SHA '${newCommitSha}'.`)

    return newCommitSha
  }

const createPullRequest =
  (repository: RepositoryDetails, details: PRDetails, baseBranch: string) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const { title, description } = details

    log.debug('Creating PR.')
    const created = await octokit.pulls.create({
      ...repository,
      title,
      body: description,
      head: fullBranchName,
      base: baseBranch,
    })
    log.debug(`Created PR #${created.data.number}.`)

    return created
  }

const updatePullRequest =
  (repository: RepositoryDetails, details: PRDetails, number: number) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const { title, description } = details

    log.debug(`Updating PR #${number}.`)
    const updated = await octokit.pulls.update({
      ...repository,
      pull_number: number,
      head: fullBranchName,
      body: description,
      title: title,
      state: 'open',
    })
    log.debug(`Updated PR #${updated.data.number}.`)

    return updated
  }

const getExistingPullRequest =
  (repository: RepositoryDetails) => (log: Logger) => async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const { data: openPullRequests } = await octokit.pulls.list({
      ...repository,
      head: `${repository.owner}:${baseBranchName}`,
      state: 'open',
    })
    log.debug(`Found ${openPullRequests.length} open PRs.`)

    const toUpdate = openPullRequests.sort(pr => pr.number).shift()

    return toUpdate
  }

const mergePullRequest =
  (number: number, repository: RepositoryDetails) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    log.debug(`Attempting automerge of PR #${number}.`)
    const merged = await octokit.pulls.merge({
      ...repository,
      pull_number: number,
      merge_method: 'squash',
    })
    log.debug(`Merged PR #${number}.`)

    return merged
  }

const maintainPullRequest =
  (repository: RepositoryDetails, details: PRDetails, baseBranch: string, automerge?: boolean) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const currentPullRequest = await getExistingPullRequest(repository)(log)(octokit)

    const pr = currentPullRequest
      ? await updatePullRequest(repository, details, currentPullRequest.number)(log)(octokit)
      : await createPullRequest(repository, details, baseBranch)(log)(octokit)

    if (automerge) {
      await mergePullRequest(pr.data.number, repository)(log)(octokit)
    }
    const {
      data: { number: prNumber },
    } = pr
    return prNumber
  }

const updateBranch =
  (newBranch: string, newCommit: string, repository: RepositoryDetails) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'git'>) => {
    log.debug(`Setting new branch ref '${newBranch}' to commit '${newCommit}'.`)
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
  const stringifiedTemplateNames = templates.map(t => `- \`${t.destinationPath}\``).join('\n')

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
  (repository: RepositoryDetails) => (log: Logger) => async (octokit: Pick<OctokitInstance, 'repos' | 'git'>) => {
    log.debug('Fetching base branch.')
    const {
      data: { default_branch: baseBranch },
    } = await octokit.repos.get({ ...repository })
    log.debug(`Using base branch '${baseBranch}'.`)

    log.debug(`Fetching base branch ref 'heads/${baseBranch}'.`)
    const {
      data: {
        object: { sha: baseBranchRef },
      },
    } = await octokit.git.getRef({ ...repository, ref: `heads/${baseBranch}` })

    const newBranch = await getOrCreateNewBranch(repository, baseBranchRef)(log)(octokit)

    log.debug('Determining current commit.')
    const {
      data: { sha: currentCommitSha },
    } = await octokit.git.getCommit({ ...repository, commit_sha: baseBranchRef })

    log.debug(`Using base commit '${currentCommitSha}'.`)

    return { baseBranch, currentCommitSha, newBranch, baseBranchRef }
  }

export const commitFiles =
  (repository: RepositoryDetails, version: string, templates: Template[]) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'git' | 'repos' | 'pulls'>) => {
    const { baseBranch, currentCommitSha, newBranch, baseBranchRef } = await extractBranchInformation(repository)(log)(
      octokit,
    )

    const prDetails = {
      title: 'Update templates based on repository configuration',
      description: generatePullRequestDescription(version, templates),
    }

    const createdTree = await createTreeWithChanges(templates, repository, baseBranchRef)(log)(octokit)
    const newCommit = await createCommitWithChanges(repository, prDetails.title, currentCommitSha, createdTree)(log)(
      octokit,
    )
    const updatedRef = await updateBranch(newBranch, newCommit, repository)(log)(octokit)
    log.debug(`Updated branch ref: ${updatedRef}`)

    return await maintainPullRequest(repository, prDetails, baseBranch)(log)(octokit)
  }

export const requestPullRequestChanges =
  (repository: RepositoryDetails, pullRequestNumber: number, errors: (string | undefined)[]) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const body = `
🤖 It looks like your changes are invalid. 

Validating the changes in this PR resulted in the following errors: 
${errors.join('\n')}
`
    log.debug(`Creating change request review on PR #${pullRequestNumber}.`)
    const {
      data: { id },
    } = await octokit.pulls.createReview({
      ...repository,
      pull_number: pullRequestNumber,
      event: 'REQUEST_CHANGES',
      body,
    })
    log.debug(`Created change request review '${id}'.`)

    return id
  }

export const approvePullRequestChanges =
  (repository: RepositoryDetails, pullRequestNumber: number) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'pulls'>) => {
    const body = `🤖 Well done!`
    log.debug(`Creating approved review on PR #${pullRequestNumber}.`)
    const {
      data: { id },
    } = await octokit.pulls.createReview({
      ...repository,
      pull_number: pullRequestNumber,
      event: 'APPROVE',
      body,
    })
    log.debug(`Created approved review '${id}'.`)

    return id
  }
