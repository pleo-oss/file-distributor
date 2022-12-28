import { ConfigurationValues, CSTRepresentation, RepositoryConfiguration, TemplateValidation } from './types'
import Ajv, { ErrorObject, Schema } from 'ajv'
import templateSchema from './template-schema.json'
import { Logger } from 'probot'
import { createSchema } from 'genson-js'
import { ensurePathConfiguration } from './configuration'
import { CST } from 'yaml'

import { Document, SourceToken } from 'yaml/dist/parse/cst'
import ajvMergePatch from 'ajv-merge-patch'
import { default as AjvPatch } from 'ajv-merge-patch/node_modules/ajv/dist/ajv'

const ajv = new Ajv({ allowUnionTypes: true, allErrors: true })
ajvMergePatch(ajv as unknown as AjvPatch)

const getLineFromOffset = (lines: number[], offset: number): number => {
  for (let index = 1; index < lines.length; index++) {
    const newLineOffset = lines[index]
    if (newLineOffset > offset) {
      return index
    }
  }
  return lines.length
}

const getLineFromInstancePath = (instancePath: string, cst: CSTRepresentation) => {
  const pathItems = instancePath.split('/').slice(1)

  // If there is no path no line can be found
  if (pathItems.length === 0) return undefined

  const getLineFromDoc = (doc: Document): number | undefined => {
    let line: number | undefined = undefined
    CST.visit(doc, (item, path) => {
      const currentPathValue = pathItems[path.length - 1]
      const num = Number(currentPathValue)
      // If path step is a number
      if (isNaN(num)) {
        if (!CST.isScalar(item.value)) return undefined

        const key = item.key as SourceToken
        if (!key) return undefined

        // If note key is not the current path value skip this node and its childs and go to next sibling
        if (key.source !== currentPathValue) {
          return CST.visit.SKIP
        }
        if (path.length === pathItems.length) {
          // If it has the same value, check if it is the last item in the path, if so the item is found and finish visit
          const index = getLineFromOffset(cst.lines, key.offset)
          line = index
          return CST.visit.BREAK
        }
      } else {
        if (num !== path[path.length - 1][1]) {
          // If number in the instance path provided is not the same as the current traversal path skip to the next sibling
          // I.e. instancePath: /files/1/source, num = 1, path = [['value', 0], ['value', 0]] <- This is not a match because 1 != 0
          return CST.visit.SKIP
        }

        if (!CST.isScalar(item.value)) return undefined

        if (path.length === pathItems.length) {
          // If it has the same value, check if it is the last item in the path, if so the item is found and finish visit

          const index = getLineFromOffset(cst.lines, item.value.offset)
          if (index > 0) {
            line = index
            return CST.visit.BREAK
          }
        }
      }
      // Otherwise go on visiting
      return undefined
    })
    return line
  }

  const found = cst.tokens.reduce<number | undefined>((acc, t) => getLineFromDoc(t as Document) ?? acc, undefined)
  return found
}

export const getDefaultSchema = () => {
  return templateSchema
}

export const mergeSchemaToDefault = (valuesSchema: Schema) => {
  return {
    $merge: {
      source: getDefaultSchema(),
      with: {
        properties: {
          values: valuesSchema,
        },
      },
    },
  }
}

export const validateFiles = (configuration: RepositoryConfiguration, templates: string[]): TemplateValidation => {
  const paths = ensurePathConfiguration(configuration.files) ?? []
  const errors = paths?.reduce(
    (errors, file) =>
      templates.some(t => new RegExp(file.source).test(t))
        ? errors
        : errors.add(`${file.source} was not found in the templates`),
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

export const schemaValidator = (log: Logger) => {
  const prettifyErrors = (errors?: ErrorObject<string, Record<string, unknown>, unknown>[] | null) =>
    errors?.map(error => (error ? `${error.instancePath} ${error?.message}` : ''))?.filter(error => error !== '') ?? []

  const validateTemplateConfiguration = (
    configuration: RepositoryConfiguration,
    schema: Schema,
    cstRepresentation: CSTRepresentation,
  ): TemplateValidation => {
    const validateConfiguration = ajv.compile<RepositoryConfiguration>(schema)

    const isValidConfiguration = validateConfiguration(configuration)

    // Needed to filter $merge due to https://github.com/ajv-validator/ajv-merge-patch/issues/8
    const validationErrors = (validateConfiguration.errors ?? [])
      .filter(e => e.keyword != '$merge')
      .map(e => ({
        message: e.message,
        line: getLineFromInstancePath(e.instancePath, cstRepresentation),
      }))

    if (!isValidConfiguration) {
      log.debug('Saw validation errors: %s', prettifyErrors(validateConfiguration.errors).join(','))
    }

    return {
      result: isValidConfiguration,
      errors: validationErrors,
    }
  }

  const generateSchema = (input?: ConfigurationValues): Schema => {
    if (!input) return {}

    log.debug('Generating JSON schema from input. %o', input)
    const generated = createSchema(input, { noRequired: true })
    log.debug('Generated JSON schema. %o', generated)

    return generated
  }

  return {
    validateTemplateConfiguration,
    generateSchema,
  }
}
