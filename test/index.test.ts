import nock from 'nock'
import { Context, Probot, ProbotOctokit } from 'probot'
import { describe, beforeEach, test, expect, afterEach } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import probotApp from '../src/app'
import { OctokitInstance, RepositoryConfiguration } from '../src/types'
import { PushEvent } from '@octokit/webhooks-types'
import { DeprecatedLogger } from 'probot/lib/types'
import app from '../src/app'
import { EmitterWebhookEvent } from '@octokit/webhooks'

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

const baseNock = nock('https://api.github.com')

describe('Probot Tests', () => {
  let probot: Probot

  beforeEach(async () => {
    process.env['BRANCHES_TO_PROCESS'] = 'main'
    process.env['TEMPLATE_REPOSITORY_OWNER'] = 'pleo-oss'
    process.env['TEMPLATE_REPOSITORY_NAME'] = 'template-repository'

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

    await probot.load(probotApp)
  })

  test('can authenticate', () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })
  })

  test('will exit early on push event from non-default branch', async () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })

    const pushEvent = {
      name: 'push',
      payload: {
        ref: 'test',
      },
    }

    await probot.receive(pushEvent as unknown as EmitterWebhookEvent)
  })

  test('will handle empty files in commit', async () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })
    baseNock.get('/repos/pleo-oss/test/commits/sha').reply(200, { files: [] })

    const pushEvent = {
      name: 'push',
      payload: {
        after: 'sha',
        ref: 'main',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
        },
      },
    }

    await probot.receive(pushEvent as unknown as EmitterWebhookEvent)
  })

  test('will handle non-config files in commit', async () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })
    baseNock.get('/repos/pleo-oss/test/commits/sha').reply(200, { files: [{ filename: 'somefile.txt' }] })

    const pushEvent = {
      name: 'push',
      payload: {
        after: 'sha',
        ref: 'main',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
        },
      },
    }

    await probot.receive(pushEvent as unknown as EmitterWebhookEvent)
  })

  test('will handle error requests when fetching commit changes', async () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })
    baseNock.get('/repos/pleo-oss/test/commits/sha').reply(500, {})

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()

    const pushEvent = {
      name: 'push',
      payload: {
        after: 'sha',
        ref: 'main',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
        },
      },
    }

    await probot.receive(pushEvent as unknown as EmitterWebhookEvent)
    expect(errorSpy).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith(`Failed to process commit '${pushEvent.payload.after}' with error:`)

    errorSpy.mockRestore()
  })

  const existingEnv = process.env
  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
    process.env = { ...existingEnv }
    delete process.env.NODE_ENV
  })
})
