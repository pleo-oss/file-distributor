import nock from 'nock';
import { Probot, ProbotOctokit } from 'probot';
import {
  describe, beforeEach, test, expect, afterEach,
} from '@jest/globals';
import fs from 'fs';
import path from 'path';
import probotApp from '../src/app';
import payload from './fixtures/issues.opened.json';

const pushBody = { };

const privateKey = fs.readFileSync(
  path.join(__dirname, 'fixtures/mock-cert.pem'),
  'utf-8',
);

describe('My Probot app', () => {
  let probot: any;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    // Load our app into probot
    probot.load(probotApp);
  });

  test('creates a comment when an issue is opened', async () => {
    const mock = nock('https://api.github.com')
      // Test that we correctly return a test token
      .post('/app/installations/2/access_tokens')
      .reply(200, {
        token: 'test',
        permissions: {
          push: 'read',
        },
      })

      .post('/repos/probot-test', (body: any) => {
        expect(body).toMatchObject(pushBody);
        return true;
      })
      .reply(200);

    await probot.receive({ name: 'push', payload });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});
