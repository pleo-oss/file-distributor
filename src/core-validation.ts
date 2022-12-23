import { Logger } from 'pino'
import { YAMLParseError } from 'yaml'
import { configuration } from './configuration'
import { schemaValidator } from './schema-validator'
import { templates } from './templates'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'

import { OctokitInstance, ProcessCheckInput, TemplateConfig, ValidationError, VersionNotFoundError } from './types'
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
export const coreValidation = (log: Logger, octokit: InstanceType<typeof ProbotOctokit>) => {
  const processCheckRun = async (input: ProcessCheckInput) => {
    const { getFilesChanged, commentOnPullRequest } = git(log, octokit)

    const { resolveCheckRun, createCheckRun } = checks(log, octokit)
    const { determineConfigurationChanges } = configuration(log, octokit)
    const conclusion = (errors: ValidationError[]) => (errors.length > 0 ? 'action_required' : 'success')
    const { prNumber, repository, configFileName, sha, previousCheckId } = input

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

      const comment = await commentOnPullRequest(repository, prNumber, checkId, conclusion(errors))
      log.debug(`Submitted comment on PR #%d in %s.`, prNumber, comment)

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
    } catch (error) {
      await resolveCheckRun(
        {
          ...checkInput,
          conclusion: 'failure',
          checkRunId: checkId,
          errors: [],
        },
        configFileName,
      )
      throw error
    }
  }
  return {
    processCheckRun,
  }
}
