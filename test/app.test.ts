import nock from 'nock'
import { Probot, ProbotOctokit } from 'probot'
import { describe, beforeEach, test, expect, afterEach } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import probotApp from '../src/app'
import { EmitterWebhookEvent } from '@octokit/webhooks'
import { RepositoryConfiguration } from '../src/types'
import { Stream } from 'stream'
import { pino } from 'pino'
import JSZip from 'jszip'

const privateKey = fs.readFileSync(path.join(__dirname, 'fixtures/mock-cert.pem'), 'utf-8')
const autorcContent = fs.readFileSync(path.join(__dirname, 'fixtures/.autorc.json'), 'utf-8')
const kodiakContent = fs.readFileSync(path.join(__dirname, 'fixtures/.kodiak.toml'), 'utf-8')
const defaultsContent = fs.readFileSync(path.join(__dirname, 'fixtures/defaults.yaml'), 'utf-8')

const contentToZip = new JSZip()
contentToZip.folder('pleo-io-centralized-templates-mustache-8790897c1797419d0de40720d6c2f9b6840e77e7/')
contentToZip.folder('pleo-io-centralized-templates-mustache-8790897c1797419d0de40720d6c2f9b6840e77e7/templates')
contentToZip.file(
  'pleo-io-centralized-templates-mustache-8790897c1797419d0de40720d6c2f9b6840e77e7/defaults.yaml',
  defaultsContent,
)
contentToZip.file(
  'pleo-io-centralized-templates-mustache-8790897c1797419d0de40720d6c2f9b6840e77e7/.autorc.json',
  autorcContent,
)
contentToZip.folder('pleo-io-centralized-templates-mustache-8790897c1797419d0de40720d6c2f9b6840e77e7/.github')
contentToZip.file(
  'pleo-io-centralized-templates-mustache-8790897c1797419d0de40720d6c2f9b6840e77e7/.github/.kodiak.toml',
  kodiakContent,
)

let zipContents: number[]

const baseNock = nock('https://api.github.com')

let configuration: RepositoryConfiguration

describe('Probot Tests', () => {
  let logOutput: { level: number; msg: string }[] = []
  const streamLogsToOutput = new Stream.Writable({ objectMode: true })
  streamLogsToOutput._write = (object, _, done) => {
    logOutput.push(JSON.parse(object))
    done()
  }

  let probot: Probot

  beforeEach(async () => {
    configuration = {
      version: 'v0.0.7',
      automerge: false,
      files: [
        {
          source: 'templates/.github/.autorc.json',
          destination: '.github/.autorc.json',
        },
      ],
      values: { isEnabled: 'true' },
    }

    logOutput = []

    process.env['BRANCHES_TO_PROCESS'] = 'main'
    process.env['TEMPLATE_REPOSITORY_OWNER'] = 'pleo-oss'
    process.env['TEMPLATE_REPOSITORY_NAME'] = 'template-repository'

    nock.disableNetConnect()

    probot = new Probot({
      appId: 123,
      privateKey,
      githubToken: 'testToken',
      log: pino(streamLogsToOutput),
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    })

    zipContents = Array.from(new Uint8Array(await contentToZip.generateAsync({ type: 'uint8array' })))

    await probot.load(probotApp)
  })

  test('can authenticate', () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })
  })

  test('can exit early on push event from non-default branch', async () => {
    const pushEvent = {
      name: 'push',
      payload: {
        ref: 'test',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
          default_branch: 'main',
        },
      },
    }

    await probot.receive(pushEvent as unknown as EmitterWebhookEvent)
    expect(baseNock.isDone()).toBeTruthy()
  })

  test('can handle empty files in commit', async () => {
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
    expect(baseNock.isDone()).toBeTruthy()
  })

  test('can handle non-config files in commit', async () => {
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
    expect(baseNock.isDone()).toBeTruthy()
  })

  test('can handle error requests', async () => {
    baseNock.get('/repos/pleo-oss/test/commits/sha').reply(500, {})

    const pushEvent = {
      name: 'push',
      payload: {
        after: 'sha',
        ref: 'main',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
          default_branch: 'main',
        },
      },
    }

    await expect(probot.receive(pushEvent as unknown as EmitterWebhookEvent)).rejects.toThrow(Error)
  })

  test('can fetch changes, fetch configuration changes, render templates, create PR (smoke test)', async () => {
    baseNock
      .get('/repos/pleo-oss/test/commits/sha?defaultBranch=baseBranch')
      .reply(200, { files: [{ filename: '.github/templates.yaml' }] })

    baseNock
      .get('/repos/pleo-oss/test/contents/.github%2Ftemplates.yaml?defaultBranch=baseBranch&ref=sha')
      .reply(200, { content: Buffer.from(JSON.stringify(configuration)).toString('base64') })

    baseNock
      .persist()
      .get('/repos/pleo-oss/template-repository/releases/tags/v0.0.7')
      .reply(200, { zipball_url: 'test', tag_name: '0.0.7' })

    baseNock.get('/repos/pleo-oss/template-repository/zipball/0.0.7').reply(200, zipContents)
    baseNock
      .get('/repos/pleo-oss/test/git/ref/heads%2FbaseBranch?defaultBranch=baseBranch')
      .reply(200, { object: { sha: 'baseBranchRef' } })

    baseNock
      .get('/repos/pleo-oss/test/git/ref/heads%2Fcentralized-files?defaultBranch=baseBranch')
      .reply(200, { ref: 'updatedRef' })

    baseNock.post('/repos/pleo-oss/test/git/trees').reply(200, { sha: 'createdTreeSha' })
    baseNock.post('/repos/pleo-oss/test/git/commits').reply(200, { sha: 'newCommitSha' })

    baseNock.patch('/repos/pleo-oss/test/git/refs/heads%2Fcentralized-files').reply(200)

    baseNock
      .get('/repos/pleo-oss/test/compare/baseBranch...newCommitSha?defaultBranch=baseBranch')
      .reply(200, { files: ['somefile'] })

    baseNock
      .get('/repos/pleo-oss/test/pulls?defaultBranch=baseBranch&head=pleo-oss:centralized-files&state=open')
      .reply(200, [])

    baseNock.post('/repos/pleo-oss/test/pulls').reply(200, { number: 'prNumber' })

    const pushEvent = {
      name: 'push',
      payload: {
        after: 'sha',
        ref: 'baseBranch',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
          default_branch: 'baseBranch',
        },
      },
    }

    await probot.receive(pushEvent as unknown as EmitterWebhookEvent)
    expect(baseNock.isDone()).toBeTruthy()
  })

  test('can receive a pull request event without a template configuration change and process the event', async () => {
    baseNock.get('/repos/pleo-oss/test/pulls/27/files').reply(200, [
      {
        filename: '.github/not-config-templates.yaml',
      },
    ])

    const pullRequestEvent = {
      name: 'pull_request',
      payload: {
        action: 'opened',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
        },
        number: 27,
        pull_request: {
          head: {
            ref: 'sha',
          },
        },
      },
    }

    await probot.receive(pullRequestEvent as unknown as EmitterWebhookEvent)
    expect(baseNock.isDone()).toBeTruthy()
  })

  test('can receive a pull request event with a template configuration change and process the event', async () => {
    baseNock
      .get('/repos/pleo-oss/test/contents/.github%2Ftemplates.yaml')
      .reply(200, { content: Buffer.from(JSON.stringify(configuration)).toString('base64') })
    baseNock
      .persist()
      .get('/repos/pleo-oss/template-repository/releases/tags/v0.0.7')
      .reply(200, { zipball_url: 'test', tag_name: '0.0.7' })
    baseNock.get('/repos/pleo-oss/template-repository/zipball/0.0.7').reply(200, zipContents)

    baseNock.get('/repos/pleo-oss/test/pulls/27/files').reply(200, [{ filename: '.github/templates.yaml' }])
    baseNock.patch('/repos/pleo-oss/test/check-runs/').reply(200)
    baseNock.post('/repos/pleo-oss/test/check-runs').reply(200)
    baseNock.post('/repos/pleo-oss/test/pulls/27/reviews').reply(200)

    const pullRequestEvent = {
      name: 'pull_request',
      payload: {
        action: 'opened',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
        },
        number: 27,
        pull_request: {
          head: {
            ref: 'sha',
          },
        },
      },
    }

    await probot.receive(pullRequestEvent as unknown as EmitterWebhookEvent)
    expect(baseNock.isDone()).toBeTruthy()
  })

  test('can receive a pull request event with a wrong template configuration change and process the event', async () => {
    configuration.version = 'wrongversion'
    baseNock
      .get('/repos/pleo-oss/test/contents/.github%2Ftemplates.yaml')
      .reply(200, { content: Buffer.from(JSON.stringify(configuration)).toString('base64') })
    baseNock.get('/repos/pleo-oss/test/pulls/27/files').reply(200, [{ filename: '.github/templates.yaml' }])
    baseNock.get('/repos/pleo-oss/template-repository/releases/tags/wrongversion').reply(404)
    baseNock.patch('/repos/pleo-oss/test/check-runs/').reply(200)
    baseNock.post('/repos/pleo-oss/test/check-runs').reply(200)
    baseNock.post('/repos/pleo-oss/test/pulls/27/reviews').reply(200)

    const pullRequestEvent = {
      name: 'pull_request',
      payload: {
        action: 'opened',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
        },
        number: 27,
        pull_request: {
          head: {
            ref: 'sha',
          },
        },
      },
    }

    await probot.receive(pullRequestEvent as unknown as EmitterWebhookEvent)
    expect(baseNock.isDone()).toBeTruthy()
  })

  test('can receive a check rerun request event with and process the event', async () => {
    baseNock
      .get('/repos/pleo-oss/test/contents/.github%2Ftemplates.yaml?ref=sha')
      .reply(200, { content: Buffer.from(JSON.stringify(configuration)).toString('base64') })
    baseNock.get('/repos/pleo-oss/test/pulls/27/files').reply(200, [{ filename: '.github/templates.yaml' }])
    baseNock
      .persist()
      .get('/repos/pleo-oss/template-repository/releases/tags/v0.0.7')
      .reply(200, { zipball_url: 'test', tag_name: '0.0.7' })

    baseNock.patch('/repos/pleo-oss/test/check-runs/1').reply(200)

    baseNock.post('/repos/pleo-oss/test/pulls/27/reviews').reply(200)
    baseNock.get('/repos/pleo-oss/template-repository/zipball/0.0.7').reply(200, zipContents)

    const checkRerunRequest = {
      name: 'check_run',
      payload: {
        action: 'rerequested',
        repository: {
          owner: { login: 'pleo-oss' },
          name: 'test',
        },
        check_run: {
          id: 1,
          pull_requests: [
            {
              head: {
                sha: 'sha',
              },
              number: 27,
            },
          ],
        },
      },
    }

    await probot.receive(checkRerunRequest as unknown as EmitterWebhookEvent)
    expect(baseNock.isDone()).toBeTruthy()
  })

  const existingEnv = process.env
  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
    process.env = { ...existingEnv }
    delete process.env.NODE_ENV
  })
})
