import { Logger } from 'probot'
import { LineCounter, parse, Parser } from 'yaml'
import { getDefaultSchema, mergeSchemaToDefault, schemaValidator, validateFiles } from '../src/schema-validator'
import { CSTRepresentation } from '../src/types'

const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger

const getCst = (content: string): CSTRepresentation => {
  const lineCounter = new LineCounter()

  const cst = new Parser(lineCounter.addNewLine).parse(content)
  const tokens = Array.from(cst)

  return {
    tokens: tokens,
    lines: lineCounter.lineStarts,
  }
}

describe('Schema Tests', () => {
  const { generateSchema, validateConfiguration } = schemaValidator(log)

  test('returns false for an invalid input', async () => {
    const input = parse('DFds')
    const cstYamlRepresentation = {
      lines: [],
      tokens: [],
    }

    const { result, errors } = validateConfiguration(input, getDefaultSchema(), cstYamlRepresentation)
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
    const repositoryConfiguration = input
    const cstYamlRepresentation = {
      tokens: [],
      lines: [],
    }
    const { result, errors } = validateConfiguration(repositoryConfiguration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeFalsy()
    expect(errors?.length).not.toEqual(0)
  })

  test('returns true for a null value on a nullable type', async () => {
    const configuration = parse(`
        # The template version to use (optional).
        version: v10.7.0
        
        # Whether to merge template changes automatically (optional).
        automerge: null
        
        # Templates to add to the repository (optional).
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
            `)
    const cstYamlRepresentation = {
      lines: [],
      tokens: [],
    }
    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('returns true for a valid schema', async () => {
    const configuration = parse(`
        # The template version to use (optional).
        version: v10.7.0
        
        # Whether to merge template changes automatically (optional).
        automerge: true
        
        # Templates to add to the repository (optional).
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        `)

    const cstYamlRepresentation = {
      lines: [],
      tokens: [],
    }
    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('returns false and error with line when property is wrong', async () => {
    const content = `# The template version to use (optional).
    version: v10.7.0
    
    # Whether to merge template changes automatically (optional).
    automerge: notABoolean
    
    # Templates to add to the repository (optional).
    files:           
      - source: path/to/template/filename.yaml
        destination: path/to/template-destination/filename.yaml
    `
    const configuration = parse(content)
    const cstYamlRepresentation = getCst(content)
    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
    expect(errors[0].line).toBe(5)
  })

  test('returns false and error with line when map property is wrong', async () => {
    const content = `# The template version to use (optional).
    version: v10.7.0
    
    # Whether to merge template changes automatically (optional).
    automerge: true
    
    # Templates to add to the repository (optional).
    files:           
      - source: 2
        destination: path/to/template-destination/filename.yaml
    `
    const configuration = parse(content)
    const cstYamlRepresentation = getCst(content)

    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
    expect(errors[0].line).toBe(9)
  })

  test('returns false and multiple errors with annotated line when map property is wrong', async () => {
    const content = `# The template version to use (optional).
    version: v10.7.0
    
    # Whether to merge template changes automatically (optional).
    automerge: notAboolean
    
    # Templates to add to the repository (optional).
    files:           
      - source: 2
        destination: path/to/template-destination/filename.yaml
    `
    const configuration = parse(content)
    const cstYamlRepresentation = getCst(content)
    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(2)
    expect(errors[0].line).toBe(5)
    expect(errors[1].line).toBe(9)
  })

  test('returns false and error with line when array property is wrong', async () => {
    const content = `# The template version to use (optional).
    version: v10.7.0
    
    # Whether to merge template changes automatically (optional).
    automerge: true
    
    # Templates to add to the repository (optional).
    files:           
      - 2
    `
    const configuration = parse(content)
    const cstYamlRepresentation = getCst(content)

    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
    expect(errors[0].line).toBe(9)
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

    const cstYamlRepresentation = {
      lines: [],
      tokens: [],
    }

    const valuesSchema = {
      $schema: 'http://json-schema.org/draft-07/schema',
      type: 'object',
      properties: {
        jdkVersion: {
          type: 'integer',
        },
      },
    }

    const { result, errors } = validateConfiguration(
      configuration,
      mergeSchemaToDefault(valuesSchema),
      cstYamlRepresentation,
    )
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('invalidates invalid values', async () => {
    const configuration = parse(`
        version: v10.7.0
        automerge: true
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        values: 
          jdkVersion: true
        `)

    const cstYamlRepresentation = {
      lines: [],
      tokens: [],
    }

    const valuesSchema = {
      $schema: 'http://json-schema.org/draft-07/schema',
      type: 'object',
      properties: {
        jdkVersion: {
          type: 'integer',
        },
      },
    }

    const { result, errors } = validateConfiguration(
      configuration,
      mergeSchemaToDefault(valuesSchema),
      cstYamlRepresentation,
    )
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
    expect(errors[0].line).toBeUndefined()
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
    expect(result).toEqual(expected)
  })

  test('validates valid versions', async () => {
    const configuration = parse('version: v10.7.0')
    const cstYamlRepresentation = {
      lines: [],
      tokens: [],
    }

    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('invalidates invalid versions', async () => {
    const configuration = parse('version: bla')
    const cstYamlRepresentation = {
      lines: [],
      tokens: [],
    }

    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
  })

  test('invalidates empty config', async () => {
    const configuration = parse('')
    const cstYamlRepresentation = {
      lines: [],
      tokens: [],
    }

    const { result, errors } = validateConfiguration(configuration, getDefaultSchema(), cstYamlRepresentation)
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
