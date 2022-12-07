import JSZip, { loadAsync } from 'jszip'
import { OpeningAndClosingTags, render } from 'mustache'
import {
  ExtractedContent,
  OctokitInstance,
  RepositoryConfiguration,
  TemplateFile,
  Template,
  Templates,
  Possibly,
  err,
} from './types'
import { OctokitResponse } from '@octokit/types'
import { Logger } from 'probot'
import { matchFile, parse as parseCodeowners } from 'codeowners-utils'
import { parse, parseDocument } from 'yaml'
import { ensurePathConfiguration } from './configuration'

export const templates = (log: Logger, octokit: Pick<OctokitInstance, 'repos'>) => {
  const extract = async (loaded: JSZip, source: string): Promise<string> => {
    const found = loaded.file(new RegExp(source, 'i'))
    log.debug('Found %d file(s) matching %s.', found.length, source)
    const picked = found.shift()
    if (picked) log.debug('Using %s for %s.', picked.name, source)

    const text = (await picked?.async('text')) ?? ''
    return text?.replace(/#<<</gm, '<<<')
  }

  const extractZipContents = async (
    contents: ArrayBuffer,
    configuration: RepositoryConfiguration,
  ): Promise<ExtractedContent> => {
    log.debug('Extracting ZIP contents.')
    const loaded = await loadAsync(contents)

    const extractTemplates: Promise<TemplateFile>[] =
      ensurePathConfiguration(configuration.files)
        ?.filter(file => {
          const extensionMatches = file.source.split('.').pop() === file.destination.split('.').pop()
          if (!extensionMatches) {
            log.warn(
              "Template configuration seems to be invalid, file extension mismatch between source: '%s' and destination: '%s'. Skipping!",
              file.source,
              file.destination,
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

    const toProcess: [string, TemplateFile[]] = await Promise.all([extractCodeOwners, Promise.all(extractTemplates)])

    const codeOwners = toProcess[0]
    const templates = toProcess[1].filter(it => it?.contents)
    log.debug('Extracted %d ZIP templates.', templates.length)

    return {
      codeOwners,
      templates,
    }
  }

  const getReleaseFromTag = async (tag: string, owner: string, repo: string) => {
    const { data } = await octokit.repos.getReleaseByTag({
      owner,
      repo,
      tag,
    })
    return data
  }

  const downloadTemplates = async (templateVersion: string): Promise<Template | undefined> => {
    const templateRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
    }

    log.debug("Fetching templates from '%s/%s'.", templateRepository.owner, templateRepository.repo)
    try {
      const { tag_name, id, zipball_url } = await getReleaseFromTag(
        templateVersion,
        templateRepository.owner,
        templateRepository.repo,
      )
      log.debug("Fetching templates from URL: '%s'.", zipball_url)

      if (!zipball_url) {
        const message = `Release '${id}' has no zipball URL.`
        log.error(message)
        return undefined
      }

      log.debug("Fetching release information from '%s'.", zipball_url)
      const { data: contents } = (await octokit.repos.downloadZipballArchive({
        ...templateRepository,
        ref: tag_name,
      })) as OctokitResponse<ArrayBuffer>
      log.debug('Fetched release contents.')

      const fetched: Template = {
        contents,
        version: tag_name,
      }
      return fetched
    } catch (error: unknown) {
      return undefined
    }
  }

  const supportedExtensions = ['yaml', 'toml', 'yml']
  const prependHeader = (renderedContent: string, template: TemplateFile, codeowners: string): string => {
    const templateExtension = template.destinationPath.split('.').pop()
    if (templateExtension && !supportedExtensions.includes(templateExtension)) {
      log.debug('File extension: %s does not support comments', templateExtension)
      return renderedContent
    }

    const codeOwnersEntries = parseCodeowners(codeowners)
    const matchedCodeOwner = matchFile(template.sourcePath, codeOwnersEntries)

    const header = process.env.PREPENDING_HEADER_TEMPLATE || '#OWNER: {{{stewards}}}'
    if (!header) log.info('Prepending header template not defined, using default.')

    const renderedPrePendingHeader = render(header, {
      'template-repository': process.env.TEMPLATE_REPOSITORY_NAME ?? '',
      stewards: matchedCodeOwner?.owners,
    })

    return `${renderedPrePendingHeader}\n\n${renderedContent}`
  }

  const renderTemplates = async (configuration: RepositoryConfiguration): Promise<Templates | undefined> => {
    log.debug('Processing configuration changes.')
    const { version } = configuration
    log.debug("Configuration uses template version '%s' and values %o.", version, configuration.values)

    const templates = await downloadTemplates(version)
    if (!templates) return undefined

    const extractedContent = await extractZipContents(templates.contents, configuration)

    const delimiters: OpeningAndClosingTags = ['<<<', '>>>']
    const rendered = extractedContent.templates.map(template => {
      const renderedContent = render(template.contents, configuration.values, {}, delimiters)

      return {
        ...template,
        contents: extractedContent.codeOwners
          ? prependHeader(renderedContent, template, extractedContent.codeOwners)
          : renderedContent,
      }
    })
    log.debug('Processed %d templates.', rendered.length)
    const fetchedVersion = templates.version ?? version
    return { version: fetchedVersion, templates: rendered }
  }

  const getTemplateInformation = async (
    version: string,
  ): Promise<
    Possibly<{
      configuration: RepositoryConfiguration
      files: string[]
    }>
  > => {
    log.debug("Downloading templates with version '%s'.", version)
    const templates = await downloadTemplates(version)

    if (!templates) return err([{ message: `Templates for version ${version} could not be found.` }])

    const loaded = await loadAsync(templates.contents)

    const defaults = await extract(loaded, 'defaults.yaml')
    log.debug('Saw default configuration: %o', defaults)

    const allFiles = Object.keys(loaded.files)

    const doc = parseDocument(defaults)
    if (doc.errors.length > 0) return err(doc.errors)
    const parsed = parse(defaults) as RepositoryConfiguration

    const value = { configuration: parsed, files: allFiles }
    return { type: 'present', value }
  }

  return {
    renderTemplates,
    getTemplateInformation,
  }
}
