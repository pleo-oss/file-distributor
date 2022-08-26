import { PushEvent } from "@octokit/webhooks-types";
import { Context, Probot } from "probot";
import { parse } from "yaml";
import { render } from "mustache";
import { promises as fs } from "fs";
import { open } from "yauzl";
import { config } from "dotenv"

interface RepositoryConfiguration {
  version?: string,
  automerge?: boolean
}

interface RepositoryDetails {
  owner: string
  repo: string
}

interface Template {
  path: string,
  contents: string
}

interface Tree {
  path: string;
  mode: "100644";
  type: "blob"
  content: string;
}[]

const monitorAllBranches = true
const branchesToProcess = /master|main/
const branchName = "refs/heads/centralized-templates"

export = (app: Probot) => {
  config()

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
  const determineConfigurationChanges = async (configFileName: string, repository: RepositoryDetails) =>{
    app.log.debug(`Saw changes to ${configFileName}`);
    const fileContents = await context.octokit.repos.getContent({ ...repository, path: configFileName, ref: payload.after });

    const content: string = (fileContents.data as any).content;
    const decodedContent = Buffer.from(content, 'base64').toString();
    app.log.debug(`'${configFileName}' contains:`);
    app.log.debug(decodedContent);

    const parsed: RepositoryConfiguration = parse(decodedContent);
    return parsed;
  }

  const processTemplates = async (data: RepositoryConfiguration, context: Context): Promise<Template[]> => {
    const downloadTemplates = async (templateVersion: string | undefined): Promise<Template[]> => {
      const templateRepository: RepositoryDetails = {
        owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? "",
        repo: process.env.TEMPLATE_REPOSITORY_NAME ?? ""
      }
  
      const getLatestRelease = async () => {
        const latestRelease = await context.octokit.repos.getLatestRelease({...templateRepository})
        return latestRelease.data.id
      }
      
      const getReleaseAssetId = async (tag: string) => {
        const release = await context.octokit.repos.getReleaseByTag({...templateRepository, tag})
        return release.data.id
      }
      
      app.log.debug(`Fetching templates from '${templateRepository.owner}/${templateRepository.repo}.`)
      const version = templateVersion 
      ? await getReleaseAssetId(templateVersion) 
      : await getLatestRelease()
      app.log.debug(`Fetching template version '${version}.`)
      
      const release = await context.octokit.repos.getReleaseAsset({...templateRepository, asset_id: version, headers: {"Accept": "application/octet-stream"}})
      await fs.writeFile("release.zip", release.data as any);
      
      // TODO: Extract relevant templates and return them as a Template[].
      const unzipped = open("release.zip")
      return [{
        path: "filename",
        contents: "contents"
      }]
    }
    
    app.log.debug(`Processing configuration changes.`)
    const version = data.version
    app.log.debug(`Configuration uses template version '${version}'.`)
    const templateContents = await downloadTemplates(version)
  
    app.log.debug(`Templating ${templateContents.map(t => t.path)}'.`)
    const rendered = templateContents.map(template => 
      ({
        ...template,
        contents: render(template.contents, data)
      })
    )
    app.log.debug(`Processed ${rendered.length} templates.`)
    return rendered
  }

  const commitFiles = async (repository: RepositoryDetails, templates: Template[], automerge: boolean, context: Context) => {
    app.log.debug(`Committing modified templates.`)
    const title = "Update templates based on repository configuration"
    app.log.debug(`Fetching base branch.`)
    const baseBranch = (await context.octokit.repos.get({...repository})).data
    app.log.debug(`Fetching base branch ref.`)
    const baseBranchRef = await context.octokit.git.getRef({...repository, ref: baseBranch.default_branch});
    app.log.debug(`Creating new branch.`)
    const newBranch = await context.octokit.git.createRef({...repository, ref: branchName, sha: baseBranchRef.data.object.sha})
    app.log.debug(`Determining current commit.`)
    const currentCommit = await context.octokit.git.getCommit({...repository, commit_sha: newBranch.data.object.sha});
    
    app.log.debug(`Using base branch '${baseBranch.default_branch}'.`)
    app.log.debug(`Creating new branch '${newBranch.data.ref}'.`)
    app.log.debug(`Using base commit '${currentCommit.data.sha}'.`)

    const tree: Tree[] = templates.map(template => ({
      path: template.path,
      mode: "100644",
      type: "blob",
      content: template.contents
    }));
    
    app.log.debug(`Creating git tree with modified templates.`)
    const createdTree = await context.octokit.git.createTree({...repository, tree: tree})
    app.log.debug(`Created git tree with SHA '${createdTree.data.sha}'.`)
    
    app.log.debug(`Creating git commit with modified templates.`)
    const newCommit = await context.octokit.git.createCommit({
      ...repository, message: title,
      tree: createdTree.data.sha,
      parents: [currentCommit.data.sha],
    });
    app.log.debug(`Created git commit with SHA '${newCommit.data.sha}'.`)
    
    app.log.debug(`Updating new branch ref.`)
    await context.octokit.git.updateRef({
      ...repository,
      ref: newBranch.data.ref,
      sha: newCommit.data.sha,
    });
    app.log.debug(`Updated new branch ref.`)
    
    app.log.debug(`Creating PR.`)
    const pullRequest = await context.octokit.pulls.create({
      ...repository,
      title,
      body: title,
      head: newBranch.data.ref,
      base: baseBranch.default_branch,
    });
    app.log.debug(`Created PR #${pullRequest.data.number}.`)
    
    if (automerge) {
      app.log.debug(`Attempting automerge of PR #${pullRequest.data.number}.`)
      await context.octokit.rest.pulls.merge({
        ...repository,
        pull_number: pullRequest.data.number,
        merge_method: "squash"
      });
      app.log.debug(`Merged PR #${pullRequest.data.number}.`)
    }

    return pullRequest.data.number
  }

  if (monitorAllBranches || branchesToProcess.test(payload.ref)) {
    app.log(`${context.name} event happened on '${payload.ref}'`)
    try {
      const repository: RepositoryDetails = {
        owner: payload.repository.owner.login,
        repo: payload.repository.name
      }
      app.log.info(`Processing changes made to ${repository.owner}/${repository.repo} in ${payload.after}.`)

      const commit = await context.octokit.repos.getCommit({...repository, ref: payload.after})
      app.log.debug(`Fetched commit:`)
      app.log.debug(commit)

      const filesChanged = commit.data.files?.map(c => c.filename) ?? []
      app.log.debug(`Saw files changed in ${payload.after}:`)
      app.log.debug(filesChanged)
      
      const configFileName = `${payload.repository.name}.yaml`
      if (filesChanged.includes(configFileName)) {
        const parsed: RepositoryConfiguration = await determineConfigurationChanges(configFileName, repository);

        const processed = await processTemplates(parsed, context)
        
        const shouldAutomerge = parsed.automerge ?? false
        const pullRequestNumber = commitFiles(repository, processed, shouldAutomerge, context)
        app.log.info(`Committed templates in #${pullRequestNumber}`)
        app.log.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
      }
    }
    catch {
      app.log.error(`Failed to process commit '${payload.after}'`)
    }
  }
}
