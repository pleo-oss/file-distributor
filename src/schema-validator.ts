import { ConfigurationValues, RepositoryConfiguration, TemplateValidation } from './types'
import Ajv, { ErrorObject } from 'ajv'
import templateSchema from './template-schema.json'
import { Logger } from 'probot'
import { createSchema } from 'genson-js'
import { ensurePathConfiguration } from './configuration'

const ajv = new Ajv({ allowUnionTypes: true })
const validateConfiguration = ajv.compile<RepositoryConfiguration>(templateSchema)

export const schemaValidator = (log: Logger) => {
  const prettifyErrors = (errors?: ErrorObject<string, Record<string, unknown>, unknown>[] | null) =>
    errors
      ?.map(error => {
        if (!error) return ''
        return `${error.instancePath} ${error?.message}`
      })
      ?.filter(error => error !== '') ?? []

  const validateTemplateConfiguration = (
    configuration?: RepositoryConfiguration,
    valuesSchema?: string,
  ): TemplateValidation => {
    const validateValues = ajv.compile<ConfigurationValues>(JSON.parse(valuesSchema ?? '{}'))
    const isValidConfiguration = validateConfiguration(configuration)
    const hasValidValues = validateValues(configuration?.values)

    const configurationErrors = prettifyErrors(validateConfiguration.errors)
    const valueErrors = prettifyErrors(validateValues.errors)

    if (!isValidConfiguration || !hasValidValues) {
      log.debug(configurationErrors, 'Saw validation errors.')
    }

    return {
      result: isValidConfiguration && hasValidValues,
      errors: configurationErrors.concat(valueErrors),
    }
  }

  const validateFiles = (configuration: RepositoryConfiguration, templates: string[]): TemplateValidation => {
    const paths = ensurePathConfiguration(configuration.files) ?? []
    const errors = paths?.reduce(
      (errors, file) =>
        templates.some(t => new RegExp(file.source).test(t))
          ? errors
          : errors.add(`'${file.source}' was not found in the templates`),
      new Set<string>(),
    )

    return {
      result: errors.size === 0,
      errors: Array.from(errors),
    }
  }

  const generateSchema = (input?: ConfigurationValues) => {
    if (!input) return undefined

    log.debug(input, 'Generating JSON schema.')
    const generated = createSchema(input, { noRequired: true })
    log.debug(generated, 'Generated JSON schema.')

    return JSON.stringify(generated)
  }

  return {
    validateFiles,
    validateTemplateConfiguration,
    generateSchema,
  }
}
