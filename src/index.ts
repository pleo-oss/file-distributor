import { PushEvent } from "@octokit/webhooks-types";
import { Context, Probot } from "probot";
import { parse } from "yaml";
import { render } from "mustache";
import { createWriteStream, promises as fs } from "fs";
// import { open } from "yauzl";
import { config } from "dotenv"
import fetch from "node-fetch";
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import * as jwt from 'jsonwebtoken';


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

const monitorAllBranches = false
const branchesToProcess = /master|main/
const baseBranchName = "centralized-templates"
const reducedBranchName = `heads/${baseBranchName}`
const fullBranchName = `refs/${reducedBranchName}`

export = (app: Probot) => {
  config()

  app.on("push", async (context) => {
    const { payload } = context
    app.log.debug(`${context.name} event contains payload:`)
    app.log.debug(payload)
    
    await processEvent(payload, context, app)
  })
};

const processEvent = async (payload: PushEvent, context: Context, app: Probot) => {
  const determineConfigurationChanges = async (configFileName: string, repository: RepositoryDetails) =>{
    app.log.debug(`Saw changes to ${configFileName}.`);
    const fileContents = await context.octokit.repos.getContent({ ...repository, path: configFileName, ref: payload.after });

    const content: string = (fileContents.data as any).content;
    const decodedContent = Buffer.from(content, 'base64').toString();
    app.log.debug(`'${configFileName}' contains:`);
    app.log.debug(decodedContent);

    const parsed: RepositoryConfiguration = parse(decodedContent);
    return parsed;
  }

  const processTemplates = async (data: RepositoryConfiguration): Promise<Template[]> => {
    const downloadTemplates = async (templateVersion: string | undefined): Promise<Template[]> => {
      const getBearerToken = async () => {
        const pemFilePath = process.env.PRIVATE_KEY_PATH
        const appID = process.env.APP_ID
        
        if (!pemFilePath) {
          app.log.error("Environment does not contain a PEM file path.")
          throw Error("Environment does not contain a PEM file path.")
        }

        if (!appID) {
          app.log.error("Environment does not contain an App ID.")
          throw Error("Environment does not contain an App ID.")
        }

        app.log.debug(`Reading PEM file at ${pemFilePath}.`)
        const privateKey = await fs.readFile(pemFilePath)
        app.log.debug(`Read PEM file at ${pemFilePath}.`)

        const now = Math.round(Date.now() / 1000);
        const minutesValid = 1
        const payload = {
          iat : now,
          exp : now + (minutesValid * 60),
          iss : appID
        };
        
        app.log.debug(`Generating bearer token valid for ${minutesValid} minute.`)
        return jwt.sign(payload, privateKey, { algorithm: 'RS256' })
      }

      const templateRepository: RepositoryDetails = {
        owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? "",
        repo: process.env.TEMPLATE_REPOSITORY_NAME ?? ""
      }
  
      const getLatestRelease = async () => {
        const latestRelease = await context.octokit.repos.getLatestRelease({...templateRepository})
        return latestRelease.data
      }
      
      const getRelease = async (tag: string) => {
        const release = await context.octokit.repos.getReleaseByTag({...templateRepository, tag})
        return release.data
      }
      
      app.log.debug(`Fetching templates from '${templateRepository.owner}/${templateRepository.repo}.`)

      const release = templateVersion 
        ? await getRelease(templateVersion) 
        : await getLatestRelease()
      app.log.debug(`Fetching templates from URL: '${release.zipball_url}'.`)
      
      if (!release.zipball_url) {
        app.log.error(`Release '${release.id}' has no zipball URL.`)
        throw Error(`Release '${release.id}' has no zipball URL.`)
      }

      const streamPipeline = promisify(pipeline);
      const bearerToken = await getBearerToken()
      app.log.debug(`Generated bearer token: '${bearerToken}'.`)

      app.log.debug(`Fetching release ZIP.`)
      const fetched = await fetch(
        release.zipball_url, 
        { headers: { "Authorization": `Bearer: ${bearerToken}` } }
      )
      
      if (!fetched.body) {
        app.log.error(`Got unexpected response ${fetched.statusText}.`)
        throw new Error(`Got unexpected response ${fetched.statusText}.`);
      }

      app.log.debug(`Fetched release ZIP.`)
      app.log.debug(`Writing release ZIP.`)
      await streamPipeline(fetched.body, createWriteStream('./release.zip'));
      app.log.debug(`Wrote release ZIP.`)
      
      // TODO: Extract relevant templates and return them as a Template[].
      // const unzipped = open("release.zip")
      return [{
        path: "filename",
        contents: `
Hello: {{hello}}
Another value: {{another-value}}
Yet another value: {{yet-another-value}}
`
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

  const commitFiles = async (repository: RepositoryDetails, templates: Template[], automerge: boolean) => {
    const getOrCreateNewBranch = async () => {
      try {
        const newBranch = (await context.octokit.git.createRef({ ...repository, ref: fullBranchName, sha: baseBranchRef })).data
        app.log.debug(`Created new branch with ref: '${newBranch.ref}'.`)
        return newBranch
      }
      catch (e: any) {
        app.log.debug(`Failed to create a new branch with ref: '${fullBranchName}'.`);
        app.log.debug(`Fetching existing branch with ref: '${reducedBranchName}'.`);
        const foundBranch = (await context.octokit.git.getRef({ ...repository, ref: reducedBranchName})).data
        app.log.debug(`Found new branch with ref: '${foundBranch.ref}'.`)
        return foundBranch
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

    const createCommitWithChanges = async () => {
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

    const updateBranch = async () => {
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
        app.log.debug(`Saw ${openPullRequests.length} open PRs.`);
        
        const toUpdate = openPullRequests.shift()
        if (!toUpdate) {
          app.log.debug(`Creating PR.`);
          const created = await context.octokit.pulls.create({
            ...repository,
            title,
            body: title,
            head: fullBranchName,
            base: baseBranch,
          });
          app.log.debug(`Created PR #${created.data.number}.`);
          
          return created
        } else {
          app.log.debug(`Updating PR #${toUpdate.number}.`);
          const updated = await context.octokit.pulls.update({
            ...repository,
            pull_number: toUpdate.number,
            head: fullBranchName
          })
          app.log.debug(`Updated PR #${updated.data.number}.`);
          
          await Promise.all(openPullRequests.map(async (pr) => {
            app.log.debug(`Closing PR #${pr.number}.`);
            await context.octokit.pulls.update({
              ...repository,
              pull_number: toUpdate.number,
              state: "closed"
            })
            app.log.debug(`Closed PR #${updated.data.number}.`);
          }))

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
    app.log.debug(`Fetching base branch.`)
    const baseBranch = (await context.octokit.repos.get({...repository})).data.default_branch
    app.log.debug(`Fetching base branch ref 'heads/${baseBranch}'.`)
    const baseBranchRef = (await context.octokit.git.getRef({...repository, ref: `heads/${baseBranch}`})).data.object.sha;

    const newBranch = await getOrCreateNewBranch();

    app.log.debug(`Determining current commit.`)
    const currentCommit = await context.octokit.git.getCommit({...repository, commit_sha: newBranch.object.sha});
    
    app.log.debug(`Using base branch '${baseBranch}'.`)
    app.log.debug(`Creating new branch '${newBranch.ref}'.`)
    app.log.debug(`Using base commit '${currentCommit.data.sha}'.`)

    const createdTree = await createTreeWithChanges(baseBranchRef);
    const newCommit = await createCommitWithChanges();
    await updateBranch();
    const pullRequest = await createOrUpdatePullRequest();

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

        const processed = await processTemplates(parsed)
        
        const shouldAutomerge = parsed.automerge ?? false
        const pullRequestNumber = await commitFiles(repository, processed, shouldAutomerge)
        app.log.info(`Committed templates in #${pullRequestNumber}`)
        app.log.info(`See: https://github.com/${repository.owner}/${repository.repo}/pull/${pullRequestNumber}`)
      }
    }
    catch (e: any) {
      app.log.error(`Failed to process commit '${payload.after}' with error:`)
      app.log.error(e)
    }
  }
}
