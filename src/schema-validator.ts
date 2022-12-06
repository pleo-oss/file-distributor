import { ConfigurationValues, RepositoryConfiguration, TemplateValidation } from './types'
import Ajv, { ErrorObject } from 'ajv'
import templateSchema from './template-schema.json'
import { Logger } from 'probot'
import { createSchema } from 'genson-js'
import { ensurePathConfiguration } from './configuration'
import { CST } from 'yaml'

import { Document, Token } from 'yaml/dist/parse/cst'
import ajvMergePatch from 'ajv-merge-patch'
import { default as AjvPatch } from 'ajv-merge-patch/node_modules/ajv/dist/ajv'

interface ConcreteSyntaxTree {
  tokens: Token[]
  lines: number[]
}

interface TemplateConfig {
  repositoryConfiguration: RepositoryConfiguration
  cstYamlRepresentation: ConcreteSyntaxTree
}

const ajv = (() => {
  const instance = new Ajv({ allowUnionTypes: true, allErrors: true })
  ajvMergePatch(instance as unknown as AjvPatch)
  return instance
})()

const getLineFromOffset = (lines: number[], offset: number): number =>
  lines.findIndex(value => value > offset) ?? lines.length

const findErrorLine = (instancePath: string, tree: ConcreteSyntaxTree): number | undefined => {
  const pathItems = instancePath.split('/').slice(1)
  if (pathItems.length === 0) return

  const findLineInDocument = (doc: Document) => {
    let currentLine: number | undefined = undefined
    CST.visit(doc, (item, path) => {
      const currentPathValue = pathItems[path.length - 1]
      const pathValueNumber = parseInt(currentPathValue)
      // If path step is a number.
      if (isNaN(pathValueNumber)) {
        if (!CST.isScalar(item.value) || !item.key) return

        // If the note key is not the current path value, skip this node and its children and
        // continue to next sibling in the tree.
        if ('source' in item.key && item.key.source !== currentPathValue) {
          return CST.visit.SKIP
        }
        if (path.length === pathItems.length) {
          // If it has the same value, check if it is the last item in the path.
          // If so, the item is found and we finish the visit
          const index = getLineFromOffset(tree.lines, item.key.offset)
          currentLine = index
          return CST.visit.BREAK
        }
      } else {
        // If the number in the instance path provided is not the same as the current traversal path,
        // skip to the next sibling, i.e.:
        // instancePath: /files/1/source, num = 1, path = [['value', 0], ['value', 0]]'.
        // Here we don't see a match, since num = 1 != 0.
        if (pathValueNumber !== path[path.length - 1][1]) {
          return CST.visit.SKIP
        }

        if (!CST.isScalar(item.value)) return

        // If it has the same value, check if it is the last item in the path.
        // If so the item is found and finish the visit.
        if (path.length === pathItems.length) {
          const index = getLineFromOffset(tree.lines, item.value.offset)
          currentLine = index > 0 ? index : currentLine
          return CST.visit.BREAK
        }
      }
      return
    })
    return currentLine
  }

  return tree.tokens.reduce((result, t) => result ?? findLineInDocument(t as never), undefined)
}

export const schemaValidator = (log: Logger) => {
  const prettifyErrors = (errors?: ErrorObject<string, Record<string, unknown>, unknown>[] | null) =>
    errors?.reduce<string[]>(
      (acc, error) => (error ? [...acc, `${error?.instancePath} ${error?.message}`] : acc),
      [],
    ) ?? []

  const defaultSchema = () => templateSchema

  const mergeSchemaToDefault = (valuesSchema: Record<string, string>) => {
    return {
      $merge: {
        source: defaultSchema(),
        with: {
          properties: {
            values: valuesSchema,
          },
        },
      },
    }
  }

  const validateTemplateConfiguration = (configuration: TemplateConfig, schema: object): TemplateValidation => {
    const validateConfiguration = ajv.compile<RepositoryConfiguration>(schema)
    const isValidConfiguration = validateConfiguration(configuration?.repositoryConfiguration)

    // Needed to filter $merge due to https://github.com/ajv-validator/ajv-merge-patch/issues/8
    const validationErrors = (validateConfiguration.errors ?? [])
      .filter(e => e.keyword != '$merge')
      .map(e => ({
        message: e.message,
        line: findErrorLine(e.instancePath, configuration.cstYamlRepresentation),
      }))

    if (!isValidConfiguration) {
      log.debug('Saw validation errors: %s', prettifyErrors(validateConfiguration.errors).join(','))
    }

    return {
      result: isValidConfiguration,
      errors: validationErrors,
    }
  }

  const validateFiles = (configuration: RepositoryConfiguration, templates: string[]): TemplateValidation => {
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

  const generateSchema = (input?: ConfigurationValues): object => {
    if (!input) return {}

    log.debug('Generating JSON schema from input. %o', input)
    const generated = createSchema(input, { noRequired: true })
    log.debug('Generated JSON schema. %o', generated)

    return generated
  }

  return {
    validateFiles,
    validateTemplateConfiguration,
    generateSchema,
    getDefaultSchema: defaultSchema,
    mergeSchemaToDefault,
  }
}
