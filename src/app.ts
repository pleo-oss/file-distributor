import { PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { config } from 'dotenv'
import { determineConfigurationChanges } from './configuration'
import { renderTemplates } from './templates'
import {
  approvePullRequestChanges,
  commitFiles,
  getCommitFiles,
  getFilesChanged,
  requestPullRequestChanges,
} from './git'
import { validateTemplateConfiguration } from './schema-validator'
import { createCheckRun, resolveCheckRun } from './checks'

const configFileName = '.config/templates.yaml'

const extractRepositoryInformation = (payload: PushEvent) => {
  const {
    repository: {
      owner: { login },
      name,
      default_branch,
    },
  } = payload

  return {
    owner: login,
    repo: name,
    defaultBranch: default_branch,
  }
}

const processPullRequest = async (payload: PullRequestEvent, context: Context<'pull_request'>) => {
  const { log, octokit } = context

  const repository = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
  }
  const {
    number,
    pull_request: {
      head: { ref, sha },
    },
  } = payload

  log.info(`Pull request event happened on #${number}`)

  try {
    const filesChanged = await getFilesChanged(repository, number)(log)(octokit)
    const configFile = filesChanged.find(filename => filename === configFileName)

    if (!configFile) return

    log.debug(`Found repository configuration file: ${configFile}.`)

    const createCheckInput = {
      ...repository,
      sha: sha,
    }

    const checkId = await createCheckRun(createCheckInput)(log)(octokit)

    const fileContent = await octokit.repos.getContent({
      ...repository,
      path: configFile,
      ref,
    })

    const { content } = fileContent.data as { content: string }
    const decodedContent = Buffer.from(content, 'base64').toString()
    log.debug(`Saw configuration file contents:`)
    log.debug(decodedContent)
    const { result, errors } = validateTemplateConfiguration(decodedContent)(log)
    const conclusion = result ? 'success' : 'failure'

    const checkToResolve = {
      ...repository,
      sha: sha,
      conclusion: conclusion,
      checkRunId: checkId,
    }
    const checkConclusion = resolveCheckRun(checkToResolve)(log)(octokit)

    if (!result) {
      const changeRequestId = await requestPullRequestChanges(repository, number, errors)(log)(octokit)
      log.debug(`Requested changes for PR #${number} in ${changeRequestId}.`)
    } else {
      const approvedReviewId = await approvePullRequestChanges(repository, number)(log)(octokit)
      log.debug(`Approved PR #${number} in ${approvedReviewId}.`)
    }

    log.info(`Validated configuration changes in #${number} with conclusion: ${checkConclusion}.`)
  } catch (error) {
    log.error(`Failed to process PR #${number}' with error:`)
    log.error(error as never)
  }
}

const processPushEvent = async (payload: PushEvent, context: Context<'push'>) => {
  const { octokit } = context
  const { log } = context

  log.info(`${context.name} event happened on '${payload.ref}'`)

  try {
    const repository = extractRepositoryInformation(payload)
    const branchRegex = new RegExp(repository.defaultBranch)

    if (!branchRegex.test(payload.ref)) return

    log.info(`Processing changes made to ${repository.owner}/${repository.repo} in ${payload.after}.`)

    const configFileName = `.config/templates.yaml`
    const filesChanged = await getCommitFiles(repository, payload.after)(log)(octokit)

    if (filesChanged.includes(configFileName)) {
      const parsed = await determineConfigurationChanges(configFileName, repository, payload.after)(log)(octokit)
      const { version, templates: processed } = await renderTemplates(parsed)(log)(octokit)
      const pullRequestNumber = await commitFiles(repository, version, processed)(log)(octokit)
      log.info(`Committed templates to '${repository.owner}/${repository.repo}' in #${pullRequestNumber}`)
      log.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
    }
  } catch (e: unknown) {
    log.error(`Failed to process commit '${payload.after}' with error:`)
    log.error(e as never)
  }
}

export = async (app: Probot) => {
  config()

  const authenticated = await app.auth(Number(process.env.APP_ID))
  if (!authenticated) {
    app.log.error('The application is not installed with expected authentication. Exiting.')
  }

  app.on('push', async (context: Context<'push'>) => {
    await processPushEvent(context.payload as PushEvent, context)
  })

  app.on('pull_request', async (context: Context<'pull_request'>) => {
    await processPullRequest(context.payload as PullRequestEvent, context)
  })
}
