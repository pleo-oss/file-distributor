import { loadAsync } from 'jszip'
import { render } from 'mustache'
import { RepositoryDetails, RepositoryConfiguration, TemplateInformation, Templates, OctokitInstance } from './types'
import { OctokitResponse } from '@octokit/types'

export const extractZipContents = async (contents: ArrayBuffer, configuration: RepositoryConfiguration) => {
  console.debug(`Extracting ZIP contents.`)
  const loaded = await loadAsync(contents)

  const toProcess = Promise.all(
    configuration.files?.map(async file => {
      const found = loaded.file(new RegExp(file.source))
      console.debug(`Found ${found.length} file(s) matching ${file.source}. `)
      const picked = found.shift()
      if (picked) console.debug(`Using ${picked.name} for ${file.source}. `)

      const text = (await picked?.async('text')) ?? ''
      const contents = text?.replace(/#{{/gm, '{{')

      return {
        path: file.destination,
        contents,
      }
    }) ?? [],
  )

  const templates = (await toProcess).filter(it => it?.contents)
  console.debug(`Extracted ${templates.length} ZIP templates.`)

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
  async (octokit: Pick<OctokitInstance, 'repos'>): Promise<TemplateInformation> => {
    const templateRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
    }

    console.debug(`Fetching templates from '${templateRepository.owner}/${templateRepository.repo}.`)
    const release = await getReleaseFromTag(templateVersion, templateRepository)(octokit)
    console.debug(`Fetching templates from URL: '${release.zipball_url}'.`)

    if (!release.zipball_url) {
      console.error(`Release '${release.id}' has no zipball URL.`)
      throw Error(`Release '${release.id}' has no zipball URL.`)
    }

    console.debug(`Fetching release information from '${release.zipball_url}'.`)
    const { data: contents } = (await octokit.repos.downloadZipballArchive({
      ...templateRepository,
      ref: release.tag_name,
    })) as OctokitResponse<ArrayBuffer>
    console.debug('Fetched release contents.')

    return {
      contents,
      version: release.tag_name,
    }
  }

export const renderTemplates =
  (configuration: RepositoryConfiguration) =>
  async (octokit: Pick<OctokitInstance, 'repos'>): Promise<Templates> => {
    console.debug('Processing configuration changes.')
    const { version } = configuration
    console.debug(`Configuration uses template version '${version}'.`)

    const { contents, version: fetchedVersion } = await downloadTemplates(version)(octokit)
    const templateContents = await extractZipContents(contents, configuration)

    const rendered = templateContents.map(template => ({
      ...template,
      contents: render(template.contents, configuration.values),
    }))
    console.debug(`Processed ${rendered.length} templates.`)

    return { version: fetchedVersion, templates: rendered }
  }
