import { git } from '../src/git'
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
    repos: {
      get: jest.fn(() => {
        return {
          data: {
            default_branch: 'main'
          }
        }
      })
    },
    git: {
      getRef: jest.fn(() => {
        return {
          data: {
            object: {
              sha: 'sha'
            }
          }
        }
      }),
      getCommit: jest.fn(() => {
        return {
          data: {
            sha: 'shaCurrentCommit'
          }
        }
      })
    }
  } as unknown as OctokitInstance

  const testRepository = {
    owner: 'pleo',
    repo: 'workflows',
  }

  const testPullRequestNumber = 1

  const { approvePullRequestChanges, requestPullRequestChanges, commitFiles } = git(log, octokitMock)

  describe('Create reviews', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('can request changes on PRs', async () => {
      const expectedMainBody = `🤖 It looks like your template changes are invalid.

There were the following errors:
        - \`hello\`

Check the PR comments for any additional errors.`

      const result = await requestPullRequestChanges(testRepository, testPullRequestNumber, '.github/templates.yaml', [
        { message: 'hello', line: undefined },
        { message: 'world', line: 13 },
      ])

      expect(octokitMock.pulls.createReview).toBeCalledTimes(1)
      expect(octokitMock.pulls.createReview).toHaveBeenCalledWith({
        ...testRepository,
        pull_number: testPullRequestNumber,
        event: 'REQUEST_CHANGES',
        body: expectedMainBody,
        comments: [
          {
            path: '.github/templates.yaml',
            body: '`world`',
            line: 13,
          },
        ],
      })

      expect(result).toEqual('reviewId')
    })

    test('can approve PRs', async () => {
      const expectedBody = '🤖 Well done!'
      const result = await approvePullRequestChanges(testRepository, testPullRequestNumber)

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

  describe('Commit files', () => {
    test('can commit files', async () => {
      const result = await commitFiles(testRepository, 'v1.0,0', [])
    })
  })
})
