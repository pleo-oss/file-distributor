import { OctokitInstance, RepositoryDetails, CheckUpdate } from './types'
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
  (repository: RepositoryDetails, update: CheckUpdate) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'checks'>) => {
    const { checkRunId, sha, conclusion } = update

    log.debug(`Updating check run ${checkRunId}.`)
    const {
      data: { conclusion: checkConclusion },
    } = await octokit.checks.update({
      headers: {
        accept: 'application/vnd.github.v3+json',
      },
      ...repository,
      name: 'Template Config Validation',
      check_run_id: checkRunId,
      status: 'completed',
      head_sha: sha,
      conclusion,
      output: {
        title: 'Template schema validation',
        summary: conclusion,
      },
    })
    log.debug(`Updated check run ${checkRunId} with conclusion '${checkConclusion}'.`)

    return checkConclusion
  }
