import { ValidationError, Check } from './types'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'

export const checkName = 'Configuration validation' as const
export const checkTitle = 'Schema validation' as const

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
    status: 'completed',
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

const asSummary = (conclusion: 'action_required' | 'failure' | 'neutral' | 'success') => {
  switch (conclusion) {
    case 'action_required':
      return 'Action is required'
    case 'failure':
      return 'Failed'
    case 'neutral':
      return 'Unknown'
    case 'success':
      return 'Validation succeeded'
  }
}

export const resolveCheck = (input: Check, configFilePath?: string) => {
  const { repo, owner, checkRunId, sha, conclusion, errors } = input

  const check = {
    owner,
    repo,
    name: checkName,
    check_run_id: checkRunId,
    status: 'completed',
    head_sha: sha,
    conclusion,
    output: {
      title: checkTitle,
      summary: asSummary(conclusion),
    },
  }

  switch (conclusion) {
    case 'failure': {
      return asError(check)
    }
    case 'action_required': {
      return withErrors(check, errors, configFilePath)
    }
    default: {
      return check
    }
  }
}
