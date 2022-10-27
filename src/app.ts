import 'dd-trace/init'
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
    log.debug(`Requested changes for PR #%d in %s.`, number, changeRequestId)
  } else if (onlyChangesConfiguration) {
    const approvedReviewId = await approvePullRequestChanges(repository, number)
    log.debug(`Approved PR #%d in %s.`, number, approvedReviewId)
  }

  const checkId = await createCheckRun(checkInput)
  const checkConclusion = await resolveCheckRun({ ...checkInput, conclusion: conclusion(result), checkRunId: checkId })

  log.info(`Validated configuration changes in #%d with conclusion: %s.`, number, checkConclusion)
}

const processPushEvent = async (payload: PushEvent, context: Context<'push'>) => {
  const { log, octokit } = context
  const { commitFiles, getCommitFiles } = git(log, octokit)
  const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
  const { getTemplateInformation, renderTemplates } = templates(log, octokit)

  const repository = extractRepositoryInformation(payload)
  const branchRegex = new RegExp(repository.defaultBranch)

  log.info('%s event happened on %s', context.name, payload.ref)

  if (!branchRegex.test(payload.ref)) return

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
