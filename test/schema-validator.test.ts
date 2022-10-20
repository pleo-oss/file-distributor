import Ajv from 'ajv'
import { Logger } from 'probot'
import { validateTemplateConfiguration } from '../src/schema-validator'

const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger

describe('Schema Tests', () => {
  test('returns false for an invalid input', async () => {
    const validation = validateTemplateConfiguration('DFds')(log)
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
    const validation = validateTemplateConfiguration(input)(log)
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
    const validation = validateTemplateConfiguration(input)(log)
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
    const validation = validateTemplateConfiguration(input)(log)
    expect(validation).toBeTruthy()
  })
})
