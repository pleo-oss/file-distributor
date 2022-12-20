import { Logger } from 'probot'
import { OctokitInstance, PRDetails, RepositoryDetails, Template } from './types'

const baseBranchName = 'centralized-templates'
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`
import { RequestError } from '@octokit/request-error'

export const git = (log: Logger, octokit: Pick<OctokitInstance, 'pulls' | 'repos' | 'git' | 'issues'>) => {
  const getCommitFiles = async (repository: RepositoryDetails, sha: string) => {
    const commit = await octokit.repos.getCommit({
      ...repository,
      ref: sha,
    })
    log.debug('Fetched commit: %o', commit)

    const {
      data: { files },
    } = commit

    const filenames = files?.map(f => f.filename) ?? []
    log.debug('Saw changed files in commit %s: %s', sha, filenames.join(','))

    return filenames
  }

  const getFilesChanged = async (repository: RepositoryDetails, pullRequestNumber: number) => {
    log.debug('Fetching files changed for PR #%d.', pullRequestNumber)
    const { data: filesChanged } = await octokit.pulls.listFiles({
      ...repository,
      pull_number: pullRequestNumber,
    })
    const filenames = filesChanged.map(file => file.filename)

    log.debug('Saw files changed in #%d: %s', pullRequestNumber, filenames.join(','))
    return filenames
  }

  const createBranchIfMissing = async (repository: RepositoryDetails, baseBranchRef: string) => {
    try {
      await octokit.git.getRef({ ...repository, ref: reducedBranchName })
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) {
        const newBranch = (await octokit.git.createRef({ ...repository, ref: fullBranchName, sha: baseBranchRef })).data
        log.debug("Created new branch with ref: '%s'.", newBranch.ref)
        return
      }
      throw error
    }
  }

  const createTreeWithChanges = async (templates: Template[], repository: RepositoryDetails, baseTree: string) => {
    log.debug('Creating git tree with modified templates.')
    const templateTree = templates.map(template => ({
      path: template.destinationPath,
      mode: '100644' as const,
      type: 'blob' as const,
      content: template.contents,
    }))
    const {
      data: { sha: createdTreeSha },
    } = await octokit.git.createTree({
      ...repository,
      base_tree: baseTree,
      tree: templateTree,
    })
    log.debug("Created git tree with SHA '%s'.", createdTreeSha)

    return createdTreeSha
  }

  const createCommitWithChanges = async (
    repository: RepositoryDetails,
    title: string,
    currentCommitSha: string,
    createdTreeSha: string,
  ) => {
    log.debug('Creating git commit with modified templates.')

    const {
      data: { sha: newCommitSha },
    } = await octokit.git.createCommit({
      ...repository,
      message: title,
      tree: createdTreeSha,
      parents: [currentCommitSha],
    })
    log.debug("Created git commit with SHA '%s.'", newCommitSha)

    return newCommitSha
  }

  const createPullRequest = async (repository: RepositoryDetails, details: PRDetails, baseBranch: string) => {
    const { title, description } = details

    log.debug('Creating PR.')
    const {
      data: { number },
    } = await octokit.pulls.create({
      ...repository,
      title,
      body: description,
      head: fullBranchName,
      base: baseBranch,
    })

    log.debug('Created PR #%d.', number)

    const labels = process.env['LABELS_TO_ADD']
    if (!labels) return number

    const asList = labels.split(',')
    try {
      const added = await octokit.issues.setLabels({ ...repository, issue_number: number, labels: asList })
      log.debug("Set label(s) '%o' on #%d.", added, number)
    } catch (e) {
      log.error('Failed to set labels on #%d: %o', number, e)
    }

    return number
  }

  const updatePullRequest = async (repository: RepositoryDetails, details: PRDetails, prNumber: number) => {
    const { title, description } = details

    log.debug('Updating PR #%d.', prNumber)
    const {
      data: { number },
    } = await octokit.pulls.update({
      ...repository,
      pull_number: prNumber,
      head: fullBranchName,
      body: description,
      title: title,
      state: 'open',
    })
    log.debug('Updated PR #%d.', number)

    return number
  }

  const getExistingPullRequest = async (repository: RepositoryDetails) => {
    const { data: openPullRequests } = await octokit.pulls.list({
      ...repository,
      head: `${repository.owner}:${baseBranchName}`,
      state: 'open',
    })
    log.debug('Found %s open PRs.', openPullRequests.length)

    const toUpdate = openPullRequests.sort(pr => pr.number).shift()

    return toUpdate
  }

  const mergePullRequest = async (number: number, repository: RepositoryDetails) => {
    log.debug('Attempting automerge of PR #%d.', number)
    const merged = await octokit.pulls.merge({
      ...repository,
      pull_number: number,
      merge_method: 'squash',
    })
    log.debug('Merged PR #%d.', number)

    return merged
  }

  const createOrUpdatePullRequest = async (
    repository: RepositoryDetails,
    details: PRDetails,
    baseBranch: string,
    automerge?: boolean,
  ) => {
    const currentPullRequest = await getExistingPullRequest(repository)

    const pr = currentPullRequest
      ? await updatePullRequest(repository, details, currentPullRequest.number)
      : await createPullRequest(repository, details, baseBranch)

    if (automerge) {
      await mergePullRequest(pr, repository)
    }
    return pr
  }

  const updateBranch = async (newCommit: string, repository: RepositoryDetails) => {
    log.debug("Setting new branch ref '%s' to commit '%s'.", baseBranchName, newCommit)
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

  const generatePullRequestDescription = (version: string, filenames: string[]) => {
    const bullets = filenames.map(f => `- \`${f}\``).join('\n')

    return `
  Template version: \`${version}\`

  ---
  
  This will update templates based on the current repository configuration.
  
  ---
  
  This updates:

  ${bullets}
  `
  }

  const extractBranchInformation = async (repository: RepositoryDetails) => {
    log.debug("Fetching base branch ref 'heads/%s'.", repository.defaultBranch)
    const {
      data: {
        object: { sha: baseBranchLastCommitSha },
      },
    } = await octokit.git.getRef({ ...repository, ref: `heads/${repository.defaultBranch}` })

    await createBranchIfMissing(repository, baseBranchLastCommitSha)

    return baseBranchLastCommitSha
  }

  const getChangesBetweenBranches = async (
    updatedBranch: string,
    baseBranch: string,
    repository: RepositoryDetails,
  ) => {
    const {
      data: { files },
    } = await octokit.repos.compareCommits({ ...repository, head: updatedBranch, base: baseBranch })

    const filenames = files?.map(f => f.filename) ?? []
    return filenames
  }

  const commitFilesToPR = async (
    repository: RepositoryDetails,
    version: string,
    templates: Template[],
  ): Promise<number | undefined> => {
    const baseBranchLastCommitSha = await extractBranchInformation(repository)

    const title = 'Update templates based on repository configuration'

    const createdTree = await createTreeWithChanges(templates, repository, baseBranchLastCommitSha)
    const newCommit = await createCommitWithChanges(repository, title, baseBranchLastCommitSha, createdTree)
    const updatedRef = await updateBranch(newCommit, repository)

    const changes = await getChangesBetweenBranches(newCommit, repository.defaultBranch, repository)
    if (changes.length === 0) return undefined

    log.debug("Updated branch ref: '%s'", updatedRef)

    const prDetails = {
      title,
      description: generatePullRequestDescription(version, changes),
    }

    return createOrUpdatePullRequest(repository, prDetails, repository.defaultBranch)
  }

  const commentOnPullRequest = async (
    repository: RepositoryDetails,
    pullRequestNumber: number,
    checkId: number,
    result: 'failure' | 'success',
  ) => {
    log.debug('Creating review comment on PR #%d.', pullRequestNumber)
    const invalidBody = `🤖 It looks like your template changes are invalid.\nYou can see the error report [here](https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}/checks?check_run_id=${checkId})`
    const validBody = '🤖 Well done! The configuration is valid.'
    const wasSuccessful = result === 'success'
    const {
      data: { id },
    } = await octokit.pulls.createReviewComment({
      ...repository,
      pull_number: pullRequestNumber,
      body: wasSuccessful ? validBody : invalidBody,
    })

    log.debug("Created review comment '%d'.", id)
    return id
  }

  return {
    commitFilesToPR,
    getCommitFiles,
    getFilesChanged,
    commentOnPullRequest,
  }
}
