import { ValidateFunction } from "ajv";
import { parse } from "yaml";
import { RepositoryConfiguration } from "./types";

export const validateTemplateConfiguration = (validate: ValidateFunction<RepositoryConfiguration>, input: string): boolean => {
    const valid = validate(parse(input))
    if (!valid) console.log(validate.errors)
    return valid
}
