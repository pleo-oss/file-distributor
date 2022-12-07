import { PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Logger, Probot } from 'probot'
import { combineConfigurations, configuration, generateSyntaxTree } from './configuration'
import { templates } from './templates'
import { git } from './git'
import { defaultSchema, mergeSchemaToDefault, schemaValidator, validateFiles } from './schema-validator'
import { checks } from './checks'
import 'dotenv/config'
import { err, present, OctokitInstance, Possibly, RepositoryConfiguration, ConcreteSyntaxTree } from './types'

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
    after,
  } = payload

  return { owner: login, repo: name, defaultBranch: default_branch, sha: after }
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
  configuration: Possibly<RepositoryConfiguration>,
  syntaxTree: ConcreteSyntaxTree,
): Promise<Possibly<boolean>> => {
  const { getTemplateInformation } = templates(log, octokit)
  const { validateTemplateConfiguration, generateSchema } = schemaValidator(log)

  if (configuration.type === 'error') return err(configuration.errors)
  const { value: changes } = configuration
  const information = await getTemplateInformation(changes.version)

  if (information.type === 'error') return information

  const validatedTemplate = await validateTemplateConfiguration(changes, syntaxTree, defaultSchema())
  if (validatedTemplate.length > 0) {
    return err([
      ...validatedTemplate,
      {
        message: `Version could not be found at ${changes.version}`,
      },
    ])
  }

  const { configuration: defaultValuesConfiguration, files } = information.value
  const [defaultValueSchema, combined] = await Promise.all([
    generateSchema(defaultValuesConfiguration.values),
    combineConfigurations(defaultValuesConfiguration, changes),
  ])

  const [validatedTemplates, validatedFiles] = await Promise.all([
    validateTemplateConfiguration(combined, syntaxTree, mergeSchemaToDefault(defaultValueSchema)),
    validateFiles(combined, files),
  ])
  const allErrors = [...validatedTemplates, ...validatedFiles]

  if (allErrors.length > 0) return err(allErrors)
  return present(true)
}

const processPullRequest = async (payload: PullRequestEvent, context: Context<'pull_request'>) => {
  const { number: prNumber, sha, repository } = extractPullRequestInformation(payload)
  const { log, octokit } = context
  const enrichedWithRepoLog = log.child({ owner: repository.owner, repository: repository.repo })

  const { getFilesChanged } = git(enrichedWithRepoLog, octokit)

  const { createCheckRun, resolveCheckRun } = checks(enrichedWithRepoLog, octokit)
  const { determineConfigurationChanges, extractConfiguration } = configuration(enrichedWithRepoLog, octokit)
  const conclusion = (result: Possibly<boolean>) => (result.type === 'error' ? 'failure' : 'success')

  log.info('Pull request event happened on #%d', prNumber)

  const filesChanged = await getFilesChanged(repository, prNumber)
  const configFile = filesChanged.find((filename: string) => filename === configFileName)

  if (!configFile) return

  const checkId = await createCheckRun({
    ...repository,
    sha: sha,
  })

  log.debug('Found repository configuration file: %s.', configFile)

  const configurationContents = await extractConfiguration(repository, configFileName, sha)
  const [configurationChanges, syntaxTree] = await Promise.all([
    determineConfigurationChanges(configurationContents, configFileName, repository),
    generateSyntaxTree(configurationContents),
  ])
  const validated = await validateChanges(log, octokit, configurationChanges, syntaxTree)
  const errors = validated.type === 'error' && validated.errors

  const checkConclusion = await resolveCheckRun(
    {
      ...repository,
      sha: sha,
      conclusion: conclusion(validated),
      checkRunId: checkId,
      errors: errors === false ? [] : errors,
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
  const { determineConfigurationChanges, extractConfiguration } = configuration(enrichedWithRepoLog, octokit)
  const { getTemplateInformation, renderTemplates } = templates(enrichedWithRepoLog, octokit)

  const branchRegex = new RegExp(repository.defaultBranch)

  log.info('%s event happened on %s', context.name, payload.ref)

  if (!branchRegex.test(payload.ref)) return

  const { sha } = repository
  log.info('Processing changes made in commit %s.', sha)

  const filesChanged = await getCommitFiles(repository, sha)
  if (!filesChanged.includes(configFileName)) return

  const configurationContents = await extractConfiguration(repository, configFileName, sha)
  const changes = await determineConfigurationChanges(configurationContents, configFileName, repository)

  if (changes.type === 'error') return
  const { value: parsed } = changes

  const information = await getTemplateInformation(parsed.version)
  if (information.type === 'error') return

  const {
    value: { configuration: defaultValues },
  } = information

  const combined = await combineConfigurations(defaultValues, parsed)
  const rendered = await renderTemplates(combined)
  if (!rendered) return

  const { version, templates: processed } = rendered
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
