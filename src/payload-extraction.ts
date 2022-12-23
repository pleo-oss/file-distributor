import { CheckRunRerequestedEvent, PullRequestEvent, PushEvent } from '@octokit/webhooks-types'

export const extractRepositoryInformation = (payload: PushEvent) => {
  const {
    repository: {
      owner: { login },
      name,
      default_branch,
    },
  } = payload

  return { owner: login, repo: name, defaultBranch: default_branch }
}

export const extractPullRequestInformation = (payload: PullRequestEvent) => {
  const {
    number,
    pull_request: {
      head: { sha },
    },
    repository: {
      owner: { login },
      name,
      default_branch,
    },
  } = payload

  return {
    number,
    sha,
    repository: {
      owner: login,
      repo: name,
      defaultBranch: default_branch,
    },
  }
}

export const extractCheckRunInformation = (payload: CheckRunRerequestedEvent) => {
  const {
    check_run: { pull_requests, id },
    repository,
  } = payload

  if (pull_requests.length != 1) return undefined
  return {
    number: pull_requests[0].number,
    sha: pull_requests[0].head.sha,
    checkId: id,
    repository: {
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
    },
  }
}
