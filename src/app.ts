import { PullRequestEvent, PushEvent } from '@octokit/webhooks-types'
import { Context, Probot } from 'probot'
import { config } from 'dotenv'
import { determineConfigurationChanges } from './configuration'
import { renderTemplates } from './templates'
import { commitFiles, getCommitFiles } from './git'
import validator from "./schema-validator";
import schema from './template-schema.json'
import { JSONSchemaType } from "ajv";
import { TemplateConfig } from './types'
import { createCheckRun, resolveCheckRun } from './github'


const configFileName = '.config/templates.yaml'

const extractRepositoryInformation = (payload: PushEvent) => {
  const {
    repository: {
      owner: { login },
      name,
      default_branch,
    },
  } = payload

  return {
    owner: login,
    repo: name,
    defaultBranch: default_branch,
  }
}

const processPullRequest = () => async (payload: PullRequestEvent, context: Context<'pull_request'>) => {
  const { log, octokit } = context

  const repository = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
  }
  log(`Pull request event happened on '${context.payload.pull_request}'`)

  try {
    const filesChanged = await octokit.pulls.listFiles({
      ...repository,
      pull_number: payload.number
    })
    const configFile = filesChanged.data.find(file => file.filename === configFileName)
    if (configFile) {

      log.debug(`Found file ${configFile.filename}`)
      const checkRun = await createCheckRun(
        context.octokit,
        {
          owner: repository.owner,
          repo: repository.repo,
          sha: payload.pull_request.head.sha
        }
      )

      const fileContent = await octokit.repos.getContent({
        ...repository,
        path: configFile.filename,
        ref: payload.pull_request.head.ref
      })

      const { content } = fileContent.data as { content: string }
      const decodedContent = Buffer.from(content, 'base64').toString()
      log.debug(`decoded content ${decodedContent}`)


      const result = validator(schema as JSONSchemaType<TemplateConfig>, decodedContent)
      const resultString = (result) ? "success" : "failure"

      await resolveCheckRun(octokit, {
        owner: repository.owner,
        repo: repository.repo,
        sha: context.payload.pull_request.head.sha,
        result: resultString,
        check_run_id: checkRun.data.id
      })
    }
  } catch (error) {
    log.error(`There has been an error ${error}`);
    return error
  }
}

const processPushEvent = async (payload: PushEvent, context: Context<'push'>) => {
  const { octokit } = context
  const { log } = context

  log.info(`${context.name} event happened on '${payload.ref}'`)

  try {
    const repository = extractRepositoryInformation(payload)
    const branchRegex = new RegExp(repository.defaultBranch)

    if (!branchRegex.test(payload.ref)) return

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

  app.on('push', async (context: Context<'push'>) => {
    await processPushEvent(context.payload as PushEvent, context)
  })

  app.on('pull_request', async (context: Context<'pull_request'>) => {
    await processPullRequest()(context.payload as PullRequestEvent, context)
  })
}
