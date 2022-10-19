import { determineConfigurationChanges } from '../lib/configuration'
import { Logger } from 'probot'
import { OctokitInstance } from '../src/types'

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

    const result = await determineConfigurationChanges('', repositoryDetails, '')(log)(mockedOctokit)

    expect(result).toEqual(expected)
  })
})
