/* eslint-disable no-console */
import {
  ConfigurationValues,
  CSTRepresentation,
  RepositoryConfiguration,
  TemplateConfig,
  TemplateValidation,
} from './types'
import Ajv, { ErrorObject } from 'ajv'
import templateSchema from './template-schema.json'
import { Logger } from 'probot'
import { createSchema } from 'genson-js'
import { ensurePathConfiguration } from './configuration'
import { CST } from 'yaml'
import { Document, SourceToken } from 'yaml/dist/parse/cst'

const ajv = new Ajv({ allowUnionTypes: true, allErrors: true })
const validateConfiguration = ajv.compile<RepositoryConfiguration>(templateSchema)

const getLineFromOffset = (lines: number[], offset: number): number => {
  for (let index = 1; index < lines.length; index++) {
    const newLineOffset = lines[index]
    if (newLineOffset > offset) {
      return index
    }
  }
  return -1
}

const getLineFromInstancePath = (instancePath: string, cst: CSTRepresentation): number | undefined => {
  const pathItems = instancePath.split('/').slice(1)

  const getLineFromDoc = (doc: Document) => {
    let line = undefined
    CST.visit(doc, (item, path) => {
      const currentPathValue = pathItems[path.length - 1]
      const num = Number(currentPathValue)
      // If path step is a number
      if (isNaN(num)) {
        if (!CST.isScalar(item.value)) return

        const key = item.key as SourceToken

        if (key.source !== currentPathValue) {
          return CST.visit.SKIP
        }
        if (path.length === pathItems.length) {
          const index = getLineFromOffset(cst.lines, key.offset)
          if (index > 0) {
            line = index
            return CST.visit.BREAK
          }
        }
      } else {
        if (num !== path[path.length - 1][1]) {
          return CST.visit.SKIP
        }

        if (!CST.isScalar(item.value)) return

        if (path.length === pathItems.length) {
          const index = getLineFromOffset(cst.lines, item.value.offset)
          if (index > 0) {
            line = index
            return CST.visit.BREAK
          }
        }
      }
      return
    })
    return line
  }

  for (const t of cst.tokens) {
    const l = getLineFromDoc(t as Document)
    if (l !== undefined) return l
  }
  return
}

export const schemaValidator = (log: Logger) => {
  const prettifyErrors = (errors?: ErrorObject<string, Record<string, unknown>, unknown>[] | null) =>
    errors
      ?.map(error => {
        if (!error) return ''
        return `${error.instancePath} ${error?.message}`
      })
      ?.filter(error => error !== '') ?? []

  const validateTemplateConfiguration = (configuration: TemplateConfig, valuesSchema?: string): TemplateValidation => {
    const validateValues = ajv.compile<ConfigurationValues>(JSON.parse(valuesSchema ?? '{}'))
    const isValidConfiguration = validateConfiguration(configuration?.repositoryConfiguration)
    const hasValidValues = validateValues(configuration?.repositoryConfiguration?.values)

    const validationErrors = validateConfiguration.errors?.map(e => ({
      message: e.message,
      line: getLineFromInstancePath(e.instancePath, configuration.cstYamlRepresentation),
    }))

    const validationValueErrors = validateValues.errors?.map(e => ({ message: e.message, line: undefined }))

    const configurationErrors = prettifyErrors(validateConfiguration.errors)

    if (!isValidConfiguration || !hasValidValues) {
      log.debug('Saw validation errors: %s', configurationErrors.join(','))
    }

    return {
      result: isValidConfiguration && hasValidValues,
      errors: [].concat(validationValueErrors ?? [], validationErrors ?? []),
    }
  }

  const validateFiles = (configuration: RepositoryConfiguration, templates: string[]): TemplateValidation => {
    const paths = ensurePathConfiguration(configuration.files) ?? []
    const errors = paths?.reduce(
      (errors, file) =>
        templates.some(t => new RegExp(file.source).test(t))
          ? errors
          : errors.add(`\`${file.source}\` was not found in the templates`),
      new Set<string>(),
    )

    return {
      result: errors.size === 0,
      errors: Array.from(errors).map(e => ({
        message: e,
        line: undefined,
      })),
    }
  }

  const generateSchema = (input?: ConfigurationValues) => {
    if (!input) return undefined

    log.debug('Generating JSON schema from input. %o', input)
    const generated = createSchema(input, { noRequired: true })
    log.debug('Generated JSON schema. %o', generated)

    return JSON.stringify(generated)
  }

  return {
    validateFiles,
    validateTemplateConfiguration,
    generateSchema,
  }
}
