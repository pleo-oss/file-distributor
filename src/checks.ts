import { OctokitInstance, ValidationError, Check } from './types'
import { Logger } from 'probot'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'

const checkName = 'Configuration validation' as const
const checkCompleted = 'completed' as const
const checkTitle = 'Schema validation' as const

export const checks = (log: Logger, octokit: Pick<OctokitInstance, 'checks'>) => {
  const asError = (
    check: RestEndpointMethodTypes['checks']['update']['parameters'] & {
      output: {
        title: string
        summary: string
      }
    },
  ) => {
    return {
      ...check,
      output: {
        ...check.output,
        summary:
          'There was an unexpected error running the check. Please try again and if the error persists contact the stewards.',
      },
    }
  }

  const withErrors = (
    check: RestEndpointMethodTypes['checks']['update']['parameters'],
    errors: ValidationError[],
    configFilePath: string | undefined,
  ): RestEndpointMethodTypes['checks']['update']['parameters'] => {
    const withoutErrorLine = errors.filter(e => !e.line)
    const withErrorLine = errors.filter(e => e.line)
    const text = withoutErrorLine.length > 0 ? withoutErrorLine.map(e => `- \`${e.message}\``).join('\n') : undefined

    return {
      ...check,
      name: checkName,
      status: checkCompleted,
      output: {
        title: checkTitle,
        summary: 'The following errors are present:',
        text: text,
        annotations: withErrorLine.map(err => ({
          path: configFilePath,
          start_line: err.line,
          end_line: err.line,
          annotation_level: 'failure',
          message: err.message,
        })),
      },
    }
  }

  const createCheck = async (input: Check) => {
    const { owner, repo, sha } = input
    const newCheck = {
      owner,
      repo,
      name: checkName,
      head_sha: sha,
      status: 'queued',
      output: {
        title: checkTitle,
        summary: 'Validation queued',
      },
    }

    log.debug('Creating queued check run on %s.', sha)
    const {
      data: { id },
    } = await octokit.checks.create(newCheck)
    log.debug('Queued check run %s with ID %d.', sha, id)

    return id
  }

  const updateCheck = async (parameters: RestEndpointMethodTypes['checks']['update']['parameters']) => {
    const { check_run_id } = parameters
    log.debug('Updating check run %d.', check_run_id)
    const {
      data: { conclusion: result },
    } = await octokit.checks.update(parameters)
    log.debug('Updated check run %d with conclusion %s.', check_run_id, result)
    return result
  }

  const resolveCheck = async (input: Check, configFilePath?: string) => {
    const { repo, owner, checkRunId, sha, conclusion, errors } = input

    const check = {
      owner,
      repo,
      name: checkName,
      check_run_id: checkRunId,
      status: checkCompleted,
      head_sha: sha,
      conclusion,
      output: {
        title: checkTitle,
        summary: conclusion,
      },
    }

    switch (conclusion) {
      case 'failure': {
        return updateCheck(asError(check))
      }
      case 'action_required': {
        return updateCheck(withErrors(check, errors, configFilePath))
      }
      default: {
        return updateCheck(check)
      }
    }
  }

  return {
    createCheck,
    resolveCheck,
  }
}
