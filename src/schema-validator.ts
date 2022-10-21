import { ConfigurationValues, RepositoryConfiguration, TemplateValidation } from './types'
import Ajv, { ErrorObject } from 'ajv'
import templateSchema from './template-schema.json'
import { Logger } from 'probot'
import { createSchema } from 'genson-js'

const ajv = new Ajv()
const validateConfiguration = ajv.compile<RepositoryConfiguration>(templateSchema)

const prettifyErrors = (errors?: ErrorObject<string, Record<string, unknown>, unknown>[] | null) =>
  errors
    ?.map(error => {
      if (!error) return ''
      return `${error.instancePath} ${error?.message}`
    })
    ?.filter(error => error !== '') ?? []

export const validateTemplateConfiguration =
  (configuration?: RepositoryConfiguration, valuesSchema?: string) =>
  (log: Logger): TemplateValidation => {
    const validateValues = ajv.compile<ConfigurationValues>(JSON.parse(valuesSchema ?? '{}'))
    const isValidConfiguration = validateConfiguration(configuration)
    const hasValidValues = validateValues(configuration?.values)

    const configurationErrors = prettifyErrors(validateConfiguration.errors)
    const valueErrors = prettifyErrors(validateValues.errors)

    if (!isValidConfiguration || !hasValidValues) {
      log.debug(`Saw validation errors:`)
      log.debug(configurationErrors)
    }

    return {
      result: isValidConfiguration && hasValidValues,
      errors: configurationErrors.concat(valueErrors),
    }
  }

export const generateSchema = (input?: ConfigurationValues) => (log: Logger) => {
  if (!input) return undefined

  log.debug(`Generating JSON schema from:`)
  log.debug(input)
  const generated = createSchema(input, { noRequired: true })
  log.debug(`Generated JSON schema:`)
  log.debug(generated)

  return JSON.stringify(generated)
}
