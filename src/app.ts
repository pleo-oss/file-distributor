import { PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { configuration } from './configuration'
import { templates } from './templates'
import { git } from './git'
import { schemaValidator } from './schema-validator'
import { checks } from './checks'
import 'dotenv/config'
import { RepositoryDetails } from './types'

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

const happenedOnDefaultBranch = (repository: RepositoryDetails, payload: PushEvent) => {
  if (!repository.defaultBranch) return false
  return new RegExp(repository.defaultBranch).test(payload.ref)
}

const processPullRequest = async (payload: PullRequestEvent, context: Context<'pull_request'>) => {
  const { log, octokit } = context

  const { approvePullRequestChanges, getFilesChanged, requestPullRequestChanges } = git(log, octokit)
  const { validateFiles, validateTemplateConfiguration, generateSchema } = schemaValidator(log)
  const { createCheckRun, resolveCheckRun } = checks(log, octokit)
  const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
  const { getTemplateInformation } = templates(log, octokit)

  const { number, sha, repository } = extractPullRequestInformation(payload)
  log.info('Pull request event happened on #%d', number)

  const conclusion = (result: boolean) => (result ? 'success' : 'failure')
  const checkInput = { ...repository, sha: sha }

  const filesChanged = await getFilesChanged(repository, number)
  const configFile = filesChanged.find(filename => filename === configFileName)

  if (!configFile) return

  log.debug('Found repository configuration file: %s.', configFile)

  const configurationChanges = await determineConfigurationChanges(configFileName, repository, sha)
  const { result: versionResult } = validateTemplateConfiguration(configurationChanges)
  const versionCheckId = await createCheckRun(checkInput)
  const versionCheckConclusion = await resolveCheckRun({
    ...checkInput,
    conclusion: conclusion(versionResult),
    checkRunId: versionCheckId,
  })

  if (versionCheckConclusion === 'failure') return

  const { configuration: templateConfiguration, files } = await getTemplateInformation(configurationChanges.version)
  const defaultValueSchema = generateSchema(templateConfiguration.values)

  const combined = combineConfigurations(templateConfiguration, configurationChanges)
  if (!combined) return

  const validatedTemplates = validateTemplateConfiguration(combined, defaultValueSchema)
  const validatedFiles = validateFiles(combined, files)

  const result = validatedTemplates.result && validatedFiles.result
  const errors = validatedTemplates.errors.concat(validatedFiles.errors)
  const onlyChangesConfiguration = filesChanged.length === 1 && filesChanged[0] === configFileName

  if (!result) {
    const changeRequestId = await requestPullRequestChanges(repository, number, errors)
    log.debug(`Requested changes for PR #${number} in ${changeRequestId}.`)
  } else if (onlyChangesConfiguration) {
    const approvedReviewId = await approvePullRequestChanges(repository, number)
    log.debug(`Approved PR #${number} in ${approvedReviewId}.`)
  }

  const checkId = await createCheckRun(checkInput)
  const checkConclusion = await resolveCheckRun({ ...checkInput, conclusion: conclusion(result), checkRunId: checkId })

  log.info(`Validated configuration changes in #${number} with conclusion: ${checkConclusion}.`)
}

const pushFilesToRepository = async (payload: PushEvent, context: Context<'push'>) => {
  const { log, octokit } = context
  const { commitFiles, getCommitFiles } = git(log, octokit)
  const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
  const { getTemplateInformation, renderTemplates } = templates(log, octokit)

  const repository = extractRepositoryInformation(payload)

  log.info('%s event happened on %s', context.name, payload.ref)
  if (!happenedOnDefaultBranch(repository, payload)) return

  log.info('Processing changes made in commit %s.', payload.after)

  const filesChanged = await getCommitFiles(repository, payload.after)
  if (!filesChanged.includes(configFileName)) return

  const parsed = await determineConfigurationChanges(configFileName, repository, payload.after)
  const { configuration: defaultValues } = await getTemplateInformation(parsed.version)

  const combined = combineConfigurations(defaultValues, parsed)
  if (!combined) return

  const { version, templates: processed } = await renderTemplates(combined)
  const pullRequestNumber = await commitFiles(repository, version, processed)
  log.info('Committed templates to %s/%s in #%d', repository.owner, repository.repo, pullRequestNumber)
  log.info('See: https://github.com/%s/%S/pull/%d', repository.owner, repository.repo, pullRequestNumber)
}

const addBaseConfiguration = async (payload: PushEvent, context: Context<'push'>) => {
  if (!process.env['CREATE_ONBOARDING_PRS']) return

  const { log, octokit } = context
  const { getDefaultBranchContents, createBaseConfiguration } = git(log, octokit)
  const { getLatestTemplateVersion } = templates(log, octokit)

  const repository = extractRepositoryInformation(payload)
  if (!happenedOnDefaultBranch(repository, payload)) return

  const defaultBranchContents = await getDefaultBranchContents(repository, configFileName)
  if (defaultBranchContents) return

  const latestVersion = await getLatestTemplateVersion()
  const createdPR = await createBaseConfiguration(repository, latestVersion, configFileName)
  if (createdPR !== undefined) {
    const { owner, repo } = repository
    log.info("Created new base configuration for %s/%s in #%d with version '%s'", owner, repo, createdPR, latestVersion)
  }
}

export = async (app: Probot) => {
  const authenticated = await app.auth(Number(process.env.APP_ID))
  if (!authenticated) {
    app.log.error('The application is not installed with expected authentication. Exiting.')
  }

  app.on('push', async (context: Context<'push'>) => {
    await Promise.all([
      pushFilesToRepository(context.payload as PushEvent, context),
      addBaseConfiguration(context.payload as PushEvent, context),
    ])
  })

  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context: Context<'pull_request'>) => {
    await processPullRequest(context.payload as PullRequestEvent, context)
  })
}
