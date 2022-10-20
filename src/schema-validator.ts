import { Logger } from 'probot'
import Ajv, { JSONSchemaType } from 'ajv'
import { parse } from 'yaml'
import { TemplateConfig } from './types'

export const validateTemplateConfiguration =
  (schema: JSONSchemaType<TemplateConfig>, input: string) => (log: Logger) => {
    const ajv = new Ajv()
    const validate = ajv.compile(schema)
    const valid = validate(parse(input))
    if (!valid) log.error(validate.errors)

    return valid
  }
