import validator from "../src/schema-validator";
import schema from '../src/template-schema.json'
import { JSONSchemaType } from "ajv";
import { TemplateConfig } from "../src/types";




describe('Schema Tests', () => {
    test('returns false for an invalid input', async () => {
        const validation = validator(schema as JSONSchemaType<TemplateConfig>, "DFds")
        expect(validation).toBeFalsy()
    })

    test('returns true for a valid schema', async () => {
        const input = `
        # The template version to use (optional).
        version: v10.7.0
        
        # Whether to merge template changes automatically (optional).
        automerge: true
        
        # Templates to add to the repository (optional).
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        `
        const validation = validator(schema as JSONSchemaType<TemplateConfig>, input)
        expect(validation).toBeTruthy()
    })
})