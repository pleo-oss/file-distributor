import { Logger } from 'probot'
import { parse } from 'yaml'
import { schemaValidator } from '../src/schema-validator'

const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger

describe('Schema Tests', () => {
  const { generateSchema, validateTemplateConfiguration, validateFiles } = schemaValidator(log)

  test('returns false for an invalid input', async () => {
    const input = parse('DFds')
    const { result, errors } = validateTemplateConfiguration(input)
    expect(result).toBeFalsy()
    expect(errors?.length).not.toEqual(0)
  })

  test('returns false for undefined input', async () => {
    const { result, errors } = validateTemplateConfiguration(undefined)
    expect(result).toBeFalsy()
    expect(errors?.length).not.toEqual(0)
  })

  test('returns false for a null value on a non nullable type', async () => {
    const input = parse(`
        # The template version to use (optional).
        version: null
        
        # Whether to merge template changes automatically (optional).
        automerge: true
        
        # Templates to add to the repository (optional).
        files:           
          - source: null
            destination: path/to/template-destination/filename.yaml
        `)
    const { result, errors } = validateTemplateConfiguration(input)
    expect(result).toBeFalsy()
    expect(errors?.length).not.toEqual(0)
  })

  test('returns true for a null value on a nullable type', async () => {
    const input = parse(`
        # The template version to use (optional).
        version: v10.7.0
        
        # Whether to merge template changes automatically (optional).
        automerge: null
        
        # Templates to add to the repository (optional).
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        `)
    const { result, errors } = validateTemplateConfiguration(input)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('returns true for a valid schema', async () => {
    const input = parse(`
        # The template version to use (optional).
        version: v10.7.0
        
        # Whether to merge template changes automatically (optional).
        automerge: true
        
        # Templates to add to the repository (optional).
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        `)
    const { result, errors } = validateTemplateConfiguration(input)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('validates valid values', async () => {
    const configuration = parse(`
        version: v10.7.0
        automerge: true
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        values: 
          jdkVersion: 17
        `)

    const valuesSchema = `{
      "$schema": "http://json-schema.org/draft-07/schema",
      "type": "object",
      "properties": {
        "jdkVersion": {
          "type": "integer"
        }
      }
    }`

    const { result, errors } = validateTemplateConfiguration(configuration, valuesSchema)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('invalidates a invalid values', async () => {
    const configuration = parse(`
        version: v10.7.0
        automerge: true
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        values: 
          jdkVersion: true
        `)

    const valuesSchema = `{
      "$schema": "http://json-schema.org/draft-07/schema",
      "type": "object",
      "properties": {
        "jdkVersion": {
          "type": "integer"
        }
      }
    }`

    const { result, errors } = validateTemplateConfiguration(configuration, valuesSchema)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
  })

  test('generates JSON schema from values', async () => {
    const configuration = parse(`
        version: v10.7.0
        automerge: true
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        values: 
          jdkVersion: 17
          enableSomeFeature: true
        `)

    const expected = JSON.parse(`{
      "type": "object",
      "properties": {
        "jdkVersion": {
          "type": "integer"
        },
        "enableSomeFeature": {
          "type": "boolean"
        }
      }
    }`)

    const result = generateSchema(configuration.values)
    expect(result).not.toBeUndefined()
    expect(JSON.parse(result as string)).toEqual(expected)
  })

  test('validates valid versions', async () => {
    const configuration = parse('version: v10.7.0')

    const { result, errors } = validateTemplateConfiguration(configuration)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('invalidates invalid versions', async () => {
    const configuration = parse('version: bla')

    const { result, errors } = validateTemplateConfiguration(configuration)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
  })

  test('invalidates invalid versions', async () => {
    const configuration = parse('')

    const { result, errors } = validateTemplateConfiguration(configuration)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
  })

  test('validates valid files', async () => {
    const configuration = parse(`
files: 
  - file1
  - file2
`)
    const files = ['file1', 'file2']
    const { result, errors } = validateFiles(configuration, files)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('invalidates invalid files', async () => {
    const configuration = parse(`
files: 
  - file1
`)
    const files = ['file2']
    const { result, errors } = validateFiles(configuration, files)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
  })
})
