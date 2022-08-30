import { PushEvent } from "@octokit/webhooks-types";
import { Context, Probot } from "probot";
import { parse } from "yaml";
import { render } from "mustache";
import { createWriteStream } from "fs";
import { config } from "dotenv"
import axios from "axios";
import { promises as fs } from "fs"
import { loadAsync } from "jszip"


interface PathConfiguration {
  source: string
  destination: string
}

interface RepositoryConfiguration {
  version?: string,
  automerge?: boolean
  files?: PathConfiguration[]
  values?: { [key: string]: string }
}

interface RepositoryDetails {
  owner: string
  repo: string
}

interface Template {
  path: string,
  contents: string
}

const monitorAllBranches = false
const branchesToProcess = /master|main/
const baseBranchName = "centralized-templates"
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`

export = (app: Probot) => {
  config()
  app.on("push", async (context: Context<"push">) => {
    await processEvent(context.payload, context, app)
  })
};

const processEvent = async (payload: PushEvent, context: Context<"push">, app: Probot) => {
  if (!monitorAllBranches && !branchesToProcess.test(payload.ref)) {
    return
  }

  app.log(`${context.name} event happened on '${payload.ref}'`)
  try {
    const repository = {
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
      const parsed = await determineConfigurationChanges(app, context)(configFileName, repository, payload.after)
      const processed = await renderTemplates(app, context)(parsed)
      const pullRequestNumber = await commitFiles(app, context)(repository, processed, parsed.automerge)
      app.log.info(`Committed templates to '${repository.owner}/${repository.repo}' in #${pullRequestNumber}`)
      app.log.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
    }
  }
  catch (e: any) {
    app.log.error(`Failed to process commit '${payload.after}' with error:`)
    app.log.error(e)
  }
}

const determineConfigurationChanges = (app: Probot, context: Context<"push">) => async (fileName: string, repository: RepositoryDetails, sha: string) => {
  app.log.debug(`Saw changes to ${fileName}.`);
  const fileContents = await context.octokit.repos.getContent({ ...repository, path: fileName, ref: sha });

  const content: string = (fileContents.data as any).content;
  const decodedContent = Buffer.from(content, 'base64').toString();
  app.log.debug(`'${fileName}' contains:`);
  app.log.debug(decodedContent);

  const parsed: RepositoryConfiguration = parse(decodedContent);
  return parsed;
}

const renderTemplates = (app: Probot, context: Context<"push">) => async (data: RepositoryConfiguration): Promise<Template[]> => {
  const getLatestRelease = async (repository: RepositoryDetails) => {
    const latestRelease = await context.octokit.repos.getLatestRelease({...repository})
    return latestRelease.data
  }
  
  const getRelease = (tag: string) => async (repository: RepositoryDetails) => {
    const release = await context.octokit.repos.getReleaseByTag({...repository, tag})
    return release.data
  }
  
  const downloadTemplates = async (templateVersion: string | undefined) => {
    const templatePath = "release.zip"
    const templateRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? "",
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? ""
    }
    
    app.log.debug(`Fetching templates from '${templateRepository.owner}/${templateRepository.repo}.`)

    const release = templateVersion 
      ? await getRelease(templateVersion)(templateRepository)
      : await getLatestRelease(templateRepository)
    app.log.debug(`Fetching templates from URL: '${release.zipball_url}'.`)
    
    if (!release.zipball_url) {
      app.log.error(`Release '${release.id}' has no zipball URL.`)
      throw Error(`Release '${release.id}' has no zipball URL.`)
    }
    
    app.log.debug(`Fetching release information from '${release.zipball_url}'.`)
    const link: { url: string } = await context.octokit.repos.downloadZipballArchive({...templateRepository, ref: release.tag_name}) as any
    app.log.debug(`Fetching release ZIP from:`)
    app.log.debug(link)
    const path = await downloadFile(link.url as string, templatePath)
    app.log.debug(`Fetched release ZIP.`)
    
    return path
  }

  const extractZipContents = async (filePath: string, configuration: RepositoryConfiguration) => {
    app.log.debug(`Extracting ZIP contents from ${filePath}.`)
    const zipFile = await fs.readFile(filePath)
    const loaded = await loadAsync(zipFile)

    const toProcess = Promise.all(configuration.files?.map(async (file) => {
      const found = loaded.file(new RegExp(file.source))
      app.log.debug(`Found ${found.length} file(s) matching ${file.source}. `)
      const picked = found.shift()
      if (picked) app.log.debug(`Using ${picked.name} for ${file.source}. `)

      return {
        path: file.source,
        contents: await picked?.async("text")
      }
    }) ?? [])
    const templates = (await toProcess).filter(it => it) as Template[]

    app.log.debug(`Extracted ${templates.length} ZIP templates.`)

    return templates
  }
  
  app.log.debug(`Processing configuration changes.`)
  const version = data.version
  app.log.debug(`Configuration uses template version '${version}'.`)

  const templateFilePath = await downloadTemplates(version)
  const templateContents = await extractZipContents(templateFilePath, data);

  const rendered = templateContents.map(template => 
    ({
      ...template,
      contents: render(template?.contents ?? "", data)
    })
  )
  app.log.debug(`Processed ${rendered.length} templates.`)
  return rendered
}

const commitFiles = (app: Probot, context: Context<"push">) => async (repository: RepositoryDetails, templates: Template[], automerge: boolean | undefined) => {
  const getOrCreateNewBranch = async (baseBranchRef: string) => {
    try {
      app.log.debug(`Creating new branch on SHA: '${baseBranchRef}'.`)
      const newBranch = (await context.octokit.git.createRef({ ...repository, ref: fullBranchName, sha: baseBranchRef })).data
      app.log.debug(`Created new branch with ref: '${newBranch.ref}'.`)
      return newBranch
    }
    catch {
      app.log.debug(`Failed to create a new branch with ref: '${fullBranchName}'.`);
      app.log.debug(`Fetching existing branch with ref: '${reducedBranchName}'.`);
      const foundBranch = (await context.octokit.git.getRef({ ...repository, ref: reducedBranchName})).data
      app.log.debug(`Found new branch with ref: '${foundBranch.ref}'.`)
      app.log.debug(`Updating branch to match '${baseBranchRef}'.`)
      const updatedRef = (await context.octokit.git.updateRef({
        ...repository,
        ref: reducedBranchName,
        sha: baseBranchRef,
        force: true
      })).data
      app.log.debug(`Updated '${reducedBranchName}' to '${updatedRef.ref}'.`)

      return updatedRef
    }
  }

  const createTreeWithChanges = async (treeSha: string) => {
    const tree = templates.map(template => ({
      path: template.path,
      mode: "100644",
      type: "blob",
      content: template.contents
    }));

    app.log.debug(`Fetching existing trees from '${treeSha}'.`);
    const existingTree = (await context.octokit.git.getTree({...repository, tree_sha: treeSha})).data.tree
    app.log.debug(`Creating git tree with modified templates.`);
    const createdTree = await context.octokit.git.createTree({ ...repository, tree: [...tree, ...existingTree] as any });
    app.log.debug(`Created git tree with SHA '${createdTree.data.sha}'.`);
    return createdTree;
  }

  const createCommitWithChanges = async (createdTree: {data: {sha: string}}) => {
    app.log.debug(`Creating git commit with modified templates.`);
    const newCommit = await context.octokit.git.createCommit({
      ...repository,
      message: title,
      tree: createdTree.data.sha,
      parents: [currentCommit.data.sha],
    });
    app.log.debug(`Created git commit with SHA '${newCommit.data.sha}'.`);
    return newCommit;
  }

  const updateBranch = async (newCommit: {data: {sha: string}}) => {
    app.log.debug(`Setting new branch ref '${newBranch.ref}' to commit '${newCommit.data.sha}'.`);
    const updatedRef = await context.octokit.git.updateRef({
      ...repository,
      ref: reducedBranchName,
      sha: newCommit.data.sha,
      force: true
    });
    app.log.debug(`Updated new branch ref '${updatedRef.data.ref}'.`);
  }

  const createOrUpdatePullRequest = async () => {
    const createOrUpdateExisting = async () => {
      const openPullRequests = (await context.octokit.pulls.list({
        ...repository, 
        head: fullBranchName,
        state: "open"
      })).data
      app.log.debug(`Found ${openPullRequests.length} open PRs.`);
      
      const toUpdate = openPullRequests.shift()
      if (!toUpdate) {
        app.log.debug(`Creating PR.`);
        const created = await context.octokit.pulls.create({
          ...repository,
          title,
          body: description,
          head: fullBranchName,
          base: baseBranch,
        });
        app.log.debug(`Created PR #${created.data.number}.`);
        
        return created
      } else {
        await Promise.all(openPullRequests.map(async (pr) => {
          app.log.debug(`Closing PR #${pr.number}.`);
          await context.octokit.pulls.update({
            ...repository,
            pull_number: toUpdate.number,
            state: "closed"
          })
          app.log.debug(`Closed PR #${updated.data.number}.`);
        }))

        app.log.debug(`Updating PR #${toUpdate.number}.`);
        const updated = await context.octokit.pulls.update({
          ...repository,
          pull_number: toUpdate.number,
          head: fullBranchName,
          state: "open"
        })
        app.log.debug(`Updated PR #${updated.data.number}.`);

        return updated
      }
    }

    const pullRequest = await createOrUpdateExisting()

    if (automerge) {
      app.log.debug(`Attempting automerge of PR #${pullRequest.data.number}.`);
      await context.octokit.rest.pulls.merge({
        ...repository,
        pull_number: pullRequest.data.number,
        merge_method: "squash"
      });
      app.log.debug(`Merged PR #${pullRequest.data.number}.`);
    }

    return pullRequest;
  }

  const title = "Update templates based on repository configuration"
  const description = "Update templates based on repository configuration."
  app.log.debug(`Fetching base branch.`)
  const baseBranch = (await context.octokit.repos.get({...repository})).data.default_branch
  app.log.debug(`Fetching base branch ref 'heads/${baseBranch}'.`)
  const baseBranchRef = (await context.octokit.git.getRef({...repository, ref: `heads/${baseBranch}`})).data.object.sha;
  
  const newBranch = await getOrCreateNewBranch(baseBranchRef);
  app.log.debug(`Determining current commit.`)
  const currentCommit = await context.octokit.git.getCommit({...repository, commit_sha: newBranch.object.sha});
  app.log.debug(`Using base branch '${baseBranch}'.`)
  app.log.debug(`Using base commit '${currentCommit.data.sha}'.`)

  const createdTree = await createTreeWithChanges(baseBranchRef);
  const newCommit = await createCommitWithChanges(createdTree);
  await updateBranch(newCommit);
  const pullRequest = await createOrUpdatePullRequest();

  return pullRequest.data.number
}

const downloadFile = async(url: string, path: string) => {
  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
    headers: {
      Accept: 'application/octet-stream',
      "User-Agent": "Pleo Template Fetch"
    },
  });

  await new Promise((resolve, reject) => {
    const dest = createWriteStream(path);
    response.data
      .on('end', () => {
        resolve(path);
      })
      .on('error', (err: unknown) => {
        reject(err);
      })
      .pipe(dest);
  });

  return path
}