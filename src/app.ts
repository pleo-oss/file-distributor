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
  console.log(`${context.name} event happened on '${payload.ref}'`)

  try {
    const repository = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    }
    console.info(`Processing changes made to ${repository.owner}/${repository.repo} in ${payload.after}.`)

    const configFileName = `.config/templates.yaml`
    const filesChanged = await getCommitFiles(repository, payload.after)(octokit)

    if (filesChanged.includes(configFileName)) {
      const parsed = await determineConfigurationChanges(configFileName, repository, payload.after)(octokit)
      const { version, templates: processed } = await renderTemplates(parsed)(octokit)
      const pullRequestNumber = await commitFiles(repository, version, processed)(octokit)
      console.info(`Committed templates to '${repository.owner}/${repository.repo}' in #${pullRequestNumber}`)
      console.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
    }
  } catch (e: unknown) {
    console.error(`Failed to process commit '${payload.after}' with error:`)
    console.error(e as never)
  }
}

export = async (app: Probot) => {
  config()

  const authenticated = await app.auth(Number(process.env.APP_ID))
  if (!authenticated) {
    console.error('The application is not installed with expected authentication. Exiting.')
  }

  const branchesToProcess = findBranchesToProcess()
  app.on('push', async (context: Context<'push'>) => {
    await processPushEvent(branchesToProcess)(context.payload as PushEvent, context)
  })
}
