import { OctokitInstance, CheckUpdate, RepositoryDetails } from './types'
import { Logger } from 'probot'

export const createCheckRun =
  (repository: RepositoryDetails, sha: string) => (log: Logger) => async (octokit: Pick<OctokitInstance, 'checks'>) => {
    log.debug(`Creating queued check run on ${sha}.`)
    const {
      data: { id },
    } = await octokit.checks.create({
      headers: {
        accept: 'application/vnd.github.v3+json',
      },
      ...repository,
      name: 'Template Config Validation',
      head_sha: sha,
      status: 'queued',
      output: {
        title: 'Template schema validation',
        summary: 'Validation is queued',
      },
    })
    log.debug(`Queued check run ${sha} with ID '${id}'.`)

    return id
  }

export const resolveCheckRun =
  (repository: RepositoryDetails, input: CheckUpdate) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'checks'>) => {
    const { check_run_id, sha, conclusion: result } = input

    log.debug(`Updating check run ${check_run_id}.`)
    const {
      data: { conclusion },
    } = await octokit.checks.update({
      ...repository,
      name: 'Template Config Validation',
      check_run_id: check_run_id,
      status: 'completed',
      head_sha: sha,
      conclusion: result,
      output: {
        title: 'Template schema validation',
        summary: result,
      },
    })
    log.debug(`Updated check run ${check_run_id} with conclusion '${conclusion}'.`)

    return conclusion
  }
