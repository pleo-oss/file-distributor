import { Context, Probot } from 'probot'
import { loadAsync } from 'jszip'
import { render } from 'mustache'
import { RepositoryDetails, RepositoryConfiguration, TemplateInformation, Templates } from './types'
import { OctokitResponse } from '@octokit/types'

export const extractZipContents =
  (app: Probot) => async (contents: ArrayBuffer, configuration: RepositoryConfiguration) => {
    app.log.debug(`Extracting ZIP contents.`)
    const loaded = await loadAsync(contents)

    const toProcess = Promise.all(
      configuration.files?.map(async file => {
        const found = loaded.file(new RegExp(file.source))
        app.log.debug(`Found ${found.length} file(s) matching ${file.source}. `)
        const picked = found.shift()
        if (picked) app.log.debug(`Using ${picked.name} for ${file.source}. `)

        const text = (await picked?.async('text')) ?? ''
        const contents = text?.replace(/#{{/gm, '{{')

        return {
          path: file.destination,
          contents,
        }
      }) ?? [],
    )

    const templates = (await toProcess).filter(it => it?.contents)
    app.log.debug(`Extracted ${templates.length} ZIP templates.`)

    return templates
  }

const getReleaseFromTag = (context: Context<'push'>) => (tag?: string) => {
  const getLatestRelease = async (repository: RepositoryDetails) => {
    const latestRelease = await context.octokit.repos.getLatestRelease({
      ...repository,
    })
    return latestRelease.data
  }

  const getRelease = async (repository: RepositoryDetails) => {
    if (!tag) {
      throw Error('A release tag is missing.')
    }

    const release = await context.octokit.repos.getReleaseByTag({
      ...repository,
      tag,
    })
    return release.data
  }

  return tag ? getRelease : getLatestRelease
}

export const downloadTemplates =
  (app: Probot, context: Context<'push'>) =>
  async (templateVersion?: string): Promise<TemplateInformation> => {
    const templateRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
    }

    app.log.debug(`Fetching templates from '${templateRepository.owner}/${templateRepository.repo}.`)
    const release = await getReleaseFromTag(context)(templateVersion)(templateRepository)
    app.log.debug(`Fetching templates from URL: '${release.zipball_url}'.`)

    if (!release.zipball_url) {
      app.log.error(`Release '${release.id}' has no zipball URL.`)
      throw Error(`Release '${release.id}' has no zipball URL.`)
    }

    app.log.debug(`Fetching release information from '${release.zipball_url}'.`)
    const { data: contents } = (await context.octokit.repos.downloadZipballArchive({
      ...templateRepository,
      ref: release.tag_name,
    })) as OctokitResponse<ArrayBuffer>
    app.log.debug('Fetched release contents.')

    return {
      contents,
      version: release.tag_name,
    }
  }

export const renderTemplates =
  (app: Probot, context: Context<'push'>) =>
  async (configuration: RepositoryConfiguration): Promise<Templates> => {
    app.log.debug('Processing configuration changes.')
    const { version } = configuration
    app.log.debug(`Configuration uses template version '${version}'.`)

    const { contents, version: fetchedVersion } = await downloadTemplates(app, context)(version)
    const templateContents = await extractZipContents(app)(contents, configuration)

    const rendered = templateContents.map(template => ({
      ...template,
      contents: render(template.contents, configuration.values),
    }))
    app.log.debug(`Processed ${rendered.length} templates.`)

    return { version: fetchedVersion, templates: rendered }
  }
