import { OctokitInstance, CreateCheckInput, UpdateCheckInput } from './types'
import { Logger } from 'probot'

export const createCheckRun =
  (input: CreateCheckInput) => (log: Logger) => async (octokit: Pick<OctokitInstance, 'checks'>) => {
    log.debug(`Creating queued check run on ${input.sha}.`)
    const {
      data: { id },
    } = await octokit.checks.create({
      headers: {
        accept: 'application/vnd.github.v3+json',
      },
      owner: input.owner,
      repo: input.repo,
      name: 'Template Config Validation',
      head_sha: input.sha,
      status: 'queued',
      output: {
        title: 'Template schema validation',
        summary: 'Validation is queued',
      },
    })
    log.debug(`Queued check run ${input.sha} with ID '${id}'.`)

    return id
  }

export const resolveCheckRun =
  (input: UpdateCheckInput) => (log: Logger) => async (octokit: Pick<OctokitInstance, 'checks'>) => {
    const { checkRunId, sha, conclusion: result } = input

    log.debug(`Updating check run ${checkRunId}.`)
    const {
      data: { conclusion },
    } = await octokit.checks.update({
      headers: {
        accept: 'application/vnd.github.v3+json',
      },
      owner: input.owner,
      repo: input.repo,
      name: 'Template Config Validation',
      check_run_id: checkRunId,
      status: 'completed',
      head_sha: sha,
      conclusion: result,
      output: {
        title: 'Template schema validation',
        summary: result,
      },
    })
    log.debug(`Updated check run ${checkRunId} with conclusion '${conclusion}'.`)

    return conclusion
  }
