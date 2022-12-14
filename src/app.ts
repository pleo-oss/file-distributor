import { CheckRunRerequestedEvent, PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { validation } from './validation'
import {
  extractCheckRunInformation,
  extractPullRequestInformation,
  extractRepositoryInformation,
} from './payload-extraction'
import { fileCreation } from './file-creation'
import 'dotenv/config'

const configFileName = process.env['TEMPLATE_FILE_PATH'] ? process.env['TEMPLATE_FILE_PATH'] : '.github/templates.yaml'

const processCheckRerequest = async (payload: CheckRunRerequestedEvent, context: Context<'check_run'>) => {
  const { log, octokit } = context
  const extracted = extractCheckRunInformation(payload)
  if (extracted === undefined) return
  const { number: prNumber, sha, repository, checkId } = extracted

  const repositoryLogger = log.child({ owner: repository.owner, repository: repository.repo })
  const { processCheck } = validation(repositoryLogger, octokit)

  await processCheck({ configFileName, prNumber, repository, sha, checkId })
}

const processPullRequest = async (payload: PullRequestEvent, context: Context<'pull_request'>) => {
  const { number: prNumber, sha, repository } = extractPullRequestInformation(payload)
  const { log, octokit } = context

  const repositoryLogger = log.child({ owner: repository.owner, repository: repository.repo })
  const { processCheck } = validation(repositoryLogger, octokit)

  await processCheck({ configFileName, prNumber, repository, sha })
}

const processPushEvent = async (payload: PushEvent, context: Context<'push'>) => {
  const { ref, after, deleted } = payload
  if (deleted) return

  const repository = extractRepositoryInformation(payload)
  const { log, octokit } = context
  const { owner, repo, defaultBranch } = repository
  const branchRegex = new RegExp(defaultBranch)

  log.info('%s event happened on %s', context.name, ref)
  if (!branchRegex.test(ref)) return

  const repositoryLogger = log.child({ owner, repository: repo })

  const { pushFiles } = fileCreation(repositoryLogger, octokit)
  await pushFiles(repository, after, configFileName)
}

export = async (app: Probot) => {
  const authenticated = await app.auth(Number(process.env.APP_ID))
  if (!authenticated) {
    app.log.error('The application is not installed with expected authentication.')
  }

  app.on('push', async (context: Context<'push'>) => {
    await processPushEvent(context.payload as PushEvent, context)
  })

  app.on('check_run.rerequested', async (context: Context<'check_run'>) => {
    await processCheckRerequest(context.payload as CheckRunRerequestedEvent, context)
  })

  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context: Context<'pull_request'>) => {
    await processPullRequest(context.payload as PullRequestEvent, context)
  })
}
