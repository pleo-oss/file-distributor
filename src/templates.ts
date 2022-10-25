import JSZip, { loadAsync } from 'jszip'
import { render } from 'mustache'
import {
  ExtractedContent,
  OctokitInstance,
  RepositoryConfiguration,
  RepositoryDetails,
  Template,
  TemplateInformation,
  Templates,
} from './types'
import { OctokitResponse } from '@octokit/types'
import { Logger } from 'probot'
import { matchFile, parse as parseCodeowners } from 'codeowners-utils'
import { parse } from 'yaml'

export const templates = (log: Logger, octokit: Pick<OctokitInstance, 'repos'>) => {
  const extract = async (loaded: JSZip, source: string): Promise<string> => {
    const found = loaded.file(new RegExp(source, 'i'))
    log.debug(`Found ${found.length} file(s) matching ${source}. `)
    const picked = found.shift()
    if (picked) log.debug(`Using ${picked.name} for ${source}. `)

    const text = (await picked?.async('text')) ?? ''
    return text?.replace(/#<<</gm, '<<<')
  }

  const extractZipContents = async (
    contents: ArrayBuffer,
    configuration: RepositoryConfiguration,
  ): Promise<ExtractedContent> => {
    log.debug('Extracting ZIP contents.')
    const loaded = await loadAsync(contents)

    const extractTemplates: Promise<Template>[] =
      configuration.files
        ?.filter(file => {
          const extensionMatches = file.source.split('.').pop() === file.destination.split('.').pop()
          if (!extensionMatches) {
            log.warn(
              `Template configuration seems to be invalid, file extension mismatch between source: '${file.source}' and destination: '${file.destination}'. Skipping!`,
            )
          }
          return extensionMatches
        })
        .map(async file => {
          const contents = await extract(loaded, file.source)

          return {
            sourcePath: file.source,
            destinationPath: file.destination,
            contents,
          }
        }) ?? []

    const extractCodeOwners: Promise<string> = extract(loaded, 'CODEOWNERS')

    const toProcess: [string, Template[]] = await Promise.all([extractCodeOwners, Promise.all(extractTemplates)])

    const codeOwners = toProcess[0]
    const templates = toProcess[1].filter(it => it?.contents)
    log.debug(`Extracted ${templates.length} ZIP templates.`)

    return {
      codeOwners,
      templates,
    }
  }

  const getReleaseFromTag = (tag: string | undefined, repository: RepositoryDetails) => {
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

  const downloadTemplates = async (templateVersion?: string): Promise<TemplateInformation> => {
    const templateRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
    }

    log.debug(`Fetching templates from '${templateRepository.owner}/${templateRepository.repo}.`)
    const release = await getReleaseFromTag(templateVersion, templateRepository)
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

  const enrichWithPrePendingHeader = (
    mustacheRenderedContent: string,
    template: Template,
    codeowners: string,
  ): string => {
    const templateExtension = template.destinationPath.split('.').pop()
    if (!(templateExtension === 'yaml' || templateExtension === 'toml' || templateExtension === 'yml')) {
      log.debug(`File extension: ${templateExtension} with not supported comments`)
      return mustacheRenderedContent
    }

    const codeOwnersEntries = parseCodeowners(codeowners)
    const matchedCodeOwner = matchFile(template.sourcePath, codeOwnersEntries)

    const header = process.env.PREPENDING_HEADER_TEMPLATE || '#OWNER: {{{stewards}}}'
    if (!header) log.info('Prepending header template not defined, using default.')

    const renderedPrePendingHeader = render(header, {
      'template-repository': process.env.TEMPLATE_REPOSITORY_NAME ?? '',
      stewards: matchedCodeOwner?.owners,
    })

    return `${renderedPrePendingHeader}\n\n${mustacheRenderedContent}`
  }

  const renderTemplates = async (configuration: RepositoryConfiguration): Promise<Templates> => {
    log.debug('Processing configuration changes.')
    const { version } = configuration
    log.debug(`Configuration uses template version '${version}'.`)

    const { contents, version: fetchedVersion } = await downloadTemplates(version)
    const extractedContent = await extractZipContents(contents, configuration)

    const delimiters: [string, string] = ['<<<', '>>>']
    const rendered = extractedContent.templates.map(template => {
      const mustacheRenderedContent = render(template.contents, configuration.values, {}, delimiters)

      if (!extractedContent.codeOwners) {
        return { ...template, contents: mustacheRenderedContent }
      }
      return {
        ...template,
        contents: enrichWithPrePendingHeader(mustacheRenderedContent, template, extractedContent.codeOwners),
      }
    })
    log.debug(`Processed ${rendered.length} templates.`)
    return { version: fetchedVersion, templates: rendered }
  }

  const versionRegex = /v\d+.\d+.\d+/
  const getTemplateDefaultValues = async (version: string) => {
    const versionToFetch = versionRegex.test(version) ? version : undefined

    log.debug(`Configuration uses template version '${version}'.`)

    log.debug(`Downloading templates with version '${version}'.`)
    const { contents } = await downloadTemplates(versionToFetch)

    log.debug('Extracting ZIP contents.')
    const loaded = await loadAsync(contents)
    log.debug('Extracting default configuration.')

    const defaults = await extract(loaded, 'defaults.yaml')
    log.debug('Saw default configuration:')
    log.debug(defaults)

    log.debug('Parsing default configuration.')
    const parsed = parse(defaults) as RepositoryConfiguration
    log.debug('Parsed default configuration:')
    log.debug(parsed)

    return parsed
  }

  return {
    renderTemplates,
    getTemplateDefaultValues,
  }
}
