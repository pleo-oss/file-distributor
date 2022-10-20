import { validateTemplateConfiguration } from '../src/schema-validator'
import schema from '../src/template-schema.json'
import { JSONSchemaType } from 'ajv'
import { TemplateConfig } from '../src/types'
import { Logger } from 'probot'

describe('Schema Tests', () => {
  const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger
  test('returns false for an invalid input', async () => {
    const validation = validateTemplateConfiguration(schema as JSONSchemaType<TemplateConfig>, 'DFds')(log)
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
    const validation = validateTemplateConfiguration(schema as JSONSchemaType<TemplateConfig>, input)(log)
    expect(validation).toBeTruthy()
  })
})
