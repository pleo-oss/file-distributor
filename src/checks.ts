import { OctokitInstance, CreateCheckInput, UpdateCheckInput } from './types'
import { Logger } from 'probot'

export const checks = (log: Logger, octokit: Pick<OctokitInstance, 'checks'>) => {
  const createCheckRun = async (input: CreateCheckInput) => {
    const { owner, repo, sha } = input

    log.debug('Creating queued check run on %s.', input.sha)
    const {
      data: { id },
    } = await octokit.checks.create({
      owner,
      repo,
      name: 'Configuration validation',
      head_sha: sha,
      status: 'queued',
      output: {
        title: 'Schema validation',
        summary: 'Validation queued',
      },
    })
    log.debug('Queued check run %s with ID %d.', input.sha, id)

    return id
  }

  const resolveCheckRun = async (input: UpdateCheckInput) => {
    const { repo, owner, checkRunId, sha, conclusion: result } = input

    log.debug('Updating check run %d.', checkRunId)
    const {
      data: { conclusion },
    } = await octokit.checks.update({
      owner,
      repo,
      name: 'Configuration validation',
      check_run_id: checkRunId,
      status: 'completed',
      head_sha: sha,
      conclusion: result,
      output: {
        title: 'Schema validation',
        summary: result,
      },
    })
    log.debug('Updated check run %d with conclusion %s.', checkRunId, conclusion)
    return conclusion
  }

  return {
    createCheckRun,
    resolveCheckRun,
  }
}
