import { OctokitInstance, Check } from '../src/types'
import { Logger } from 'probot'
import { git } from '../src/git'
import { resolveCheck } from '../src/checks'
import { check } from 'prettier'

describe('Github api calls', () => {
  const log = {
    info: () => ({}),
    error: () => ({}),
    debug: () => ({}),
  } as unknown as Logger
  const octokitMock = {
    checks: {
      create: jest.fn(() => {
        return Promise.resolve({
          data: {
            id: 'checkId',
          },
        })
      }),
      update: jest.fn(() => {
        return Promise.resolve({
          data: {
            conclusion: 'success',
          },
        })
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

  const { createCheck } = git(log, octokitMock)

  describe('Create checks', () => {
    const testInput: Check = {
      ...testRepository,
      sha: testSha,
      conclusion: 'neutral',
      checkRunId: undefined,
      errors: [],
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('calls GitHub with a proper check', async () => {
      await createCheck(testInput)

      expect(octokitMock.checks.create).toBeCalledTimes(1)
      expect(octokitMock.checks.create).toHaveBeenCalledWith({
        ...testRepository,
        name: 'Configuration validation',
        head_sha: testSha,
        status: 'queued',
        output: {
          title: 'Schema validation',
          summary: 'Validation queued',
        },
      })
    })

    test('will not call GitHub multiple times with different checks', async () => {
      const input = {
        ...testInput,
        sha: testSha,
      }
      await createCheck(input)

      expect(octokitMock.checks.create).toBeCalledTimes(1)
    })

    test('will throw check exception when check creation throws', async () => {
      const { createCheck } = git(log, throwingOctokit)
      const input = {
        ...testInput,
        owner: 'pleo',
        repo: 'workflow',
        sha: testSha,
      }

      expect.assertions(1)
      return createCheck(input).catch(e => expect(e.message).toMatch('Error'))
    })
  })

  describe('Update checks', () => {
    const testInput: Check = {
      ...testRepository,
      sha: testSha,
      conclusion: 'neutral',
      checkRunId: undefined,
      errors: [],
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('calls octokit to update check with success', async () => {
      const { updateCheck } = git(log, octokitMock)
      const successCheckInput: Check = {
        ...testInput,
        sha: testSha,
        conclusion: 'success',
        checkRunId: 98,
        errors: [],
      }

      const check = resolveCheck(successCheckInput)
      await updateCheck(check)

      expect(octokitMock.checks.update).toBeCalledTimes(1)
      expect(octokitMock.checks.update).toHaveBeenCalledWith({
        check_run_id: successCheckInput.checkRunId,
        conclusion: successCheckInput.conclusion,
        ...testRepository,
        head_sha: successCheckInput.sha,
        name: 'Configuration validation',
        status: 'completed',
        output: {
          title: 'Schema validation',
          summary: 'success',
        },
      })
    })

    test('calls octokit to update check with failure', async () => {
      const { updateCheck } = git(log, octokitMock)

      const errorCheckInput: Check = {
        ...testInput,
        sha: testSha,
        conclusion: 'failure',
        checkRunId: 98,
        errors: [],
      }

      const check = resolveCheck(errorCheckInput)
      await updateCheck(check)

      expect(octokitMock.checks.update).toBeCalledTimes(1)
      expect(octokitMock.checks.update).toHaveBeenCalledWith({
        check_run_id: errorCheckInput.checkRunId,
        conclusion: errorCheckInput.conclusion,
        ...testRepository,
        head_sha: errorCheckInput.sha,
        name: 'Configuration validation',
        status: 'completed',
        output: {
          title: 'Schema validation',
          summary:
            'There was an unexpected error running the check. Please try again and if the error persists contact the stewards.',
        },
      })
    })

    test('calls octokit to update check with an action required', async () => {
      const { updateCheck } = git(log, octokitMock)
      const actionRequiredCheckInput: Check = {
        ...testInput,
        sha: testSha,
        conclusion: 'action_required',
        checkRunId: 98,
        errors: [
          {
            message: 'There is an error',
            line: 1,
          },
        ],
      }

      const check = resolveCheck(actionRequiredCheckInput, '.github/templates.yaml')
      await updateCheck(check)

      expect(octokitMock.checks.update).toBeCalledTimes(1)
      expect(octokitMock.checks.update).toHaveBeenCalledWith({
        owner: 'pleo',
        repo: actionRequiredCheckInput.repo,
        head_sha: actionRequiredCheckInput.sha,
        check_run_id: actionRequiredCheckInput.checkRunId,
        status: 'completed',
        conclusion: 'action_required',
        name: 'Configuration validation',
        text: undefined,
        output: {
          title: 'Schema validation',
          summary: 'The following errors are present:',
          annotations: [
            {
              path: '.github/templates.yaml',
              start_line: 1,
              end_line: 1,
              annotation_level: 'failure',
              message: 'There is an error',
            },
          ],
        },
      })
    })

    test('will throw check exception when updating checks throws', async () => {
      const input: Check = {
        ...testInput,
        sha: testSha,
        conclusion: 'failure',
        checkRunId: 98,
        errors: [],
      }

      const { updateCheck } = git(log, throwingOctokit)

      expect.assertions(1)
      const check = resolveCheck(input, '.github/templates.yaml')

      try {
        await updateCheck(check)
      } catch (e) {
        expect(e.message).toMatch('Error')
      }
    })
  })
})
