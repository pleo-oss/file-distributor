import { PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { config } from 'dotenv'
import determineConfigurationChanges from './configuration'
import { renderTemplates } from './templates'
import commitFiles from './git'

const findBranchesToProcess = (app: Probot) => {
  const branches = process.env.BRANCHES_TO_PROCESS
  if (!branches) {
    app.log.error('Environment variable BRANCHES_TO_PROCESS is not set.')
    throw Error('Environment variable BRANCHES_TO_PROCESS is not set.')
  }

  return new RegExp(branches)
}

const processPushEvent =
  (branchesToProcess: RegExp) => async (payload: PushEvent, context: Context<'push'>, app: Probot) => {
    if (!branchesToProcess.test(payload.ref)) return

    app.log(`${context.name} event happened on '${payload.ref}'`)
    try {
      const repository = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
      }
      app.log.info(`Processing changes made to ${repository.owner}/${repository.repo} in ${payload.after}.`)

      const commit = await context.octokit.repos.getCommit({
        ...repository,
        ref: payload.after,
      })
      app.log.debug('Fetched commit:')
      app.log.debug(commit)

      const filesChanged = commit.data.files?.map(c => c.filename) ?? []
      app.log.debug(`Saw files changed in ${payload.after}:`)
      app.log.debug(filesChanged)

      const configFileName = `${payload.repository.name}.yaml`

      if (filesChanged.includes(configFileName)) {
        const parsed = await determineConfigurationChanges(app, context)(configFileName, repository, payload.after)
        const { version, templates: processed } = await renderTemplates(app, context)(repository, parsed)
        const pullRequestNumber = await commitFiles(app, context)(repository, version, processed)
        app.log.info(`Committed templates to '${repository.owner}/${repository.repo}' in #${pullRequestNumber}`)
        app.log.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
      }
    } catch (e: unknown) {
      app.log.error(`Failed to process commit '${payload.after}' with error:`)
      app.log.error(e as never)
    }
  }

export = (app: Probot) => {
  config()
  const branchesToProcess = findBranchesToProcess(app)
  app.on('push', async (context: Context<'push'>) => {
    await processPushEvent(branchesToProcess)(context.payload as PushEvent, context, app)
  })
}
