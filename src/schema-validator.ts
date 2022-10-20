import { parse } from 'yaml'
import { RepositoryConfiguration, TemplateValidation } from './types'
import Ajv from 'ajv'
import templateSchema from './template-schema.json'
import { Logger } from 'probot'

const ajv = new Ajv()
const validate = ajv.compile<RepositoryConfiguration>(templateSchema)

export const validateTemplateConfiguration =
    (input: string) =>
        (log: Logger): TemplateValidation => {
            const parsed = parse(input)
            const isValid = validate(parsed)

            const errors = validate.errors?.map(error => error?.message)?.filter(error => error) ?? []

            if (!isValid) {
                log.debug(`Saw validation errors:`)
                log.debug(errors)
            }

            return {
                result: isValid,
                errors,
            }
        }
