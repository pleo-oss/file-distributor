import { PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Logger, Probot } from 'probot'
import { configuration } from './configuration'
import { templates } from './templates'
import { git } from './git'
import { schemaValidator } from './schema-validator'
import { checks } from './checks'
import 'dotenv/config'
import { OctokitInstance, TemplateConfig, ValidationError, VersionNotFoundError } from './types'

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

const validateChanges = async (
  log: Logger,
  octokit: Pick<OctokitInstance, 'repos'>,
  configurationChanges: TemplateConfig,
): Promise<ValidationError[]> => {
  const { getTemplateInformation } = templates(log, octokit)
  const { validateFiles, validateTemplateConfiguration, generateSchema, mergeSchemaToDefault, getDefaultSchema } =
    schemaValidator(log)

  const { combineConfigurations } = configuration(log, octokit)

  try {
    const { configuration: defaultValuesConfiguration, files } = await getTemplateInformation(
      configurationChanges.repositoryConfiguration.version,
    )

    const defaultValueSchema = generateSchema(defaultValuesConfiguration.values)

    const combined = combineConfigurations(defaultValuesConfiguration, configurationChanges.repositoryConfiguration)

    const validatedTemplates = validateTemplateConfiguration(
      {
        repositoryConfiguration: combined,
        cstYamlRepresentation: configurationChanges.cstYamlRepresentation,
      },
      mergeSchemaToDefault(defaultValueSchema),
    )
    const validatedFiles = validateFiles(combined, files)

    return validatedTemplates.errors.concat(validatedFiles.errors)
  } catch (error) {
    if (error instanceof VersionNotFoundError) {
      log.debug('Version for %s/%s:%s has not been found', error.owner, error.name, error.version)
      const validatedTemplate = validateTemplateConfiguration(configurationChanges, getDefaultSchema())
      return validatedTemplate.errors.concat({
        message: `Version could not be found at ${error.owner}/${error.repo}:${error.version}`,
        line: undefined,
      })
    } else {
      throw error
    }
  }
}

const processPullRequest = async (payload: PullRequestEvent, context: Context<'pull_request'>) => {
  const { number: prNumber, sha, repository } = extractPullRequestInformation(payload)
  const { log, octokit } = context
  const enrichedWithRepoLog = log.child({ owner: repository.owner, repository: repository.repo })

  const { approvePullRequestChanges, getFilesChanged, requestPullRequestChanges } = git(enrichedWithRepoLog, octokit)

  const { createCheckRun, resolveCheckRun } = checks(enrichedWithRepoLog, octokit)
  const { determineConfigurationChanges } = configuration(enrichedWithRepoLog, octokit)
  const conclusion = (errors: ValidationError[]) => (errors.length > 0 ? 'failure' : 'success')

  log.info('Pull request event happened on #%d', prNumber)

  const filesChanged = await getFilesChanged(repository, prNumber)
  const configFile = filesChanged.find(filename => filename === configFileName)

  if (!configFile) return

  const checkInput = {
    ...repository,
    sha: sha,
  }
  const checkId = await createCheckRun({
    ...repository,
    sha: sha,
  })

  log.debug('Found repository configuration file: %s.', configFile)

  const configurationChanges = await determineConfigurationChanges(configFileName, repository, sha)

  const errors = await validateChanges(log, octokit, configurationChanges)

  const onlyChangesConfiguration = filesChanged.length === 1 && filesChanged[0] === configFileName

  if (errors.length > 0) {
    const changeRequestId = await requestPullRequestChanges(repository, prNumber, checkId)
    log.debug(`Requested changes for PR #%d in %s.`, prNumber, changeRequestId)
  } else if (onlyChangesConfiguration) {
    const approvedReviewId = await approvePullRequestChanges(repository, prNumber)
    log.debug(`Approved PR #%d in %s.`, prNumber, approvedReviewId)
  }

  const checkConclusion = await resolveCheckRun(
    {
      ...checkInput,
      conclusion: conclusion(errors),
      checkRunId: checkId,
      errors,
    },
    configFileName,
  )

  log.info(`Validated configuration changes in #%d with conclusion: %s.`, prNumber, checkConclusion)
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

  const parsed = await determineConfigurationChanges(configFileName, repository, payload.after)

  if (!parsed.repositoryConfiguration) return

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

  app.on(['pull_request.opened', 'pull_request.synchronize'], async (context: Context<'pull_request'>) => {
    await processPullRequest(context.payload as PullRequestEvent, context)
  })
}
