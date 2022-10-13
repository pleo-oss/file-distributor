import { PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { config } from 'dotenv'
import { determineConfigurationChanges } from './configuration'
import { renderTemplates } from './templates'
import { commitFiles, getCommitFiles } from './git'

const findBranchesToProcess = () => {
  const branches = process.env.BRANCHES_TO_PROCESS
  if (!branches) {
    console.error('Environment variable BRANCHES_TO_PROCESS is not set.')
    throw Error('Environment variable BRANCHES_TO_PROCESS is not set.')
  }

  return new RegExp(branches)
}

const processPushEvent = (branchesToProcess: RegExp) => async (payload: PushEvent, context: Context<'push'>) => {
  if (!branchesToProcess.test(payload.ref)) return

  const { octokit } = context
  const { log } = context

  log.info(`${context.name} event happened on '${payload.ref}'`)

  try {
    const repository = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    }
    log.info(`Processing changes made to ${repository.owner}/${repository.repo} in ${payload.after}.`)

    const configFileName = `.config/templates.yaml`
    const filesChanged = await getCommitFiles(repository, payload.after)(log)(octokit)

    if (filesChanged.includes(configFileName)) {
      const parsed = await determineConfigurationChanges(configFileName, repository, payload.after)(log)(octokit)
      const { version, templates: processed } = await renderTemplates(parsed)(log)(octokit)
      const pullRequestNumber = await commitFiles(repository, version, processed)(log)(octokit)
      log.info(`Committed templates to '${repository.owner}/${repository.repo}' in #${pullRequestNumber}`)
      log.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
    }
  } catch (e: unknown) {
    log.error(`Failed to process commit '${payload.after}' with error:`)
    log.error(e as never)
  }
}

export = async (app: Probot) => {
  config()

  const authenticated = await app.auth(Number(process.env.APP_ID))
  if (!authenticated) {
    app.log.error('The application is not installed with expected authentication. Exiting.')
  }

  const branchesToProcess = findBranchesToProcess()
  app.on('push', async (context: Context<'push'>) => {
    await processPushEvent(branchesToProcess)(context.payload as PushEvent, context)
  })
}
