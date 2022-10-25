import { PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { configuration } from './configuration'
import { templates } from './templates'
import { git } from './git'
import { schemaValidator } from './schema-validator'
import { checks } from './checks'
import 'dotenv/config'

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

const extractPullRequestInformation = (payload: PullRequestEvent) => {
  const {
    number,
    pull_request: {
      head: { sha },
    },
    repository: {
      owner: { login },
      name,
    },
  } = payload

  return { number, sha, repository: { owner: login, repo: name } }
}

const processPullRequest = async (payload: PullRequestEvent, context: Context<'pull_request'>) => {
  const { log, octokit } = context

  const { approvePullRequestChanges, getFilesChanged, requestPullRequestChanges } = git(log, octokit)
  const { validateTemplateConfiguration, generateSchema } = schemaValidator(log)
  const { createCheckRun, resolveCheckRun } = checks(log, octokit)
  const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
  const { getTemplateDefaultValues } = templates(log, octokit)

  const { number, sha, repository } = extractPullRequestInformation(payload)
  log.info(`Pull request event happened on #${number}`)

  const filesChanged = await getFilesChanged(repository, number)
  const configFile = filesChanged.find(filename => filename === configFileName)

  if (!configFile) return

  log.debug(`Found repository configuration file: ${configFile}.`)

  const configurationChanges = await determineConfigurationChanges(configFileName, repository, sha)
  const defaultValues = await getTemplateDefaultValues(configurationChanges.version)
  const defaultValueSchema = generateSchema(defaultValues.values)

  const combined = combineConfigurations(defaultValues, configurationChanges)
  if (!combined) return

  const { result, errors } = validateTemplateConfiguration(combined, defaultValueSchema)

  const conclusion = result ? 'success' : 'failure'
  const checkInput = { ...repository, sha: sha }
  const checkId = await createCheckRun(checkInput)
  const checkConclusion = await resolveCheckRun({ ...checkInput, conclusion: conclusion, checkRunId: checkId })

  if (!result) {
    const changeRequestId = await requestPullRequestChanges(repository, number, errors)
    log.debug(`Requested changes for PR #${number} in ${changeRequestId}.`)
  } else {
    const approvedReviewId = await approvePullRequestChanges(repository, number)
    log.debug(`Approved PR #${number} in ${approvedReviewId}.`)
  }

  log.info(`Validated configuration changes in #${number} with conclusion: ${checkConclusion}.`)
}

const processPushEvent = async (payload: PushEvent, context: Context<'push'>) => {
  const { log, octokit } = context
  const { commitFiles, getCommitFiles } = git(log, octokit)
  const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
  const { getTemplateDefaultValues, renderTemplates } = templates(log, octokit)

  log.info(`${context.name} event happened on '${payload.ref}'`)

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
