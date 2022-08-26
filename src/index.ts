import { PushEvent } from "@octokit/webhooks-types";
import { Context, Probot } from "probot";
import { parse } from "yaml";
import { render } from "mustache";
import { promises as fs } from "fs";
import { open } from "yauzl";

const branchesToProcess = /master|main/
const templateRepository = {
  owner: "pleo-io",
  repo: "centralized-templates"
}

export = (app: Probot) => {
  app.on("push", async (context) => {
    app.log.debug(`Saw ${context.name} event:`)
    app.log.debug(context)

    const { payload } = context
    app.log.debug(payload)
    app.log.debug(`${context.name} event contains payload:`)
    
    await processEvent(payload, context, app)
  })
};

const processEvent = async (payload: PushEvent, context: Context, app: Probot) => {
  if (true || branchesToProcess.test(payload.ref)) {
    app.log(`${context.name} event happened on '${payload.ref}'`)
    try {
      const owner = payload.repository.owner.login
      const repo = payload.repository.name
      const commit = await context.octokit.repos.getCommit({owner, repo, ref: payload.after})
      app.log.debug(`Fetched commit:`)
      app.log.debug(commit)
      const filesChanged = commit.data.files?.map(c => c.filename) ?? []
      app.log.info(`Saw files changed on ${payload.after}:`)
      app.log.info(filesChanged)
      
      const configFileName = `${payload.repository.name}.yaml`
      if (filesChanged.includes(configFileName)) {
        app.log(`Saw changes to ${configFileName}`)
        const fileContents = await context.octokit.repos.getContent({owner, repo, path: configFileName, ref: payload.after})
        const content: string = (fileContents.data as any).content 
        const decodedContent = Buffer.from(content, 'base64').toString();
        app.log(`'${configFileName}' contains:`)
        app.log(decodedContent)
        const parsed = parse(decodedContent)
        processTemplates(parsed, context)
      }
    }
    catch {
      app.log.error(`Failed to process commit '${payload.after}'`)
    }
  }
}

const processTemplates = async (data: any, context: Context) => {
  const version = data.version
  const templateContents = await downloadTemplates(version, context)
  templateContents.map(template => {
    //TODO: Configure mustache to use existing template format.
    const rendered = render(template, data)

    // TODO: Create commit to repository with rendered template.

  })

  // TODO: Push changes to repository or create a PR (depending on the repository config: 'automerge: true')
}

const downloadTemplates = async (templateVersion: string | undefined, context: Context): Promise<string[]> => {
  const version = templateVersion ? await getReleaseAssetId(templateVersion, context) : await getLatestRelease(context)
  const release = await context.octokit.repos.getReleaseAsset({...templateRepository, asset_id: version, headers: {"Accept": "application/octet-stream"}})
  await fs.writeFile("release.zip", release.data as any);
  
  // TODO: Extract relevant templates and return them as a string[].
  const unzipped = await open("release.zip")
  return []
}

const getLatestRelease = async (context: Context) => {
    const latestRelease = await context.octokit.repos.getLatestRelease(templateRepository)
    return latestRelease.data.id
}

const getReleaseAssetId = async (tag: string, context: Context) => {
  const release = await context.octokit.repos.getReleaseByTag({...templateRepository, tag})
  return release.data.id
}