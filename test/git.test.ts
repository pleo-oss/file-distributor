import { approvePullRequestChanges, requestPullRequestChanges } from '../src/git'
import { OctokitInstance } from '../src/types'
import { Logger } from 'probot'

describe('Pull Request reviews', () => {
  const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger
  const octokitMock = {
    pulls: {
      createReview: jest.fn(() => {
        return {
          data: {
            id: 'reviewId',
          },
        }
      }),
    },
  } as unknown as OctokitInstance

  const testRepository = {
    owner: 'pleo',
    repo: 'workflows',
  }

  const testPullRequestNumber = 1

  describe('Create reviews', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('can request changes on PRs', async () => {
      const expectedBody = `
🤖 It looks like your changes are invalid. 

Validating the changes in this PR resulted in the following errors: 

- hello
- world
`
      const result = await requestPullRequestChanges(testRepository, testPullRequestNumber, ['hello', 'world'])(log)(
        octokitMock,
      )

      expect(octokitMock.pulls.createReview).toBeCalledTimes(1)
      expect(octokitMock.pulls.createReview).toHaveBeenCalledWith({
        ...testRepository,
        pull_number: testPullRequestNumber,
        event: 'REQUEST_CHANGES',
        body: expectedBody,
      })
      expect(result).toEqual('reviewId')
    })

    test('can approve PRs', async () => {
      const expectedBody = '🤖 Well done!'
      const result = await approvePullRequestChanges(testRepository, testPullRequestNumber)(log)(octokitMock)

      expect(octokitMock.pulls.createReview).toBeCalledTimes(1)
      expect(octokitMock.pulls.createReview).toHaveBeenCalledWith({
        ...testRepository,
        pull_number: testPullRequestNumber,
        event: 'APPROVE',
        body: expectedBody,
      })
      expect(result).toEqual('reviewId')
    })
  })
})
