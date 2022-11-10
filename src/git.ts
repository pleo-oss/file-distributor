import { Logger } from 'probot'
import { OctokitInstance, PRDetails, RepositoryDetails, Template, ValidationError } from './types'

const baseBranchName = 'centralized-templates'
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`

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

  const getOrCreateNewBranch = async (repository: RepositoryDetails, baseBranchRef: string) => {
    try {
      log.debug("Creating new branch on SHA: '%s'.", baseBranchRef)
      const newBranch = (await octokit.git.createRef({ ...repository, ref: fullBranchName, sha: baseBranchRef })).data
      log.debug("Created new branch with ref: '%s'.", newBranch.ref)

      const {
        object: { sha },
      } = newBranch

      return sha
    } catch {
      log.debug("Failed to create a new branch with ref: '%s'.", fullBranchName)
      log.debug("Fetching existing branch with ref: '%s'.", reducedBranchName)

      const { data: foundBranch } = await octokit.git.getRef({ ...repository, ref: reducedBranchName })
      log.debug("Found new branch with ref: '%s'.", foundBranch.ref)

      const {
        object: { sha },
      } = foundBranch

      return sha
    }
  }

  const createTreeWithChanges = async (templates: Template[], repository: RepositoryDetails, treeSha: string) => {
    const templateTree = templates.map(template => ({
      path: template.destinationPath,
      mode: '100644',
      type: 'blob',
      content: template.contents,
    }))

    log.debug("Fetching existing trees from '%s'.", treeSha)
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
      log.error('Failed to set labels on #%d', number)
    }

    return number
  }

  const updatePullRequest = async (repository: RepositoryDetails, details: PRDetails, number: number) => {
    const { title, description } = details

    log.debug('Updating PR #%d.', number)
    const {
      data: { number: updated },
    } = await octokit.pulls.update({
      ...repository,
      pull_number: number,
      head: fullBranchName,
      body: description,
      title: title,
      state: 'open',
    })
    log.debug('Updated PR #%d.', updated)

    return updated
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

  const maintainPullRequest = async (
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

  const updateBranch = async (newBranch: string, newCommit: string, repository: RepositoryDetails) => {
    log.debug("Setting new branch ref '%s' to commit '%s'.", newBranch, newCommit)
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
  Template version: \`${version}\`

  ---
  
  This will update templates based on the current repository configuration.
  
  ---
  
  This updates:

  ${stringifiedTemplateNames}
  `
  }

  const extractBranchInformation = async (repository: RepositoryDetails) => {
    log.debug('Fetching base branch.')
    const {
      data: { default_branch: baseBranch },
    } = await octokit.repos.get({ ...repository })
    log.debug("Using base branch '%s'.", baseBranch)

    log.debug("Fetching base branch ref 'heads/%s'.", baseBranch)
    const {
      data: {
        object: { sha: baseBranchRef },
      },
    } = await octokit.git.getRef({ ...repository, ref: `heads/${baseBranch}` })

    const newBranch = await getOrCreateNewBranch(repository, baseBranchRef)

    log.debug('Determining current commit.')
    const {
      data: { sha: currentCommitSha },
    } = await octokit.git.getCommit({ ...repository, commit_sha: baseBranchRef })

    log.debug("Using base commit '%s'.", currentCommitSha)

    return { baseBranch, currentCommitSha, newBranch, baseBranchRef }
  }

  const commitFiles = async (repository: RepositoryDetails, version: string, templates: Template[]) => {
    const { baseBranch, currentCommitSha, newBranch, baseBranchRef } = await extractBranchInformation(repository)

    const prDetails = {
      title: 'Update templates based on repository configuration',
      description: generatePullRequestDescription(version, templates),
    }

    const createdTree = await createTreeWithChanges(templates, repository, baseBranchRef)
    const newCommit = await createCommitWithChanges(repository, prDetails.title, currentCommitSha, createdTree)
    const updatedRef = await updateBranch(newBranch, newCommit, repository)
    log.debug("Updated branch ref: '%s'", updatedRef)

    return await maintainPullRequest(repository, prDetails, baseBranch)
  }

  const requestPullRequestChanges = async (
    repository: RepositoryDetails,
    pullRequestNumber: number,
    configFileName: string,
    errors: ValidationError[],
  ) => {
    const errorsWithoutLine = errors.filter(e => !e.line)

    const comments = errors
      .filter(e => e.line)
      .map(e => ({
        path: configFileName,
        body: `\`${e.message}\`` ?? '',
        line: e.line,
      }))

    let body = `🤖 It looks like your template changes are invalid.\n\n`

    if (errorsWithoutLine) {
      body = body.concat(`There were the following errors:
        ${errorsWithoutLine.map(e => `- \`${e.message}\``).join('\n')}`)
    }

    body = body.concat('\n\nCheck the PR comments for any additional errors.')

    log.debug('Creating change request review on PR #%d.', pullRequestNumber)
    const {
      data: { id },
    } = await octokit.pulls.createReview({
      ...repository,
      pull_number: pullRequestNumber,
      event: 'REQUEST_CHANGES',
      body,
      comments,
    })

    log.debug("Created change request review '%d'.", id)

    return id
  }

  const approvePullRequestChanges = async (repository: RepositoryDetails, pullRequestNumber: number) => {
    const body = '🤖 Well done!'
    log.debug('Creating approved review on PR #%d.', pullRequestNumber)
    const {
      data: { id },
    } = await octokit.pulls.createReview({
      ...repository,
      pull_number: pullRequestNumber,
      event: 'APPROVE',
      body,
    })
    log.debug("Created approved review '%d'.", id)

    return id
  }

  return {
    approvePullRequestChanges,
    commitFiles,
    getCommitFiles,
    getFilesChanged,
    requestPullRequestChanges,
  }
}
