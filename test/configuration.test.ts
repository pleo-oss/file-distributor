import { Logger } from 'probot'
import { OctokitInstance, RepositoryConfiguration } from '../src/types'
import { combineConfigurations, configuration as configurationSetup } from '../src/configuration'
import { YAMLParseError } from 'yaml'

describe('Configuration', () => {
  const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger

  test('enriches configuration contents with repository details', async () => {
    const configuration = `
version: 1.1.1
automerge: false
values: 
  someValue: 42
`

    const mockedOctokit = {
      repos: {
        getContent: () => {
          return { data: { content: Buffer.from(configuration, 'binary').toString('base64') } }
        },
      },
    } as unknown as OctokitInstance

    const { determineConfigurationChanges } = configurationSetup(log, mockedOctokit)

    const repositoryDetails = { repo: 'repository', owner: 'pleo-oss', defaultBranch: 'main' }

    const expected = {
      values: {
        defaultBranch: 'main',
        repositoryName: 'repository',
        someValue: 42,
      },
      version: '1.1.1',
      automerge: false,
    }

    const result = await determineConfigurationChanges(configuration, '', repositoryDetails)
    expect(result.type === 'present' && result.value).toEqual(expected)
  })

  test('when receiving a broken YAML it should not break and report failures', async () => {
    const configuration = `
version: 1.1.1
automerge: false
values:
  autoApproveRenovatePrs: true
   someValue: 42
`

    const mockedOctokit = {
      repos: {
        getContent: () => {
          return { data: { content: Buffer.from(configuration, 'binary').toString('base64') } }
        },
      },
    } as unknown as OctokitInstance

    const { determineConfigurationChanges } = configurationSetup(log, mockedOctokit)

    const repositoryDetails = { repo: 'repository', owner: 'pleo-oss', defaultBranch: 'main' }

    const result = await determineConfigurationChanges(configuration, '', repositoryDetails)
    expect(result.type === 'error' && result.errors[0]).toBeInstanceOf(YAMLParseError)
  })

  test('combines configurations as expected', async () => {
    const base: RepositoryConfiguration = {
      version: 'v2.0.0',
      files: [{ destination: 'destination', source: 'source' }],
      values: { someValue: '42' },
    }

    const override: Omit<RepositoryConfiguration, 'version'> = {
      files: [
        { destination: 'destination', source: 'source' },
        { destination: 'destination2', source: 'source2' },
      ],
      values: { someValue: 'hello', someOtherValue: '43' },
    }

    const result = await combineConfigurations(base, override)
    const expected = {
      version: 'v2.0.0',
      files: [
        { destination: 'destination', source: 'source' },
        { destination: 'destination2', source: 'source2' },
      ],
      values: { someValue: 'hello', someOtherValue: '43' },
    }

    expect(result).toEqual(expected)
  })
})
