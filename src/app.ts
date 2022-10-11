import { PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { config } from 'dotenv'
import determineConfigurationChanges from './configuration'
import { renderTemplates } from './templates'
import commitFiles from './git'

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

  console.log(`${context.name} event happened on '${payload.ref}'`)
  try {
    const repository = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    }
    console.info(`Processing changes made to ${repository.owner}/${repository.repo} in ${payload.after}.`)

    const commit = await context.octokit.repos.getCommit({
      ...repository,
      ref: payload.after,
    })
    console.debug('Fetched commit:')
    console.debug(commit)

    const filesChanged = commit.data.files?.map(c => c.filename) ?? []
    console.debug(`Saw files changed in ${payload.after}:`)
    console.debug(filesChanged)

    const configFileName = `.config/templates.yaml`

    if (filesChanged.includes(configFileName)) {
      const parsed = await determineConfigurationChanges(context)(configFileName, repository, payload.after)
      const { version, templates: processed } = await renderTemplates(context)(parsed)
      const pullRequestNumber = await commitFiles(context)(repository, version, processed)
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

  const authenticated = await (await app.auth(Number(process.env.APP_ID))).apps.listInstallations()
  if (!authenticated) {
    console.error('The application is not installed with expected authentication. Exiting.')
  }

  const branchesToProcess = findBranchesToProcess()
  app.on('push', async (context: Context<'push'>) => {
    await processPushEvent(branchesToProcess)(context.payload as PushEvent, context)
  })
}
