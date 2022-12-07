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

  const resolveCheckRun = async (input: UpdateCheckInput, configFilePath?: string) => {
    const { repo, owner, checkRunId, sha, conclusion, errors } = input

    if (errors.length > 0) {
      const errorsWithoutLine = input.errors.filter(e => !e.line)
      const errorsWithLine = input.errors.filter(e => e.line)

      log.debug('Updating check run %d.', checkRunId)
      const {
        data: { conclusion: result },
      } = await octokit.checks.update({
        owner,
        repo,
        name: 'Configuration validation',
        check_run_id: checkRunId,
        status: 'completed',
        head_sha: sha,
        conclusion,
        output: {
          title: 'Schema validation',
          summary: 'There has been some errors during the validation',
          text: `The following errors don't have a line associated: 
            ${errorsWithoutLine.map(e => `- \`${e.message}\``).join('\n')}`,
          annotations: errorsWithLine.map(err => ({
            path: configFilePath,
            start_line: err.line,
            end_line: err.line,
            annotation_level: 'failure',
            message: err.message,
          })),
        },
      })
      log.debug('Updated check run %d with conclusion %s.', checkRunId, result)
      return result
    } else {
      log.debug('Updating check run %d.', checkRunId)
      const {
        data: { conclusion: result },
      } = await octokit.checks.update({
        owner,
        repo,
        name: 'Configuration validation',
        check_run_id: checkRunId,
        status: 'completed',
        head_sha: sha,
        conclusion,
        output: {
          title: 'Schema validation',
          summary: conclusion,
        },
      })
      log.debug('Updated check run %d with conclusion %s.', checkRunId, result)
      return result
    }
  }

  return {
    createCheckRun,
    resolveCheckRun,
  }
}
