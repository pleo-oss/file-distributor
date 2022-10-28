import { Logger } from 'probot'
import { OctokitInstance, PRDetails, RepositoryDetails, Template } from './types'

const baseBranchName = 'centralized-templates'
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`

export const git = (log: Logger, octokit: Pick<OctokitInstance, 'pulls' | 'repos' | 'git'>) => {
  const getCommitFiles = async (repository: RepositoryDetails, sha: string) => {
    const { owner, repo } = repository
    const commit = await octokit.repos.getCommit({
      owner,
      repo,
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

  const getOrCreateNewBranch = async (repository: RepositoryDetails, baseBranchRef: string, branchName?: string) => {
    try {
      log.debug("Creating new branch on SHA: '%s'.", baseBranchRef)
      const newBranch = (
        await octokit.git.createRef({ ...repository, ref: branchName ?? fullBranchName, sha: baseBranchRef })
      ).data
      log.debug("Created new branch with ref: '%s'.", newBranch.ref)

      const {
        object: { sha },
      } = newBranch

      return sha
    } catch {
      log.debug("Failed to create a new branch with ref: '%s'.", fullBranchName)
      log.debug("Fetching existing branch with ref: '%s'.", reducedBranchName)

      const { data: foundBranch } = await octokit.git.getRef({ ...repository, ref: branchName ?? reducedBranchName })
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

    return number
  }

  const updatePullRequest = async (repository: RepositoryDetails, details: PRDetails, number: number) => {
    const { title, description } = details

    log.debug('Updating PR #%d.', number)
    const {
      data: { number: updatedNumber },
    } = await octokit.pulls.update({
      ...repository,
      pull_number: number,
      head: fullBranchName,
      body: description,
      title: title,
      state: 'open',
    })
    log.debug('Updated PR #%d.', updatedNumber)

    return updatedNumber
  }

  const getExistingPullRequest = async (
    repository: RepositoryDetails,
    branchName?: string,
    state?: 'open' | 'closed' | 'all',
  ) => {
    const { data: openPullRequests } = await octokit.pulls.list({
      ...repository,
      head: `${repository.owner}:${branchName ?? baseBranchName}`,
      state: state ?? 'open',
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

  const extractBranchInformation = async (repository: RepositoryDetails, branchName?: string) => {
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

    const newBranch = await getOrCreateNewBranch(repository, baseBranchRef, branchName)

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

  const baseConfigurationDescription = `
  🤖 It looks like this repository is not configured for template distribution.
  
  ---
  
  This PR creates a repository configuration for you. 
  If you do not wish to configure the repository, close this PR and I will leave the repository alone going forward.
  `

  const createBaseConfiguration = async (repository: RepositoryDetails, version: string, configurationPath: string) => {
    const branchName = 'templates/create-configuration'
    const { baseBranch, currentCommitSha, newBranch, baseBranchRef } = await extractBranchInformation(
      repository,
      branchName,
    )

    const existingPullRequests = await getExistingPullRequest(repository, branchName, 'all')
    if (existingPullRequests) return undefined

    const prDetails = {
      title: 'Update templates based on repository configuration',
      description: baseConfigurationDescription,
    }

    const baseConfiguration: Template[] = [
      { contents: `version: ${version}`, sourcePath: '', destinationPath: configurationPath },
    ]

    const createdTree = await createTreeWithChanges(baseConfiguration, repository, baseBranchRef)
    const newCommit = await createCommitWithChanges(repository, prDetails.title, currentCommitSha, createdTree)
    const updatedRef = await updateBranch(newBranch, newCommit, repository)
    log.debug("Updated branch ref: '%s'", updatedRef)

    return await maintainPullRequest(repository, prDetails, baseBranch)
  }

  const requestPullRequestChanges = async (
    repository: RepositoryDetails,
    pullRequestNumber: number,
    errors: (string | undefined)[],
  ) => {
    const body = `
🤖 It looks like your changes are invalid. 

Validating the changes in this PR resulted in the following errors: 

${errors.map(error => `- ${error}`).join('\n')}
`
    log.debug('Creating change request review on PR #%d.', pullRequestNumber)
    const {
      data: { id },
    } = await octokit.pulls.createReview({
      ...repository,
      pull_number: pullRequestNumber,
      event: 'REQUEST_CHANGES',
      body,
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

  const getDefaultBranchContents = async (repository: RepositoryDetails, path: string) => {
    const { owner, repo } = repository
    log.debug('Fetching repository contents for %s/%s', owner, repo)
    try {
      const contents = await octokit.repos.getContent({ ...repository, path })
      log.debug('Found contents at %s for %s/%s', path, owner, repo)
      return contents
    } catch (e) {
      return undefined
    }
  }

  return {
    approvePullRequestChanges,
    commitFiles,
    getCommitFiles,
    getFilesChanged,
    requestPullRequestChanges,
    getDefaultBranchContents,
    createBaseConfiguration,
  }
}
