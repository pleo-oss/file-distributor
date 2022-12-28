import JSZip, { loadAsync } from 'jszip'
import { render } from 'mustache'
import {
  ExtractedContent,
  OctokitInstance,
  RepositoryConfiguration,
  Template,
  TemplateInformation,
  Templates,
  ValidationError,
} from './types'
import { OctokitResponse } from '@octokit/types'
import { Logger } from 'probot'
import { matchFile, parse as parseCodeowners } from 'codeowners-utils'
import { parse } from 'yaml'
import { ensurePathConfiguration } from './configuration'
import * as E from 'fp-ts/Either'

interface RepositoryFiles {
  configuration: RepositoryConfiguration
  files: string[]
}

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

    const extractTemplates: Promise<Template>[] =
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
    const toProcess: [string, Template[]] = await Promise.all([extractCodeOwners, Promise.all(extractTemplates)])

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

  const downloadTemplates = async (templateVersion: string): Promise<TemplateInformation> => {
    const templateRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
    }

    log.debug("Fetching templates from '%s/%s'.", templateRepository.owner, templateRepository.repo)
    const release = await getReleaseFromTag(templateVersion, templateRepository.owner, templateRepository.repo)

    log.debug("Fetching templates from URL: '%s'.", release.zipball_url)

    if (!release.zipball_url) {
      throw new Error(`Release '${release.id}' has no zipball URL.`)
    }

    log.debug("Fetching release information from '%s'.", release.zipball_url)
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
      log.debug('File extension: %s with not supported comments', templateExtension)
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
    log.debug("Configuration uses template version '%s' and values %o.", version, configuration.values)

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
    log.debug('Processed %d templates.', rendered.length)
    return { version: fetchedVersion, templates: rendered }
  }

  const getTemplateInformation = async (version: string): Promise<E.Either<ValidationError[], RepositoryFiles>> => {
    log.debug("Downloading templates with version '%s'.", version)

    try {
      const { contents } = await downloadTemplates(version)

      const loaded = await loadAsync(contents)

      const defaults = await extract(loaded, 'defaults.yaml')
      log.debug('Saw default configuration: %o', defaults)

      const allFiles = Object.keys(loaded.files)

      const parsed = parse(defaults) as RepositoryConfiguration

      return E.right({ configuration: parsed, files: allFiles })
    } catch (e) {
      const message: ValidationError = { message: `Could not fetch templates for version '${version}'` }
      return E.left([message])
    }
  }

  return {
    renderTemplates,
    getTemplateInformation,
  }
}
