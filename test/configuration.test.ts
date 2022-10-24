import { Logger } from 'probot'
import { OctokitInstance, RepositoryConfiguration } from '../src/types'
import { combineConfigurations, configuration as configurationSetup } from '../src/configuration'

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

    const result = await determineConfigurationChanges('', repositoryDetails, '')

    expect(result).toEqual(expected)
  })

  test('combines configurations as expected', () => {
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

    const result = combineConfigurations(base, override)
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
