import Ajv, {JSONSchemaType} from "ajv";
import { parse } from "yaml";
import { TemplateConfig } from "./types";

export default (schema: JSONSchemaType<TemplateConfig>, input: string) => {
    const ajv = new Ajv() 
    const validate = ajv.compile(schema)
    const valid = validate(parse(input))
    if (!valid) console.log(validate.errors)
    return valid
}