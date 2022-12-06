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
import { parse, YAMLError } from 'yaml'
import { ensurePathConfiguration } from './configuration'
import { Either, left, right } from 'fp-ts/lib/Either'

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

  const downloadTemplates = async (
    templateVersion: string,
  ): Promise<Either<ValidationError[], TemplateInformation>> => {
    const templateRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
    }

    log.debug("Fetching templates from '%s/%s'.", templateRepository.owner, templateRepository.repo)
    try {
      const release = await getReleaseFromTag(templateVersion, templateRepository.owner, templateRepository.repo)
      log.debug("Fetching templates from URL: '%s'.", release.zipball_url)

      if (!release.zipball_url) {
        return left([{ message: `Release '${release.id}' has no zipball URL.`, line: undefined }])
      }

      log.debug("Fetching release information from '%s'.", release.zipball_url)
      const { data: contents } = (await octokit.repos.downloadZipballArchive({
        ...templateRepository,
        ref: release.tag_name,
      })) as OctokitResponse<ArrayBuffer>
      log.debug('Fetched release contents.')

      return right({
        contents,
        version: release.tag_name,
      })
    } catch (error) {
      return left([{ message: `Failed to fetch release ${templateVersion}`, line: undefined }])
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

  const renderTemplates = async (
    configuration: RepositoryConfiguration,
  ): Promise<Either<ValidationError[], Templates>> => {
    log.debug('Processing configuration changes.')
    const { version } = configuration
    log.debug("Configuration uses template version '%s' and values %o.", version, configuration.values)

    const templates = await downloadTemplates(version)
    if (templates._tag === 'Left') return templates

    const { contents, version: fetchedVersion } = templates.right
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
    return right({ version: fetchedVersion, templates: rendered })
  }

  const getTemplateInformation = async (version: string) => {
    log.debug("Downloading templates with version '%s'.", version)
    const templates = await downloadTemplates(version)

    if (templates._tag === 'Left') return templates

    const { contents } = templates.right

    const loaded = await loadAsync(contents)
    const defaults = await extract(loaded, 'defaults.yaml')
    log.debug('Saw default configuration: %o', defaults)

    const allFiles = Object.keys(loaded.files)

    try {
      const parsed = parse(defaults, { prettyErrors: true }) as RepositoryConfiguration
      return right({ configuration: parsed, files: allFiles })
    } catch (e: unknown) {
      if (e instanceof YAMLError) {
        return left([
          {
            line: e.linePos?.[0].line,
            message: e.message,
          },
        ])
      }
      return left([{ message: `Failed to parse default template values with version ${version}`, line: undefined }])
    }
  }

  return {
    renderTemplates,
    getTemplateInformation,
  }
}
