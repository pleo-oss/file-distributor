import { CheckRunRerequestedEvent, PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { configuration } from './configuration'
import { templates } from './templates'
import * as E from 'fp-ts/Either'
import { git } from './git'
import 'dotenv/config'
import { processCheckRun } from './core-validation'

const configFileName = process.env['TEMPLATE_FILE_PATH'] ? process.env['TEMPLATE_FILE_PATH'] : '.github/templates.yaml'

const isBranchRemoved = (context: Context<'push'>) => {
  return context.payload.deleted
}

const extractRepositoryInformation = (payload: PushEvent) => {
  const {
    repository: {
      owner: { login },
      name,
      default_branch,
    },
  } = payload

  return { owner: login, repo: name, defaultBranch: default_branch }
}

const extractPullRequestInformation = (payload: PullRequestEvent) => {
  const {
    number,
    pull_request: {
      head: { sha },
    },
    repository: {
      owner: { login },
      name,
      default_branch,
    },
  } = payload

  return {
    number,
    sha,
    repository: {
      owner: login,
      repo: name,
      defaultBranch: default_branch,
    },
  }
}

const extractCheckRunInformation = (payload: CheckRunRerequestedEvent) => {
  const {
    check_run: { pull_requests, id },
    repository,
  } = payload

  if (pull_requests.length != 1) return undefined
  return {
    number: pull_requests[0].number,
    sha: pull_requests[0].head.sha,
    checkId: id,
    repository: {
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
    },
  }
}

const processCheckRerun = async (payload: CheckRunRerequestedEvent, context: Context<'check_run'>) => {
  const extracted = extractCheckRunInformation(payload)
  if (extracted === undefined) return
  const { number: prNumber, sha, repository, checkId } = extracted

  const { log, octokit } = context
  const enrichedWithRepoLog = log.child({ owner: repository.owner, repository: repository.repo })

  await processCheckRun(enrichedWithRepoLog, octokit, configFileName, prNumber, repository, sha, checkId)
}

const processPullRequest = async (payload: PullRequestEvent, context: Context<'pull_request'>) => {
  const { number: prNumber, sha, repository } = extractPullRequestInformation(payload)
  const { log, octokit } = context
  const enrichedWithRepoLog = log.child({ owner: repository.owner, repository: repository.repo })

  await processCheckRun(enrichedWithRepoLog, octokit, configFileName, prNumber, repository, sha)
}

const processPushEvent = async (payload: PushEvent, context: Context<'push'>) => {
  const repository = extractRepositoryInformation(payload)
  const { log, octokit } = context
  const { commitFilesToPR, getCommitFiles } = git(log, octokit)

  const enrichedWithRepoLog = log.child({ owner: repository.owner, repository: repository.repo })
  const { combineConfigurations, determineConfigurationChanges } = configuration(enrichedWithRepoLog, octokit)
  const { getTemplateInformation, renderTemplates } = templates(enrichedWithRepoLog, octokit)

  const branchRegex = new RegExp(repository.defaultBranch)

  log.info('%s event happened on %s', context.name, payload.ref)

  if (!branchRegex.test(payload.ref)) return

  log.info('Processing changes made in commit %s.', payload.after)

  const filesChanged = await getCommitFiles(repository, payload.after)
  if (!filesChanged.includes(configFileName)) return

  const either = await determineConfigurationChanges(configFileName, repository, payload.after)

  if (E.isLeft(either)) return
  const parsed = either.right

  const { configuration: defaultValues } = await getTemplateInformation(parsed.repositoryConfiguration.version)

  const combined = combineConfigurations(defaultValues, parsed.repositoryConfiguration)
  if (!combined) return

  const { version, templates: processed } = await renderTemplates(combined)
  const pullRequestNumber = await commitFilesToPR(repository, version, processed)

  if (!pullRequestNumber) {
    log.info('Commit leads to no changes.')
    log.info('Skipped PR creation.')
  }

  log.info('Committed templates to %s/%s in #%d', repository.owner, repository.repo, pullRequestNumber)
  log.info('See: https://github.com/%s/%s/pull/%d', repository.owner, repository.repo, pullRequestNumber)
}

export = async (app: Probot) => {
  const authenticated = await app.auth(Number(process.env.APP_ID))
  if (!authenticated) {
    app.log.error('The application is not installed with expected authentication. Exiting.')
  }

  app.on('push', async (context: Context<'push'>) => {
    if (isBranchRemoved(context)) {
      context.log.debug('Push event after branch removal - ignoring.')
      return
    }
    await processPushEvent(context.payload as PushEvent, context)
  })

  app.on('check_run.rerequested', async (context: Context<'check_run'>) => {
    await processCheckRerun(context.payload as CheckRunRerequestedEvent, context)
  })

  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context: Context<'pull_request'>) => {
    await processPullRequest(context.payload as PullRequestEvent, context)
  })
}
