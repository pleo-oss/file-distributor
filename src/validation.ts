import { Logger } from 'pino'
import { YAMLParseError } from 'yaml'
import { configuration } from './configuration'
import { schemaValidator } from './schema-validator'
import { templates } from './templates'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'

import { OctokitInstance, CheckInput, TemplateConfig, ValidationError, VersionNotFoundError } from './types'
import { resolveCheck } from './checks'
import { git } from './git'

export const validation = (
  log: Logger,
  octokit: Pick<OctokitInstance, 'pulls' | 'repos' | 'git' | 'issues' | 'checks'>,
) => {
  const validateChanges = async (
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

  const processCheck = async (input: CheckInput) => {
    const { updateCheck, createCheck, getFilesChanged, commentOnPullRequest } = git(log, octokit)
    const { determineConfigurationChanges } = configuration(log, octokit)
    const conclusion = (errors: ValidationError[]) => (errors.length > 0 ? 'action_required' : 'success')
    const { prNumber, repository, configFileName, sha, checkId } = input

    log.info('Pull request event happened on #%d', prNumber)

    const filesChanged = await getFilesChanged(repository, prNumber)
    const configFile = filesChanged.find((filename: string) => filename === configFileName)

    if (!configFile) return

    const checkInput = {
      ...repository,
      sha: sha,
    }

    const previousCheckId =
      checkId ??
      (await createCheck({
        ...repository,
        sha,
        conclusion: 'neutral',
        checkRunId: undefined,
        errors: [],
      }))

    try {
      log.debug('Found repository configuration file: %s.', configFile)

      const configurationChanges = await determineConfigurationChanges(configFileName, repository, sha)

      const errors = await validateChanges(configurationChanges)

      const comment = await commentOnPullRequest(repository, prNumber, previousCheckId, conclusion(errors))
      log.debug(`Submitted comment on PR #%d in %s.`, prNumber, comment)

      const checkConclusion = await resolveCheck(
        {
          ...checkInput,
          conclusion: conclusion(errors),
          checkRunId: previousCheckId,
          errors,
        },
        configFileName,
      )
      await updateCheck(checkConclusion)

      log.info(`Validated configuration changes in #%d with conclusion: %s.`, prNumber, checkConclusion)
    } catch (error) {
      const resolved = await resolveCheck(
        {
          ...checkInput,
          conclusion: 'failure',
          checkRunId: previousCheckId,
          errors: [],
        },
        configFileName,
      )
      await updateCheck(resolved)
      throw error
    }
  }

  return {
    processCheck,
  }
}
