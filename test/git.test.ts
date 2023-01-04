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
            default_branch: 'main',
          },
        }
      }),
      compareCommits: jest.fn(() => {
        return {
          data: {
            files: [],
          },
        }
      }),
    },
    git: {
      getRef: jest.fn(() => {
        return {
          data: {
            object: {
              sha: 'sha',
            },
          },
        }
      }),
      getCommit: jest.fn(() => {
        return {
          data: {
            sha: 'shaCurrentCommit',
          },
        }
      }),
      getTree: jest.fn(() => {
        return {
          data: {
            tree: [],
          },
        }
      }),
      createCommit: jest.fn(() => {
        return {
          data: {
            sha: 'createTreeSha',
          },
        }
      }),
      createTree: jest.fn(() => {
        return {
          data: {
            sha: 'createdTreeSha',
          },
        }
      }),
      updateRef: jest.fn(() => {
        return {
          data: {
            ref: 'updatedRef',
          },
        }
      }),
    },
  } as unknown as OctokitInstance

  const testRepository = {
    owner: 'pleo',
    repo: 'workflows',
    defaultBranch: 'main',
  }

  const testPullRequestNumber = 1

  const { commentOnPullRequest, commitFilesToPR } = git(log, octokitMock)

  describe('Create reviews', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('can create failure comments on on PRs', async () => {
      const checkId = 123
      const expectedMainBody = `🤖 It looks like your configuration changes are invalid.\nYou can see the error report [here](https://github.com/${testRepository.owner}/${testRepository.repo}/pull/${testPullRequestNumber}/checks?check_run_id=${checkId}).`

      const result = await commentOnPullRequest(testRepository, testPullRequestNumber, checkId, 'failure')

      expect(octokitMock.pulls.createReview).toBeCalledTimes(1)
      expect(octokitMock.pulls.createReview).toHaveBeenCalledWith({
        ...testRepository,
        pull_number: testPullRequestNumber,
        event: 'COMMENT',
        body: expectedMainBody,
      })

      expect(result).toEqual('reviewId')
    })

    test('can create success comments on PRs', async () => {
      const checkId = 123
      const expectedBody = '🤖 Well done! The configuration is valid.'
      const result = await commentOnPullRequest(testRepository, testPullRequestNumber, checkId, 'success')

      expect(octokitMock.pulls.createReview).toBeCalledTimes(1)
      expect(octokitMock.pulls.createReview).toHaveBeenCalledWith({
        ...testRepository,
        pull_number: testPullRequestNumber,
        event: 'COMMENT',
        body: expectedBody,
      })
      expect(result).toEqual('reviewId')
    })
  })

  describe('Commit files', () => {
    test('when no changes return undefined', async () => {
      const result = await commitFilesToPR(testRepository, 'v1.0,0', [])
      expect(octokitMock.repos.compareCommits).toBeCalledTimes(1)

      expect(result).toBeUndefined()
    })

    test('when changes ', async () => {
      const octokitMockDifferentFiles = {
        pulls: {
          createReview: jest.fn(() => {
            return {
              data: {
                id: 'reviewId',
              },
            }
          }),
          list: jest.fn(() => {
            return {
              data: [],
            }
          }),
          create: jest.fn(() => {
            return {
              data: {
                number: 1,
              },
            }
          }),
        },
        repos: {
          get: jest.fn(() => {
            return {
              data: {
                default_branch: 'main',
              },
            }
          }),
          compareCommits: jest.fn(() => {
            return {
              data: {
                files: [
                  {
                    filename: 'test',
                  },
                ],
              },
            }
          }),
        },
        git: {
          getRef: jest.fn(() => {
            return {
              data: {
                object: {
                  sha: 'sha',
                },
              },
            }
          }),
          getCommit: jest.fn(() => {
            return {
              data: {
                sha: 'shaCurrentCommit',
              },
            }
          }),
          getTree: jest.fn(() => {
            return {
              data: {
                tree: [],
              },
            }
          }),
          createCommit: jest.fn(() => {
            return {
              data: {
                sha: 'createTreeSha',
              },
            }
          }),
          createTree: jest.fn(() => {
            return {
              data: {
                sha: 'createdTreeSha',
              },
            }
          }),
          updateRef: jest.fn(() => {
            return {
              data: {
                ref: 'updatedRef',
              },
            }
          }),
        },
        issues: {
          setLabers: jest.fn(() => {
            return {
              data: {},
            }
          }),
        },
      } as unknown as OctokitInstance
      const { commitFilesToPR } = git(log, octokitMockDifferentFiles)

      const result = await commitFilesToPR(testRepository, 'v1.0,0', [])
      expect(octokitMockDifferentFiles.repos.compareCommits).toBeCalledTimes(1)
      expect(octokitMockDifferentFiles.pulls.list).toBeCalledTimes(1)
      expect(octokitMockDifferentFiles.pulls.create).toBeCalledTimes(1)

      expect(result).toBe(1)
    })
  })
})
