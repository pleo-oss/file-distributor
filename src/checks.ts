import { OctokitInstance, CreateCheckInput, UpdateCheckInput, ValidationError } from './types'
import { Logger } from 'probot'

export const checks = (log: Logger, octokit: Pick<OctokitInstance, 'checks'>) => {
  const createCheckRun = async (input: CreateCheckInput) => {
    const { owner, repo, sha } = input

    log.debug('Creating queued check run on %s.', input.sha)
    const {
      data: { id },
    } = await octokit.checks.create(createNewCheckInput(owner, repo, sha))
    log.debug('Queued check run %s with ID %d.', input.sha, id)

    return id
  }

  const resolveCheckRun = async (input: UpdateCheckInput, configFilePath?: string) => {
    const { repo, owner, checkRunId, sha, conclusion } = input

    if (input.conclusion === 'failure') {
      return updateCheck(createCheckErrorInput(owner, repo, checkRunId, sha, conclusion))
    } else if (input.conclusion === 'action_required') {
      return await updateCheck(
        createRequiredActionInput(owner, repo, checkRunId, sha, conclusion, input.errors, configFilePath),
      )
    } else {
      return await updateCheck(createCheckSuccessInput(owner, repo, checkRunId, sha, conclusion))
    }

    async function updateCheck(params: {
      owner: string
      repo: string
      name: string
      check_run_id: number
      status: string
      head_sha: string
      conclusion: string
      output: { title: string; summary: string }
    }) {
      log.debug('Updating check run %d.', checkRunId)
      const {
        data: { conclusion: result },
      } = await octokit.checks.update(params)
      log.debug('Updated check run %d with conclusion %s.', checkRunId, result)
      return result
    }
  }

  return {
    createCheckRun,
    resolveCheckRun,
  }
}

function createNewCheckInput(owner: string, repo: string, sha: string) {
  return {
    owner,
    repo,
    name: 'Configuration validation',
    head_sha: sha,
    status: 'queued',
    output: {
      title: 'Schema validation',
      summary: 'Validation queued',
    },
  }
}

function createCheckSuccessInput(owner: string, repo: string, checkRunId: number, sha: string, conclusion: string) {
  return {
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
  }
}

function createRequiredActionInput(
  owner: string,
  repo: string,
  checkRunId: number,
  sha: string,
  conclusion: string,
  errors: ValidationError[],
  configFilePath: string | undefined,
) {
  const errorsWithoutLine = errors.filter(e => !e.line)
  const errorsWithLine = errors.filter(e => e.line)
  const text =
    errorsWithoutLine.length > 0
      ? `The following errors don't have a line associated: 
            ${errorsWithoutLine.map(e => `- \`${e.message}\``).join('\n')}`
      : undefined

  return {
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
      text: text,
      annotations: errorsWithLine.map(err => ({
        path: configFilePath,
        start_line: err.line,
        end_line: err.line,
        annotation_level: 'failure',
        message: err.message,
      })),
    },
  }
}

function createCheckErrorInput(owner: string, repo: string, checkRunId: number, sha: string, conclusion: string) {
  return {
    owner,
    repo,
    name: 'Configuration validation',
    check_run_id: checkRunId,
    status: 'completed',
    head_sha: sha,
    conclusion,
    output: {
      title: 'Schema validation',
      summary:
        'There was an unexpected error running the check. Please try again and if the error persists contact the stewards.',
    },
  }
}
