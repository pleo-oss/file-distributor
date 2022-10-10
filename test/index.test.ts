import nock from 'nock'
import { Probot, ProbotOctokit } from 'probot'
import { describe, beforeEach, test, expect, afterEach } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import probotApp from '../src/app'
import { RepositoryConfiguration } from '../src/types'
import { PushEvent } from '@octokit/webhooks-types'

const privateKey = fs.readFileSync(path.join(__dirname, 'fixtures/mock-cert.pem'), 'utf-8')

const configuration: RepositoryConfiguration = {
  version: undefined,
  automerge: false,
  files: [
    {
      source: 'templates/github/destination.yaml',
      destination: 'github/destination.yaml',
    },
  ],
  values: { isEnabled: 'true' },
}

describe('Probot Tests', () => {
  let probot: Probot

  beforeEach(() => {
    nock.disableNetConnect()
    probot = new Probot({
      appId: 123,
      privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    })
    probot.load(probotApp)
  })

  test('can authenticate', async () => {
    const mock = nock('https://api.github.com')
      .post('/app/installations/v2/access_tokens')
      .reply(200, {
        token: 'test',
        permissions: {
          push: 'read',
        },
      })

    probot.on('push', () => ({}))

    expect(mock.pendingMocks()).toStrictEqual(['POST https://api.github.com:443/app/installations/v2/access_tokens'])
  })

  test('can read repository configuration', async () => {
    const mock = nock('https://api.github.com')
      .get('/repos/pleo-io/probot-test/probot-test.yaml')
      .reply(200, configuration)
      .post('/repos/pleo-io/probot-test/commit', body => body)
      .reply(200)

    const pushPayload = {}

    await probot.receive({ name: 'push', id: '', payload: pushPayload as PushEvent })

    expect(mock.activeMocks()).toStrictEqual([
      'GET https://api.github.com:443/repos/pleo-io/probot-test/probot-test.yaml',
      'POST https://api.github.com:443/repos/pleo-io/probot-test/commit',
    ])
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })
})
