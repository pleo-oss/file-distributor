import { PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { config } from 'dotenv'
import { configuration } from './configuration'
import { templates } from './templates'
import { git } from './git'
import { schemaValidator } from './schema-validator'
import { checks } from './checks'
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

  const { approvePullRequestChanges, getFilesChanged, requestPullRequestChanges } = git(log, octokit)
  const { validateTemplateConfiguration, generateSchema } = schemaValidator(log)
  const { createCheckRun, resolveCheckRun } = checks(log, octokit)
  const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
  const { getTemplateDefaultValues } = templates(log, octokit)

  const createCheck = async (result: boolean, errors: string[]) => {
    const conclusion = result ? 'success' : 'failure'

    const createCheckInput = {
      ...repository,
      sha: sha,
    }

    const checkId = await createCheckRun(createCheckInput)

    const checkToResolve = {
      ...repository,
      sha: sha,
      conclusion: conclusion,
      checkRunId: checkId,
    }
    const checkConclusion = await resolveCheckRun(checkToResolve)

    if (!result) {
      const changeRequestId = await requestPullRequestChanges(repository, number, errors)
      log.debug(`Requested changes for PR #${number} in ${changeRequestId}.`)
    } else {
      const approvedReviewId = await approvePullRequestChanges(repository, number)
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
    const filesChanged = await getFilesChanged(repository, number)
    const configFile = filesChanged.find(filename => filename === configFileName)

    if (!configFile) return

    log.debug(`Found repository configuration file: ${configFile}.`)

    const configuration = await determineConfigurationChanges(configFileName, repository, sha)
    const defaultValues = await getTemplateDefaultValues(configuration.version)
    const defaultValueSchema = generateSchema(defaultValues.values)

    const combined = combineConfigurations(defaultValues, configuration)
    if (!combined) return

    const { result: configurationResult, errors: configurationErrors } = validateTemplateConfiguration(
      combined,
      defaultValueSchema,
    )

    const configurationConclusion = await createCheck(configurationResult, configurationErrors)
    log.info(`Validated configuration changes in #${number} with conclusion: ${configurationConclusion}.`)
  } catch (error) {
    log.error(`Failed to process PR #${number}' with error:`)
    log.error(error as never)
  }
}

const processPushEvent = async (payload: PushEvent, context: Context<'push'>) => {
  const { log, octokit } = context
  const { commitFiles, getCommitFiles } = git(log, octokit)
  const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
  const { getTemplateDefaultValues, renderTemplates } = templates(log, octokit)

  log.info(`${context.name} event happened on '${payload.ref}'`)

  try {
    const repository = extractRepositoryInformation(payload)
    const branchRegex = new RegExp(repository.defaultBranch)

    if (!branchRegex.test(payload.ref)) return

    log.info(`Processing changes made to ${repository.owner}/${repository.repo} in ${payload.after}.`)

    const filesChanged = await getCommitFiles(repository, payload.after)
    if (!filesChanged.includes(configFileName)) return

    const parsed = await determineConfigurationChanges(configFileName, repository, payload.after)
    const defaultValues = await getTemplateDefaultValues(parsed.version)

    const combined = combineConfigurations(defaultValues, parsed)
    if (!combined) return

    const { version, templates: processed } = await renderTemplates(combined)
    const pullRequestNumber = await commitFiles(repository, version, processed)
    log.info(`Committed templates to '${repository.owner}/${repository.repo}' in #${pullRequestNumber}`)
    log.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
  } catch (e: unknown) {
    log.error(`Failed to process commit '${payload.after}' with error:`)
    log.error(e as never)
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
