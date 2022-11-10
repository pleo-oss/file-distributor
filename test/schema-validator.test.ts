import { Logger } from 'probot'
import { LineCounter, parse, Parser } from 'yaml'
import { schemaValidator } from '../src/schema-validator'
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
  const { generateSchema, validateTemplateConfiguration, validateFiles } = schemaValidator(log)

  test('returns false for an invalid input', async () => {
    const input = {
      repositoryConfiguration: parse('DFds'),
      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    }

    const { result, errors } = validateTemplateConfiguration(input)
    expect(result).toBeFalsy()
    expect(errors?.length).not.toEqual(0)
  })

  test('returns false for undefined input', async () => {
    const { result, errors } = validateTemplateConfiguration({
      repositoryConfiguration: undefined,
      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    })
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
    const { result, errors } = validateTemplateConfiguration({
      repositoryConfiguration: input,
      cstYamlRepresentation: {
        tokens: [],
        lines: [],
      },
    })
    expect(result).toBeFalsy()
    expect(errors?.length).not.toEqual(0)
  })

  test('returns true for a null value on a nullable type', async () => {
    const configuration = {
      repositoryConfiguration: parse(`
        # The template version to use (optional).
        version: v10.7.0
        
        # Whether to merge template changes automatically (optional).
        automerge: null
        
        # Templates to add to the repository (optional).
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
            `),

      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    }
    const { result, errors } = validateTemplateConfiguration(configuration)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('returns true for a valid schema', async () => {
    const configuration = {
      repositoryConfiguration: parse(`
        # The template version to use (optional).
        version: v10.7.0
        
        # Whether to merge template changes automatically (optional).
        automerge: true
        
        # Templates to add to the repository (optional).
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        `),

      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    }
    const { result, errors } = validateTemplateConfiguration(configuration)
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
    const configuration = {
      repositoryConfiguration: parse(content),

      cstYamlRepresentation: getCst(content),
    }
    const { result, errors } = validateTemplateConfiguration(configuration)
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
    const configuration = {
      repositoryConfiguration: parse(content),

      cstYamlRepresentation: getCst(content),
    }
    const { result, errors } = validateTemplateConfiguration(configuration)
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
    const configuration = {
      repositoryConfiguration: parse(content),

      cstYamlRepresentation: getCst(content),
    }
    const { result, errors } = validateTemplateConfiguration(configuration)
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
    const configuration = {
      repositoryConfiguration: parse(content),

      cstYamlRepresentation: getCst(content),
    }
    const { result, errors } = validateTemplateConfiguration(configuration)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
    expect(errors[0].line).toBe(9)
  })

  test('validates valid values', async () => {
    const configuration = {
      repositoryConfiguration: parse(`
        version: v10.7.0
        automerge: true
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        values: 
          jdkVersion: 17
        `),

      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    }

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

  test('invalidates invalid values', async () => {
    const configuration = {
      repositoryConfiguration: parse(`
        version: v10.7.0
        automerge: true
        files:           
          - source: path/to/template/filename.yaml
            destination: path/to/template-destination/filename.yaml
        values: 
          jdkVersion: true
        `),

      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    }

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
    expect(JSON.parse(result as string)).toEqual(expected)
  })

  test('validates valid versions', async () => {
    const configuration = {
      repositoryConfiguration: parse('version: v10.7.0'),
      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    }

    const { result, errors } = validateTemplateConfiguration(configuration)
    expect(result).toBeTruthy()
    expect(errors?.length).toEqual(0)
  })

  test('invalidates invalid versions', async () => {
    const configuration = {
      repositoryConfiguration: parse('version: bla'),
      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    }

    const { result, errors } = validateTemplateConfiguration(configuration)
    expect(result).toBeFalsy()
    expect(errors?.length).toEqual(1)
  })

  test('invalidates empty config', async () => {
    const configuration = {
      repositoryConfiguration: parse(''),
      cstYamlRepresentation: {
        lines: [],
        tokens: [],
      },
    }

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
