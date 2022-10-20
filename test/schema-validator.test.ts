
import Ajv from "ajv";
import { RepositoryConfiguration } from "../src/types";
import templateSchema from "../src/template-schema.json";
import { validateTemplateConfiguration } from "../src/schema-validator";

const ajv = new Ajv()
const validateTemplate = ajv.compile<RepositoryConfiguration>(templateSchema)

describe('Schema Tests', () => {

    test('returns false for an invalid input', async () => {
        const validation = validateTemplateConfiguration(validateTemplate, "DFds")
        expect(validation).toBeFalsy()
    })

    test('returns false for a null value on a non nullable type', async () => {
        const input = `
        # The template version to use (optional).
        version: null
        
        # Whether to merge template changes automatically (optional).
        automerge: true
        
        # Templates to add to the repository (optional).
        files:           
          - source: null
            destination: path/to/template-destination/filename.yaml
        `
        const validation = validateTemplateConfiguration(validateTemplate, input)
        expect(validation).toBeFalsy()
    })

    test('returns true for a null value on a nullable type', async () => {
        const input = `
        # The template version to use (optional).
        version: v10.7.0
        
        # Whether to merge template changes automatically (optional).
        automerge: null
        
        # Templates to add to the repository (optional).
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        `
        const validation = validateTemplateConfiguration(validateTemplate, input)
        expect(validation).toBeTruthy()
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
        const validation = validateTemplateConfiguration(validateTemplate, input)
        expect(validation).toBeTruthy()
    })
})
