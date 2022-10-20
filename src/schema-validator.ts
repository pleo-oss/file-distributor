import { parse } from 'yaml'
import { RepositoryConfiguration, TemplateValidation } from './types'
import Ajv from 'ajv'
import templateSchema from './template-schema.json'
import { Logger } from 'probot'

const ajv = new Ajv()

export const validateTemplateConfiguration =
  (input: string) =>
  (log: Logger): TemplateValidation => {
    const validate = ajv.compile<RepositoryConfiguration>(templateSchema)
    const parsed = parse(input)
    const isValid = validate(parsed)

    const fullErrors = validate.errors
    const errors = fullErrors?.map(error => error?.message)

    if (!isValid) {
      log.debug(`Saw validation errors:`)
      log.debug(errors)
    }

    return {
      result: isValid,
      errors,
    }
  }
