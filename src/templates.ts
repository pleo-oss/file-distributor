import { loadAsync } from 'jszip'
import { render } from 'mustache'
import { RepositoryDetails, RepositoryConfiguration, TemplateInformation, Templates, OctokitInstance } from './types'
import { OctokitResponse } from '@octokit/types'
import { Logger } from 'probot'

export const extractZipContents =
  (contents: ArrayBuffer, configuration: RepositoryConfiguration) => async (log: Logger) => {
    log.debug(`Extracting ZIP contents.`)
    const loaded = await loadAsync(contents)

    const toProcess = Promise.all(
      configuration.files?.map(async file => {
        const found = loaded.file(new RegExp(file.source))
        log.debug(`Found ${found.length} file(s) matching ${file.source}. `)
        const picked = found.shift()
        if (picked) log.debug(`Using ${picked.name} for ${file.source}. `)

        const text = (await picked?.async('text')) ?? ''
        const contents = text?.replace(/#<<</gm, '<<<')

        return {
          path: file.destination,
          contents,
        }
      }) ?? [],
    )

    const templates = (await toProcess).filter(it => it?.contents)
    log.debug(`Extracted ${templates.length} ZIP templates.`)

    return templates
  }

const getReleaseFromTag =
  (tag: string | undefined, repository: RepositoryDetails) => async (octokit: Pick<OctokitInstance, 'repos'>) => {
    const getLatestRelease = async () => {
      const latestRelease = await octokit.repos.getLatestRelease({
        ...repository,
      })
      return latestRelease.data
    }

    const getRelease = async () => {
      if (!tag) {
        throw Error('A release tag is missing.')
      }

      const release = await octokit.repos.getReleaseByTag({
        ...repository,
        tag,
      })
      return release.data
    }

    return tag ? getRelease() : getLatestRelease()
  }

export const downloadTemplates =
  (templateVersion?: string) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'repos'>): Promise<TemplateInformation> => {
    const templateRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
    }

    log.debug(`Fetching templates from '${templateRepository.owner}/${templateRepository.repo}.`)
    const release = await getReleaseFromTag(templateVersion, templateRepository)(octokit)
    log.debug(`Fetching templates from URL: '${release.zipball_url}'.`)

    if (!release.zipball_url) {
      log.error(`Release '${release.id}' has no zipball URL.`)
      throw Error(`Release '${release.id}' has no zipball URL.`)
    }

    log.debug(`Fetching release information from '${release.zipball_url}'.`)
    const { data: contents } = (await octokit.repos.downloadZipballArchive({
      ...templateRepository,
      ref: release.tag_name,
    })) as OctokitResponse<ArrayBuffer>
    log.debug('Fetched release contents.')

    return {
      contents,
      version: release.tag_name,
    }
  }

export const renderTemplates =
  (configuration: RepositoryConfiguration) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'repos'>): Promise<Templates> => {
    log.debug('Processing configuration changes.')
    const { version } = configuration
    log.debug(`Configuration uses template version '${version}'.`)

    const { contents, version: fetchedVersion } = await downloadTemplates(version)(log)(octokit)
    const templateContents = await extractZipContents(contents, configuration)(log)

    const delimiters: [string, string] = ['<<<', '>>>']
    const rendered = templateContents.map(template => ({
      ...template,
      contents: render(template.contents, configuration.values, {}, delimiters),
    }))
    log.debug(`Processed ${rendered.length} templates.`)

    return { version: fetchedVersion, templates: rendered }
  }
