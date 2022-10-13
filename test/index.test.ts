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
      githubToken: 'testToken',
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    })
    probot.load(probotApp)
  })

  test('can authenticate', async () => {
    nock('https://api.github.com').post('/app/installations/2/access_tokens').reply(200, { token: 'test' })
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })
})
