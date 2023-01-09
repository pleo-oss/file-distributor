import { Logger } from 'probot'
import { OctokitInstance, RepositoryConfiguration } from '../src/types'
import { combineConfigurations, configuration as configurationSetup } from '../src/configuration'
import * as E from 'fp-ts/Either'
import { YAMLError } from 'yaml'

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

    const either = await determineConfigurationChanges('', repositoryDetails, '')

    expect(E.isRight(either)).toBeTruthy()
    if (E.isRight(either)) {
      expect(either.right).toEqual(expected)
    }
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

    const result = await determineConfigurationChanges('', repositoryDetails, '')

    expect(E.isLeft(result)).toBeTruthy()
    if (E.isLeft(result)) {
      expect(result.left).toBeInstanceOf(Array)
      result.left.every(e => expect(e).toBeInstanceOf(YAMLError))
    }
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
