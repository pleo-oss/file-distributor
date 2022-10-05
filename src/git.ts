import { Context, Probot } from 'probot'
import { PRDetails, RepositoryDetails, Template } from './types'

const baseBranchName = 'centralized-templates'
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`

const getOrCreateNewBranch =
  (app: Probot, context: Context<'push'>) => async (repository: RepositoryDetails, baseBranchRef: string) => {
    try {
      app.log.debug(`Creating new branch on SHA: '${baseBranchRef}'.`)
      const newBranch = (
        await context.octokit.git.createRef({ ...repository, ref: fullBranchName, sha: baseBranchRef })
      ).data
      app.log.debug(`Created new branch with ref: '${newBranch.ref}'.`)
      return newBranch
    } catch {
      app.log.debug(`Failed to create a new branch with ref: '${fullBranchName}'.`)
      app.log.debug(`Fetching existing branch with ref: '${reducedBranchName}'.`)

      const foundBranch = (await context.octokit.git.getRef({ ...repository, ref: reducedBranchName })).data
      app.log.debug(`Found new branch with ref: '${foundBranch.ref}'.`)
      app.log.debug(`Updating branch to match '${baseBranchRef}'.`)

      return foundBranch
    }
  }

const createTreeWithChanges =
  (app: Probot, context: Context<'push'>) =>
  (templates: Template[], repository: RepositoryDetails) =>
  async (treeSha: string) => {
    const templateTree = templates.map(template => ({
      path: template.path,
      mode: '100644',
      type: 'blob',
      content: template.contents,
    }))

    app.log.debug(`Fetching existing trees from '${treeSha}'.`)
    const {
      data: { tree: existingTree },
    } = await context.octokit.git.getTree({ ...repository, tree_sha: treeSha })

    app.log.debug('Creating git tree with modified templates.')
    const createdTree = await context.octokit.git.createTree({
      ...repository,
      tree: [...templateTree, ...existingTree] as [],
    })
    app.log.debug(`Created git tree with SHA '${createdTree.data.sha}'.`)

    return createdTree
  }

const createCommitWithChanges =
  (app: Probot, context: Context<'push'>) =>
  (repository: RepositoryDetails, title: string) =>
  async (currentCommit: { data: { sha: string } }, createdTree: { data: { sha: string } }) => {
    app.log.debug('Creating git commit with modified templates.')

    const newCommit = await context.octokit.git.createCommit({
      ...repository,
      message: title,
      tree: createdTree.data.sha,
      parents: [currentCommit.data.sha],
    })
    app.log.debug(`Created git commit with SHA '${newCommit.data.sha}'.`)

    return newCommit
  }

const createPullRequest =
  (app: Probot, context: Context<'push'>) =>
  async (repository: RepositoryDetails, details: PRDetails, baseBranch: string) => {
    const { title, description } = details

    app.log.debug('Creating PR.')
    const created = await context.octokit.pulls.create({
      ...repository,
      title,
      body: description,
      head: fullBranchName,
      base: baseBranch,
    })
    app.log.debug(`Created PR #${created.data.number}.`)

    return created
  }

const updatePullRequest =
  (app: Probot, context: Context<'push'>) => async (repository: RepositoryDetails, number: number) => {
    app.log.debug(`Updating PR #${number}.`)
    const updated = await context.octokit.pulls.update({
      ...repository,
      pull_number: number,
      head: fullBranchName,
      state: 'open',
    })
    app.log.debug(`Updated PR #${updated.data.number}.`)

    return updated
  }

const getExistingPullRequest = (app: Probot, context: Context<'push'>) => async (repository: RepositoryDetails) => {
  const { data: openPullRequests } = await context.octokit.pulls.list({
    ...repository,
    head: fullBranchName,
    state: 'open',
  })
  app.log.debug(`Found ${openPullRequests.length} open PRs.`)

  const toUpdate = openPullRequests.sort(pr => pr.number).shift()

  return toUpdate
}

const mergePullRequest =
  (app: Probot, context: Context<'push'>) => async (number: number, repository: RepositoryDetails) => {
    app.log.debug(`Attempting automerge of PR #${number}.`)
    const merged = await context.octokit.rest.pulls.merge({
      ...repository,
      pull_number: number,
      merge_method: 'squash',
    })
    app.log.debug(`Merged PR #${number}.`)

    return merged
  }

const maintainPullRequest =
  (app: Probot, context: Context<'push'>) =>
  async (repository: RepositoryDetails, details: PRDetails, baseBranch: string, automerge?: boolean) => {
    const currentPullRequest = await getExistingPullRequest(app, context)(repository)

    const pr = currentPullRequest
      ? await updatePullRequest(app, context)(repository, currentPullRequest.number)
      : await createPullRequest(app, context)(repository, details, baseBranch)

    if (automerge) {
      await mergePullRequest(app, context)(pr.data.number, repository)
    }
    return pr
  }

const updateBranch =
  (app: Probot, context: Context<'push'>) =>
  async (newBranch: string, newCommit: string, repository: RepositoryDetails) => {
    app.log.debug(`Setting new branch ref '${newBranch}' to commit '${newCommit}'.`)
    const {
      data: { ref: updatedRef },
    } = await context.octokit.git.updateRef({
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

export default (app: Probot, context: Context<'push'>) =>
  async (repository: RepositoryDetails, version: string, templates: Template[]) => {
    app.log.debug('Fetching base branch.')
    const {
      data: { default_branch: baseBranch },
    } = await context.octokit.repos.get({ ...repository })
    app.log.debug(`Fetching base branch ref 'heads/${baseBranch}'.`)
    const {
      data: {
        object: { sha: baseBranchRef },
      },
    } = await context.octokit.git.getRef({ ...repository, ref: `heads/${baseBranch}` })

    const {
      object: { sha: newBranch },
    } = await getOrCreateNewBranch(app, context)(repository, baseBranchRef)

    app.log.debug('Determining current commit.')
    const currentCommit = await context.octokit.git.getCommit({ ...repository, commit_sha: newBranch })

    app.log.debug(`Using base branch '${baseBranch}'.`)
    app.log.debug(`Using base commit '${currentCommit.data.sha}'.`)

    const prDetails = {
      title: 'Update templates based on repository configuration',
      description: generatePullRequestDescription(version, templates),
    }

    const createdTree = await createTreeWithChanges(app, context)(templates, repository)(baseBranchRef)
    const {
      data: { sha: newCommit },
    } = await createCommitWithChanges(app, context)(repository, prDetails.title)(currentCommit, createdTree)
    const updatedRef = await updateBranch(app, context)(newBranch, newCommit, repository)
    app.log.debug(`Updated branch ref: ${updatedRef}`)

    const {
      data: { number },
    } = await maintainPullRequest(app, context)(repository, prDetails, baseBranch)

    return number
  }
