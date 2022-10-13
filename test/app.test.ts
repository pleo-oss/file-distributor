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

const privateKey = fs.readFileSync(path.join(__dirname, 'fixtures/mock-cert.pem'), 'utf-8')

const zipContents = [
  80, 75, 3, 4, 10, 0, 0, 0, 0, 0, 25, 110, 30, 85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 80, 0, 9, 0, 112, 108, 101, 111,
  45, 105, 111, 45, 99, 101, 110, 116, 114, 97, 108, 105, 122, 101, 100, 45, 116, 101, 109, 112, 108, 97, 116, 101, 115,
  45, 109, 117, 115, 116, 97, 99, 104, 101, 45, 56, 55, 57, 48, 56, 57, 55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48,
  100, 101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57, 98, 54, 56, 52, 48, 101, 55, 55, 101, 55, 47, 85, 84, 5, 0, 1,
  179, 119, 14, 99, 80, 75, 3, 4, 10, 0, 0, 0, 0, 0, 25, 110, 30, 85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90, 0, 9, 0,
  112, 108, 101, 111, 45, 105, 111, 45, 99, 101, 110, 116, 114, 97, 108, 105, 122, 101, 100, 45, 116, 101, 109, 112,
  108, 97, 116, 101, 115, 45, 109, 117, 115, 116, 97, 99, 104, 101, 45, 56, 55, 57, 48, 56, 57, 55, 99, 49, 55, 57, 55,
  52, 49, 57, 100, 48, 100, 101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57, 98, 54, 56, 52, 48, 101, 55, 55, 101, 55,
  47, 116, 101, 109, 112, 108, 97, 116, 101, 115, 47, 85, 84, 5, 0, 1, 179, 119, 14, 99, 80, 75, 3, 4, 10, 0, 0, 0, 8,
  0, 25, 110, 30, 85, 168, 41, 74, 46, 120, 1, 0, 0, 245, 3, 0, 0, 102, 0, 9, 0, 112, 108, 101, 111, 45, 105, 111, 45,
  99, 101, 110, 116, 114, 97, 108, 105, 122, 101, 100, 45, 116, 101, 109, 112, 108, 97, 116, 101, 115, 45, 109, 117,
  115, 116, 97, 99, 104, 101, 45, 56, 55, 57, 48, 56, 57, 55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100, 101, 52, 48,
  55, 50, 48, 100, 54, 99, 50, 102, 57, 98, 54, 56, 52, 48, 101, 55, 55, 101, 55, 47, 116, 101, 109, 112, 108, 97, 116,
  101, 115, 47, 46, 97, 117, 116, 111, 114, 99, 46, 106, 115, 111, 110, 85, 84, 5, 0, 1, 179, 119, 14, 99, 141, 147,
  223, 74, 195, 48, 20, 198, 239, 247, 20, 135, 122, 233, 38, 21, 116, 254, 65, 196, 57, 29, 12, 84, 134, 12, 188, 16,
  145, 172, 59, 109, 35, 105, 82, 210, 212, 57, 74, 47, 124, 1, 21, 31, 64, 189, 241, 253, 124, 4, 147, 102, 99, 115,
  118, 165, 20, 2, 253, 190, 175, 231, 156, 95, 232, 201, 26, 0, 142, 152, 112, 148, 206, 33, 56, 49, 67, 209, 162, 194,
  105, 26, 85, 98, 44, 140, 152, 101, 36, 142, 175, 72, 132, 121, 110, 13, 146, 170, 80, 44, 242, 35, 161, 90, 90, 18,
  173, 71, 148, 9, 21, 156, 242, 0, 142, 68, 156, 108, 26, 241, 126, 33, 158, 152, 244, 22, 21, 199, 182, 138, 224, 108,
  58, 72, 71, 140, 38, 225, 13, 85, 225, 53, 50, 36, 9, 94, 144, 17, 50, 93, 218, 39, 44, 193, 34, 199, 197, 25, 250,
  36, 101, 170, 176, 18, 237, 41, 153, 90, 139, 205, 149, 91, 253, 6, 144, 21, 167, 249, 68, 15, 107, 198, 139, 200,
  131, 158, 179, 57, 151, 165, 109, 49, 156, 198, 101, 174, 23, 18, 30, 32, 19, 193, 144, 42, 86, 4, 126, 62, 223, 191,
  225, 210, 164, 192, 154, 201, 34, 61, 198, 196, 147, 52, 86, 26, 205, 68, 251, 220, 147, 24, 33, 87, 160, 66, 132,
  162, 50, 204, 200, 97, 18, 34, 135, 8, 101, 128, 227, 165, 110, 130, 217, 43, 220, 232, 238, 186, 174, 123, 234, 20,
  70, 222, 92, 3, 66, 121, 21, 200, 95, 183, 12, 228, 229, 25, 122, 72, 84, 42, 235, 51, 152, 162, 117, 25, 122, 219,
  157, 182, 123, 94, 205, 16, 19, 229, 133, 107, 25, 86, 220, 50, 134, 183, 15, 232, 209, 167, 218, 0, 69, 197, 186, 0,
  251, 123, 174, 187, 179, 95, 13, 64, 185, 66, 201, 9, 171, 158, 242, 245, 11, 250, 255, 130, 43, 131, 118, 237, 223,
  4, 102, 5, 128, 248, 62, 122, 118, 228, 121, 7, 232, 12, 250, 107, 111, 138, 11, 142, 101, 8, 237, 3, 243, 44, 247,
  44, 182, 102, 182, 47, 150, 76, 159, 119, 141, 188, 241, 11, 80, 75, 3, 4, 10, 0, 0, 0, 0, 0, 25, 110, 30, 85, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 98, 0, 9, 0, 112, 108, 101, 111, 45, 105, 111, 45, 99, 101, 110, 116, 114, 97, 108, 105,
  122, 101, 100, 45, 116, 101, 109, 112, 108, 97, 116, 101, 115, 45, 109, 117, 115, 116, 97, 99, 104, 101, 45, 56, 55,
  57, 48, 56, 57, 55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100, 101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57,
  98, 54, 56, 52, 48, 101, 55, 55, 101, 55, 47, 116, 101, 109, 112, 108, 97, 116, 101, 115, 47, 46, 103, 105, 116, 104,
  117, 98, 47, 85, 84, 5, 0, 1, 179, 119, 14, 99, 80, 75, 3, 4, 10, 0, 0, 0, 8, 0, 25, 110, 30, 85, 175, 17, 37, 195,
  12, 1, 0, 0, 127, 2, 0, 0, 110, 0, 9, 0, 112, 108, 101, 111, 45, 105, 111, 45, 99, 101, 110, 116, 114, 97, 108, 105,
  122, 101, 100, 45, 116, 101, 109, 112, 108, 97, 116, 101, 115, 45, 109, 117, 115, 116, 97, 99, 104, 101, 45, 56, 55,
  57, 48, 56, 57, 55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100, 101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57,
  98, 54, 56, 52, 48, 101, 55, 55, 101, 55, 47, 116, 101, 109, 112, 108, 97, 116, 101, 115, 47, 46, 103, 105, 116, 104,
  117, 98, 47, 46, 107, 111, 100, 105, 97, 107, 46, 116, 111, 109, 108, 85, 84, 5, 0, 1, 179, 119, 14, 99, 173, 144,
  193, 78, 3, 49, 12, 68, 239, 249, 138, 106, 123, 165, 32, 62, 128, 67, 207, 8, 9, 113, 93, 21, 43, 219, 184, 108, 68,
  18, 167, 142, 179, 8, 170, 254, 59, 201, 110, 91, 84, 85, 133, 11, 55, 203, 243, 52, 30, 207, 128, 156, 44, 133, 217,
  195, 236, 94, 169, 214, 35, 191, 225, 74, 233, 44, 52, 142, 224, 116, 135, 174, 136, 205, 105, 213, 40, 198, 109, 182,
  140, 112, 73, 9, 103, 84, 6, 29, 10, 66, 199, 58, 172, 123, 160, 0, 35, 115, 84, 61, 74, 79, 166, 58, 166, 109, 214,
  169, 111, 20, 69, 177, 222, 38, 177, 107, 200, 209, 104, 193, 116, 100, 35, 91, 98, 43, 246, 11, 129, 81, 155, 79, 16,
  58, 55, 155, 239, 118, 175, 218, 57, 250, 120, 36, 99, 245, 251, 178, 4, 122, 170, 250, 126, 175, 12, 65, 32, 185,
  192, 239, 174, 224, 135, 215, 111, 61, 166, 164, 107, 5, 73, 216, 70, 232, 197, 59, 88, 147, 247, 24, 228, 20, 75,
  181, 83, 206, 169, 167, 105, 62, 47, 106, 218, 253, 214, 212, 70, 187, 84, 157, 116, 140, 76, 67, 177, 42, 217, 230,
  21, 91, 78, 139, 23, 12, 52, 20, 143, 103, 78, 37, 93, 21, 224, 128, 66, 78, 200, 65, 251, 177, 166, 182, 137, 14,
  105, 209, 145, 44, 54, 214, 225, 194, 216, 154, 187, 43, 56, 55, 55, 179, 31, 145, 15, 118, 205, 106, 42, 225, 218,
  161, 177, 208, 127, 77, 241, 199, 193, 111, 80, 75, 1, 2, 0, 0, 10, 0, 0, 0, 0, 0, 25, 110, 30, 85, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 80, 0, 9, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 112, 108, 101, 111, 45, 105, 111, 45, 99,
  101, 110, 116, 114, 97, 108, 105, 122, 101, 100, 45, 116, 101, 109, 112, 108, 97, 116, 101, 115, 45, 109, 117, 115,
  116, 97, 99, 104, 101, 45, 56, 55, 57, 48, 56, 57, 55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100, 101, 52, 48, 55,
  50, 48, 100, 54, 99, 50, 102, 57, 98, 54, 56, 52, 48, 101, 55, 55, 101, 55, 47, 85, 84, 5, 0, 1, 179, 119, 14, 99, 80,
  75, 1, 2, 0, 0, 10, 0, 0, 0, 0, 0, 25, 110, 30, 85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 90, 0, 9, 0, 0, 0, 0, 0, 0, 0,
  16, 0, 0, 0, 119, 0, 0, 0, 112, 108, 101, 111, 45, 105, 111, 45, 99, 101, 110, 116, 114, 97, 108, 105, 122, 101, 100,
  45, 116, 101, 109, 112, 108, 97, 116, 101, 115, 45, 109, 117, 115, 116, 97, 99, 104, 101, 45, 56, 55, 57, 48, 56, 57,
  55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100, 101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57, 98, 54, 56, 52,
  48, 101, 55, 55, 101, 55, 47, 116, 101, 109, 112, 108, 97, 116, 101, 115, 47, 85, 84, 5, 0, 1, 179, 119, 14, 99, 80,
  75, 1, 2, 0, 0, 10, 0, 0, 0, 8, 0, 25, 110, 30, 85, 168, 41, 74, 46, 120, 1, 0, 0, 245, 3, 0, 0, 102, 0, 9, 0, 0, 0,
  0, 0, 1, 0, 0, 0, 0, 0, 248, 0, 0, 0, 112, 108, 101, 111, 45, 105, 111, 45, 99, 101, 110, 116, 114, 97, 108, 105, 122,
  101, 100, 45, 116, 101, 109, 112, 108, 97, 116, 101, 115, 45, 109, 117, 115, 116, 97, 99, 104, 101, 45, 56, 55, 57,
  48, 56, 57, 55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100, 101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57, 98,
  54, 56, 52, 48, 101, 55, 55, 101, 55, 47, 116, 101, 109, 112, 108, 97, 116, 101, 115, 47, 46, 97, 117, 116, 111, 114,
  99, 46, 106, 115, 111, 110, 85, 84, 5, 0, 1, 179, 119, 14, 99, 80, 75, 1, 2, 0, 0, 10, 0, 0, 0, 0, 0, 25, 110, 30, 85,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 98, 0, 9, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 253, 2, 0, 0, 112, 108, 101, 111, 45,
  105, 111, 45, 99, 101, 110, 116, 114, 97, 108, 105, 122, 101, 100, 45, 116, 101, 109, 112, 108, 97, 116, 101, 115, 45,
  109, 117, 115, 116, 97, 99, 104, 101, 45, 56, 55, 57, 48, 56, 57, 55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100,
  101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57, 98, 54, 56, 52, 48, 101, 55, 55, 101, 55, 47, 116, 101, 109, 112,
  108, 97, 116, 101, 115, 47, 46, 103, 105, 116, 104, 117, 98, 47, 85, 84, 5, 0, 1, 179, 119, 14, 99, 80, 75, 1, 2, 0,
  0, 10, 0, 0, 0, 8, 0, 25, 110, 30, 85, 175, 17, 37, 195, 12, 1, 0, 0, 127, 2, 0, 0, 110, 0, 9, 0, 0, 0, 0, 0, 1, 0, 0,
  0, 0, 0, 134, 3, 0, 0, 112, 108, 101, 111, 45, 105, 111, 45, 99, 101, 110, 116, 114, 97, 108, 105, 122, 101, 100, 45,
  116, 101, 109, 112, 108, 97, 116, 101, 115, 45, 109, 117, 115, 116, 97, 99, 104, 101, 45, 56, 55, 57, 48, 56, 57, 55,
  99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100, 101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57, 98, 54, 56, 52, 48,
  101, 55, 55, 101, 55, 47, 116, 101, 109, 112, 108, 97, 116, 101, 115, 47, 46, 103, 105, 116, 104, 117, 98, 47, 46,
  107, 111, 100, 105, 97, 107, 46, 116, 111, 109, 108, 85, 84, 5, 0, 1, 179, 119, 14, 99, 80, 75, 5, 6, 0, 0, 0, 0, 5,
  0, 5, 0, 243, 2, 0, 0, 39, 5, 0, 0, 40, 0, 56, 55, 57, 48, 56, 57, 55, 99, 49, 55, 57, 55, 52, 49, 57, 100, 48, 100,
  101, 52, 48, 55, 50, 48, 100, 54, 99, 50, 102, 57, 98, 54, 56, 52, 48, 101, 55, 55, 101, 55,
]

const baseNock = nock('https://api.github.com')

const configuration: RepositoryConfiguration = {
  version: undefined,
  automerge: false,
  files: [
    {
      source: 'templates/.github/.autorc.json',
      destination: '.github/.autorc.json',
    },
  ],
  values: { isEnabled: 'true' },
}

describe('Probot Tests', () => {
  let logOutput: { level: number; msg: string }[] = []
  const streamLogsToOutput = new Stream.Writable({ objectMode: true })
  streamLogsToOutput._write = (object, _, done) => {
    logOutput.push(JSON.parse(object))
    done()
  }

  let probot: Probot

  beforeEach(async () => {
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

    await probot.load(probotApp)
  })

  test('can authenticate', () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })
  })

  test('can exit early on push event from non-default branch', async () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })

    const pushEvent = {
      name: 'push',
      payload: {
        ref: 'test',
      },
    }

    await probot.receive(pushEvent as unknown as EmitterWebhookEvent)
  })

  test('can handle empty files in commit', async () => {
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

  test('can handle non-config files in commit', async () => {
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

  test('can handle error requests', async () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })
    baseNock.get('/repos/pleo-oss/test/commits/sha').reply(500, {})

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
    expect(logOutput.filter(log => log.level === 50)).toHaveLength(2)
  })

  test('can fetch changes, fetch configuration changes, render templates, create PR (smoke test)', async () => {
    baseNock.post('/app/installations/2/access_tokens').reply(200, { token: 'testToken' })
    baseNock.get('/repos/pleo-oss/test/commits/sha').reply(200, { files: [{ filename: '.config/templates.yaml' }] })
    baseNock
      .get('/repos/pleo-oss/test/contents/.config%2Ftemplates.yaml?ref=sha')
      .reply(200, { content: Buffer.from(JSON.stringify(configuration)).toString('base64') })
    baseNock
      .get('/repos/pleo-oss/template-repository/releases/latest')
      .reply(200, { zipball_url: 'test', tag_name: '1.0.0' })
    baseNock.get('/repos/pleo-oss/template-repository/zipball/1.0.0').reply(200, zipContents)
    baseNock.get('/repos/pleo-oss/test').reply(200, { default_branch: 'baseBranch' })
    baseNock.get('/repos/pleo-oss/test/git/ref/heads%2FbaseBranch').reply(200, { object: { sha: 'baseBranchRef' } })
    baseNock
      .get('/repos/pleo-oss/test/git/ref/heads%2Fcentralized-templates')
      .reply(200, { object: { sha: 'newBranch' } })
    baseNock.get('/repos/pleo-oss/test/git/commits/baseBranchRef').reply(200, { sha: 'currentCommitSha' })
    baseNock.get('/repos/pleo-oss/test/git/trees/baseBranchRef').reply(200, { tree: 'existingTree' })
    baseNock.post('/repos/pleo-oss/test/git/trees').reply(200, { sha: 'createdTreeSha' })
    baseNock.post('/repos/pleo-oss/test/git/commits').reply(200, { sha: 'newCommitSha' })
    baseNock.patch('/repos/pleo-oss/test/git/refs/heads%2Fcentralized-templates').reply(200, { ref: 'updatedRef' })
    baseNock.get('/repos/pleo-oss/test/pulls?head=refs%2Fheads%2Fcentralized-templates&state=open').reply(200, [])
    baseNock.post('/repos/pleo-oss/test/pulls').reply(200, { number: 'prNumber' })

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
    expect(errorSpy).not.toHaveBeenCalled()

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
