import { Logger } from 'pino'
import { YAMLParseError } from 'yaml'
import { configuration } from './configuration'
import { schemaValidator } from './schema-validator'
import { templates } from './templates'
import { Either } from 'fp-ts/Either'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'

import {
  CheckResultion,
  OctokitInstance,
  RepositoryDetails,
  TemplateConfig,
  ValidationError,
  VersionNotFoundError,
} from './types'
import { checks } from './checks'
import { ProbotOctokit } from 'probot'
import { git } from './git'

const validateChanges = async (
  log: Logger,
  octokit: Pick<OctokitInstance, 'repos'>,
  configurationChangesOrError: E.Either<YAMLParseError, TemplateConfig>,
): Promise<ValidationError[]> => {
  const { getTemplateInformation } = templates(log, octokit)
  const { validateFiles, validateTemplateConfiguration, generateSchema, mergeSchemaToDefault, getDefaultSchema } =
    schemaValidator(log)

  const { combineConfigurations } = configuration(log, octokit)

  async function validateCorrectYamlChanges(configurationChanges: TemplateConfig) {
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

  return pipe(
    configurationChangesOrError,
    E.match(
      failure =>
        Promise.resolve([
          {
            message: failure.message,
            line: failure.linePos?.[0].line,
          } as ValidationError,
        ]),
      success => {
        return validateCorrectYamlChanges(success)
      },
    ),
  )
}

export const processCheckRun = async (
  log: Logger,
  octokit: InstanceType<typeof ProbotOctokit>,
  configFileName: string,
  prNumber: number,
  repository: RepositoryDetails,
  sha: string,
  previousCheckId?: number,
) => {
  const { approvePullRequestChanges, getFilesChanged, requestPullRequestChanges } = git(log, octokit)

  const { resolveCheckRun, createCheckRun } = checks(log, octokit)
  const { determineConfigurationChanges } = configuration(log, octokit)
  const conclusion = (errors: ValidationError[]) => (errors.length > 0 ? 'failure' : 'success')

  log.info('Pull request event happened on #%d', prNumber)

  const filesChanged = await getFilesChanged(repository, prNumber)
  const configFile = filesChanged.find((filename: string) => filename === configFileName)

  if (!configFile) return

  const checkInput = {
    ...repository,
    sha: sha,
  }

  const checkId =
    previousCheckId ??
    (await createCheckRun({
      ...repository,
      sha: sha,
    }))

  try {
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
        checkResolution: errors.length > 0 ? CheckResultion.FAILURE : CheckResultion.SUCCESS,
      },
      configFileName,
    )

    log.info(`Validated configuration changes in #%d with conclusion: %s.`, prNumber, checkConclusion)
  } catch (error) {
    await resolveCheckRun(
      {
        ...checkInput,
        conclusion: 'failure',
        checkRunId: checkId,
        errors: [],
        checkResolution: CheckResultion.ERROR,
      },
      configFileName,
    )
    throw error
  }
}
