import { OctokitInstance, CreateCheckInput, UpdateCheckInput } from './types'
import { Logger } from 'probot'

export const createCheckRun =
  (input: CreateCheckInput) => (log: Logger) => async (octokit: Pick<OctokitInstance, 'checks'>) => {
    log.debug('Creating queued check run on %s.', input.sha)
    return octokit.checks.create({
      headers: {
        accept: 'application/vnd.github.v3+json',
      },
      owner: input.owner,
      repo: input.repo,
      name: 'Configuration validation',
      head_sha: input.sha,
      status: 'queued',
      output: {
        title: 'Template schema validation',
        summary: 'Validation is queued',
      },
    }).then(result => {
      log.debug('Queued check run %s with ID \'%d\'.', input.sha, result.data.id)
      return result.data.id
    })
  }

export const resolveCheckRun =
  (input: UpdateCheckInput) => (log: Logger) => async (octokit: Pick<OctokitInstance, 'checks'>) => {
    const { checkRunId, sha, conclusion: result } = input

    log.debug('Updating check run %d.', checkRunId)
    return octokit.checks.update({
      headers: {
        accept: 'application/vnd.github.v3+json',
      },
      owner: input.owner,
      repo: input.repo,
      name: 'Configuration validation',
      check_run_id: checkRunId,
      status: 'completed',
      head_sha: sha,
      conclusion: result,
      output: {
        title: 'Template schema validation',
        summary: result,
      },
    }).then(result => {
      log.debug('Updated check run %d with conclusion \'%s\'.', checkRunId, result.data.conclusion)
      return result.data.conclusion
    })
  }
