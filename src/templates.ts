import JSZip, {loadAsync} from 'jszip'
import {render} from 'mustache'
import {
  ExtractedContent,
  OctokitInstance,
  RepositoryConfiguration,
  RepositoryDetails,
  Template,
  TemplateInformation,
  Templates,
} from './types'
import {OctokitResponse} from '@octokit/types'
import {Logger} from 'probot'

import {matchFile, parse} from 'codeowners-utils'

const extract =
  (loaded: JSZip, source: string) =>
  async (log: Logger): Promise<string> => {
    const found = loaded.file(new RegExp(source, 'i'))
    log.debug(`Found ${found.length} file(s) matching ${source}. `)
    const picked = found.shift()
    if (picked) log.debug(`Using ${picked.name} for ${source}. `)

    const text = (await picked?.async('text')) ?? ''
    return text?.replace(/#{{/gm, '{{')
  }

const extractZipContents =
  (contents: ArrayBuffer, configuration: RepositoryConfiguration) =>
  async (log: Logger): Promise<ExtractedContent> => {
    log.debug(`Extracting ZIP contents.`)
    const loaded = await loadAsync(contents)

    const toProcess = Promise.all(
      configuration.files?.map(async file => {
        const contents = await extract(loaded, file.source)(log)
        return {
          sourcePath: file.source,
          destinationPath: file.destination,
          contents,
        }
      }) ?? [],
    )

    const templates = (await toProcess).filter(it => it?.contents)
    //TODO include in the promise all
    const codeOwners = await extract(loaded, 'CODEOWNERS')(log)

    log.debug(`Extracted ${templates.length} ZIP templates.`)

    return {
      codeOwners,
      templates,
    }
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

const downloadTemplates =
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

const enrichWithPrePendingHeader =
  (mustacheRenderedContent: string, template: Template, codeowners: string) =>
  (log: Logger): string => {
    // TODO Check if file extensions fits together
    const templateExtension = template.destinationPath.split('.').pop() as string
    if (!(templateExtension == 'yaml' || templateExtension == 'toml' || templateExtension == 'yml')) {
      log.debug(`File extension: ${templateExtension} with not supported comments`)
      return mustacheRenderedContent
    }

    const codeOwnersEntries = parse(codeowners)
    const matchedWithCodeOwner = matchFile(template.sourcePath, codeOwnersEntries)

    if (typeof process.env.PREPENDING_HEADER_TEMPLATE != 'undefined' && process.env.PREPENDING_HEADER_TEMPLATE) {
      return `${process.env.PREPENDING_HEADER_TEMPLATE + matchedWithCodeOwner?.owners}\n\n` + mustacheRenderedContent
    }

    return `#OWNER: ${matchedWithCodeOwner?.owners}\n\n` + mustacheRenderedContent
  }

export const renderTemplates =
  (configuration: RepositoryConfiguration) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'repos'>): Promise<Templates> => {
    log.debug('Processing configuration changes.')
    const { version } = configuration
    log.debug(`Configuration uses template version '${version}'.`)

    const { contents, version: fetchedVersion } = await downloadTemplates(version)(log)(octokit)
    const extractedContent = await extractZipContents(contents, configuration)(log)

    const rendered = extractedContent.templates.map(template => {
      const mustacheRenderedContent = render(template.contents, configuration.values)

      if (!extractedContent.codeOwners) {
        return { ...template, contents: mustacheRenderedContent }
      }
      return {
        ...template,
        contents: enrichWithPrePendingHeader(mustacheRenderedContent, template, extractedContent.codeOwners)(log),
      }
    })
    log.debug(`Processed ${rendered.length} templates.`)
    return { version: fetchedVersion, templates: rendered }
  }
