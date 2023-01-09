import { Logger } from 'pino'
import { stringify, YAMLError } from 'yaml'
import { configuration } from './configuration'
import { mergeSchemaToDefault, schemaValidator, validateFiles } from './schema-validator'
import { release } from './release'
import * as E from 'fp-ts/Either'

import { OctokitInstance, CheckInput, ValidationError, RepositoryConfiguration } from './types'
import { resolveCheck } from './checks'
import { git } from './git'

export const validation = (
  log: Logger,
  octokit: Pick<OctokitInstance, 'pulls' | 'repos' | 'git' | 'issues' | 'checks'>,
) => {
  const validateChanges = async (
    configurationChanges: E.Either<YAMLError[], RepositoryConfiguration>,
  ): Promise<E.Either<ValidationError[], RepositoryConfiguration>> => {
    const { getReleaseInformation } = release(log, octokit)
    const { validateConfiguration, generateSchema } = schemaValidator(log)
    const { combineConfigurations, generateCstRepresentation } = configuration(log, octokit)

    if (E.isLeft(configurationChanges)) {
      const errors = configurationChanges.left
      const mapped: ValidationError[] = errors.map(error => ({ line: error.linePos?.[0].line, message: error.message }))
      return E.left(mapped)
    }
    const changes = configurationChanges.right

    const fetched = await getReleaseInformation(changes.version)
    if (E.isLeft(fetched)) return fetched

    const { configuration: defaultValuesConfiguration, files } = fetched.right
    const defaultValueSchema = generateSchema(defaultValuesConfiguration.values)
    const combined = combineConfigurations(defaultValuesConfiguration, changes)
    const cst = generateCstRepresentation(stringify(changes))
    const validatedConfiguration = validateConfiguration(combined, mergeSchemaToDefault(defaultValueSchema), cst)
    const validatedFiles = validateFiles(combined, files)

    const errors = validatedConfiguration.errors.concat(validatedFiles.errors)
    if (errors.length > 0) return E.left(errors)
    return E.right(changes)
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

    log.debug('Found repository configuration file: %s.', configFile)

    const configurationChanges = await determineConfigurationChanges(configFileName, repository, sha)
    const result = await validateChanges(configurationChanges)
    const errors = E.isLeft(result) ? result.left : []

    const comment = await commentOnPullRequest(repository, prNumber, previousCheckId, conclusion(errors))
    log.debug(`Submitted comment on PR #%d in %s.`, prNumber, comment)

    const checkConclusion = resolveCheck(
      {
        ...checkInput,
        conclusion: conclusion(errors),
        checkRunId: previousCheckId,
        errors,
      },
      configFileName,
    )

    try {
      await updateCheck(checkConclusion)
    } catch (e) {
      const failure = resolveCheck({
        ...checkInput,
        conclusion: 'failure',
        checkRunId: previousCheckId,
        errors: [],
      })
      log.error('Failed to update check %d.', previousCheckId)
      await updateCheck(failure)
    }

    log.info(`Validated configuration changes in #%d with conclusion: %s.`, prNumber, checkConclusion)
  }

  return {
    processCheck,
  }
}
