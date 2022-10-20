import { createCheckRun, resolveCheckRun } from '../src/checks'
import { OctokitInstance } from '../src/types'
import { Logger } from 'probot'

describe('Github api calls', () => {
  const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger
  const octokitMock = {
    checks: {
      create: jest.fn(() => {
        return {
          data: {
            id: 'checkId',
          },
        }
      }),
      update: jest.fn(() => {
        return {
          data: {
            conclusion: 'success',
          },
        }
      }),
    },
  } as unknown as OctokitInstance

  const throwingOctokit = {
    checks: {
      create: jest.fn(() => {
        throw Error('Error')
      }),
      update: jest.fn(() => {
        throw Error('Error')
      }),
    },
  } as unknown as OctokitInstance

  const testRepository = {
    owner: 'pleo',
    repo: 'workflows',
  }

  const testSha = 'some-sha'

  describe('Create check calls', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('can call GitHub with a proper check', async () => {
      await createCheckRun(testRepository, testSha)(log)(octokitMock)

      expect(octokitMock.checks.create).toBeCalledTimes(1)
      expect(octokitMock.checks.create).toHaveBeenCalledWith({
        headers: {
          accept: 'application/vnd.github.v3+json',
        },
        ...testRepository,
        name: 'Template Config Validation',
        head_sha: testSha,
        status: 'queued',
        output: {
          title: 'Template schema validation',
          summary: 'Validation is queued',
        },
      })
    })

    test('will not call GitHub multiple times with different checks', async () => {
      await createCheckRun(testRepository, testSha)(log)(octokitMock)

      expect(octokitMock.checks.create).toBeCalledTimes(1)
      expect(octokitMock.checks.create).not.toHaveBeenCalledWith({
        ...testRepository,
        name: 'Template Config Validation',
        head_sha: testSha,
        status: 'queued',
        output: {
          title: 'Template schema validation',
          summary: 'Validation is queued',
        },
      })
    })

    test('will throw check exception when check creation throws', async () => {
      expect.assertions(1)
      return createCheckRun(
        testRepository,
        testSha,
      )(log)(throwingOctokit).catch(e => expect(e.message).toMatch('Error'))
    })
  })

  describe('Update check calls', () => {
    const testInput = {
      sha: testSha,
      conclusion: 'failure',
      checkRunId: 98,
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('can resolve GitHub checks', async () => {
      await resolveCheckRun(testRepository, testInput)(log)(octokitMock)

      expect(octokitMock.checks.update).toBeCalledTimes(1)
      expect(octokitMock.checks.update).toHaveBeenCalledWith({
        headers: {
          accept: 'application/vnd.github.v3+json',
        },
        check_run_id: testInput.checkRunId,
        conclusion: testInput.conclusion,
        ...testRepository,
        head_sha: testInput.sha,
        name: 'Template Config Validation',
        status: 'completed',
        output: {
          title: 'Template schema validation',
          summary: testInput.conclusion,
        },
      })
    })

    test('will not call GitHub multiple times with different checks', async () => {
      const testInput = {
        sha: testSha,
        conclusion: 'failure',
        checkRunId: 98,
      }

      await resolveCheckRun(testRepository, testInput)(log)(octokitMock)

      expect(octokitMock.checks.update).toBeCalledTimes(1)
      expect(octokitMock.checks.update).not.toHaveBeenCalledWith({
        headers: {
          accept: 'application/vnd.github.v3+json',
        },
        owner: 'not-pleo',
        repo: testRepository.repo,
        head_sha: testInput.sha,
        check_run_id: testInput.checkRunId,
        status: 'completed',
        output: {
          title: 'Template schema validation',
          summary: testInput.conclusion,
        },
      })
    })

    test('will throw check exception when updating checks throws', async () => {
      const testInput = {
        sha: testSha,
        conclusion: 'failure',
        checkRunId: 98,
      }

      expect.assertions(1)
      await resolveCheckRun(
        testRepository,
        testInput,
      )(log)(throwingOctokit).catch(e => expect(e.message).toMatch('Error'))
    })
  })
})
