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
      list: jest.fn((parameters: { owner: string; repo: string; head: string; state: string }) => {
        if (parameters.repo === 'has-prs') {
          return {
            data: [
              {
                number: 1,
              },
            ],
          }
        }
        return { data: [] }
      }),
      update: jest.fn(),
      create: jest.fn(() => ({
        data: { number: 1 },
      })),
    },
    repos: {
      getContent: jest.fn((parameters: { owner: string; repo: string; path: string }) => {
        if (parameters.path == 'does-not-exist') throw Error()
        else return parameters.path
      }),
      get: jest.fn(() => ({
        data: {
          ...testRepository,
          default_branch: 'main',
        },
      })),
    },
    git: {
      getRef: jest.fn(() => ({
        data: {
          object: { sha: 'baseBranchRef' },
        },
      })),
      createRef: jest.fn(() => ({
        object: { sha: 'newBranch' },
      })),
      getCommit: jest.fn(() => ({
        data: { sha: 'currentCommitSha' },
      })),
      getTree: jest.fn(() => ({
        data: { tree: 'existingTree' },
      })),
      createTree: jest.fn(() => ({
        data: { sha: 'createdTreeSha' },
      })),
      createCommit: jest.fn(() => ({
        data: { sha: 'newCommitSha' },
      })),
      updateRef: jest.fn(() => ({
        data: { ref: 'updatedRef' },
      })),
    },
  } as unknown as OctokitInstance

  const testRepository = {
    owner: 'pleo',
    repo: 'workflows',
  }

  const testPullRequestNumber = 1

  const { approvePullRequestChanges, requestPullRequestChanges, getDefaultBranchContents, createBaseConfiguration } =
    git(log, octokitMock)

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
      const result = await requestPullRequestChanges(testRepository, testPullRequestNumber, ['hello', 'world'])

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

    test('can get default branch contents', async () => {
      const path = 'some-path'
      const result = await getDefaultBranchContents(testRepository, path)
      expect(result).toEqual(path)
    })

    test('gives undefined for nonexistent paths', async () => {
      const path = 'does-not-exist'
      const result = await getDefaultBranchContents(testRepository, path)
      expect(result).toEqual(undefined)
    })

    test('creates base configuration if no configuration PRs are present', async () => {
      const expected = 1
      const result = await createBaseConfiguration(testRepository, '1.0.0', '.github/templates.yaml')
      expect(result).not.toBeUndefined()
      expect(result).toEqual(expected)
    })

    test('does not create base configuration if configuration PRs are present', async () => {
      const result = await createBaseConfiguration(
        { ...testRepository, repo: 'has-prs' },
        '1.0.0',
        '.github/templates.yaml',
      )
      expect(result).toBeUndefined()
    })
  })
})
