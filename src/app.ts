import 'dd-trace/init';
import { PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { config } from 'dotenv'
import { combineConfigurations, determineConfigurationChanges } from './configuration'
import { getTemplateDefaultValues, renderTemplates } from './templates'
import {
  approvePullRequestChanges,
  commitFiles,
  getCommitFiles,
  getFilesChanged,
  requestPullRequestChanges,
} from './git'
import { generateSchema, validateTemplateConfiguration } from './schema-validator'
import { createCheckRun, resolveCheckRun } from './checks'
config()

const configFileName = process.env['TEMPLATE_FILE_PATH'] ? process.env['TEMPLATE_FILE_PATH'] : '.github/templates.yaml'

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

  const updateCheck = async (checkId: number, result: boolean, errors: string[]) => {
    const conclusion = result ? 'success' : 'failure'

    const checkToResolve = {
      ...repository,
      sha: sha,
      conclusion: conclusion,
      checkRunId: checkId,
    }
    const checkConclusion = await resolveCheckRun(checkToResolve)(log)(octokit)

    if (!result) {
      const changeRequestId = await requestPullRequestChanges(repository, number, errors)(log)(octokit)
      log.debug(`Requested changes for PR #${number} in ${changeRequestId}.`)
    } else {
      const approvedReviewId = await approvePullRequestChanges(repository, number)(log)(octokit)
      log.debug(`Approved PR #${number} in ${approvedReviewId}.`)
    }

    return checkConclusion
  }

  const repository = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
  }
  const {
    number,
    pull_request: {
      head: { sha },
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
    const [checkId, configuration] = await Promise.all([
      createCheckRun(createCheckInput)(log)(octokit),
      determineConfigurationChanges(configFileName, repository, sha)(log)(octokit),
    ])

    const defaultValues = await getTemplateDefaultValues(configuration.version)(log)(octokit)
    const defaultValueSchema = generateSchema(defaultValues.values)(log)

    const combined = combineConfigurations(defaultValues, configuration)
    if (!combined) return

    const { result: configurationResult, errors: configurationErrors } = validateTemplateConfiguration(
      combined,
      defaultValueSchema,
    )(log)

    const configurationConclusion = await updateCheck(checkId, configurationResult, configurationErrors)
    log.info(`Validated configuration changes in #${number} with conclusion: ${configurationConclusion}.`)
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

    const filesChanged = await getCommitFiles(repository, payload.after)(log)(octokit)
    if (!filesChanged.includes(configFileName)) return

    const parsed = await determineConfigurationChanges(configFileName, repository, payload.after)(log)(octokit)
    const defaultValues = await getTemplateDefaultValues(parsed.version)(log)(octokit)

    const combined = combineConfigurations(defaultValues, parsed)
    if (!combined) return

    const { version, templates: processed } = await renderTemplates(combined)(log)(octokit)
    const pullRequestNumber = await commitFiles(repository, version, processed)(log)(octokit)
    log.info(`Committed templates to '${repository.owner}/${repository.repo}' in #${pullRequestNumber}`)
    log.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
  } catch (e: unknown) {
    throw new Error(`Failed to process commit '${payload.after}' with error: ${e}`)
  }
}

export = async (app: Probot) => {
  const authenticated = await app.auth(Number(process.env.APP_ID))
  if (!authenticated) {
    app.log.error('The application is not installed with expected authentication. Exiting.')
  }

  app.on('push', async (context: Context<'push'>) => {
    await processPushEvent(context.payload as PushEvent, context)
  })

  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context: Context<'pull_request'>) => {
    await processPullRequest(context.payload as PullRequestEvent, context)
  })
}
