import { checks } from '../src/checks'
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

  const { createCheckRun, resolveCheckRun } = checks(log, octokitMock)

  describe('Create check calls', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('can call GitHub with a proper check', async () => {
      const testInput = {
        ...testRepository,
        sha: testSha,
      }

      await createCheckRun(testInput)

      expect(octokitMock.checks.create).toBeCalledTimes(1)
      expect(octokitMock.checks.create).toHaveBeenCalledWith({
        headers: {
          accept: 'application/vnd.github.v3+json',
        },
        ...testRepository,
        name: 'Configuration validation',
        head_sha: testSha,
        status: 'queued',
        output: {
          title: 'Template schema validation',
          summary: 'Validation is queued',
        },
      })
    })

    test('will not call GitHub multiple times with different checks', async () => {
      const testInput = {
        ...testRepository,
        sha: testSha,
      }
      await createCheckRun(testInput)

      expect(octokitMock.checks.create).toBeCalledTimes(1)
      expect(octokitMock.checks.create).not.toHaveBeenCalledWith({
        ...testRepository,
        name: 'Configuration validation',
        head_sha: testSha,
        status: 'queued',
        output: {
          title: 'Template schema validation',
          summary: 'Validation is queued',
        },
      })
    })

    test('will throw check exception when check creation throws', async () => {
      const { createCheckRun } = checks(log, throwingOctokit)

      const testInput = {
        owner: 'pleo',
        repo: 'workflow',
        sha: testSha,
      }

      expect.assertions(1)
      return createCheckRun(testInput).catch(e => expect(e.message).toMatch('Error'))
    })
  })

  describe('Update check calls', () => {
    const testInput = {
      ...testRepository,
      sha: testSha,
      conclusion: 'failure',
      checkRunId: 98,
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('can resolve GitHub checks', async () => {
      await resolveCheckRun(testInput)

      expect(octokitMock.checks.update).toBeCalledTimes(1)
      expect(octokitMock.checks.update).toHaveBeenCalledWith({
        headers: {
          accept: 'application/vnd.github.v3+json',
        },
        check_run_id: testInput.checkRunId,
        conclusion: testInput.conclusion,
        ...testRepository,
        head_sha: testInput.sha,
        name: 'Configuration validation',
        status: 'completed',
        output: {
          title: 'Template schema validation',
          summary: testInput.conclusion,
        },
      })
    })

    test('will not call GitHub multiple times with different checks', async () => {
      const testInput = {
        ...testRepository,
        sha: testSha,
        conclusion: 'failure',
        checkRunId: 98,
      }

      await resolveCheckRun(testInput)

      expect(octokitMock.checks.update).toBeCalledTimes(1)
      expect(octokitMock.checks.update).not.toHaveBeenCalledWith({
        headers: {
          accept: 'application/vnd.github.v3+json',
        },
        owner: 'not-pleo',
        repo: testInput.repo,
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
        ...testRepository,
        sha: testSha,
        conclusion: 'failure',
        checkRunId: 98,
      }

      const { resolveCheckRun } = checks(log, throwingOctokit)

      expect.assertions(1)
      await resolveCheckRun(testInput).catch(e => expect(e.message).toMatch('Error'))
    })
  })
})
