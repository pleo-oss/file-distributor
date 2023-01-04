import JSZip, { loadAsync } from 'jszip'
import { render } from 'mustache'
import {
  ExtractedContent,
  OctokitInstance,
  RepositoryConfiguration,
  File,
  ReleaseInformation,
  Files,
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

export const release = (log: Logger, octokit: Pick<OctokitInstance, 'repos'>) => {
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

    const extractFiles: Promise<File>[] =
      ensurePathConfiguration(configuration.files)
        ?.filter(file => {
          const extensionMatches = file.source.split('.').pop() === file.destination.split('.').pop()
          if (!extensionMatches) {
            log.warn(
              "Configuration seems to be invalid, file extension mismatch between source: '%s' and destination: '%s'. Skipping!",
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
    const toProcess: [string, File[]] = await Promise.all([extractCodeOwners, Promise.all(extractFiles)])

    const codeOwners = toProcess[0]
    const files = toProcess[1].filter(it => it?.contents)
    log.debug('Extracted %d ZIP files.', files.length)

    return {
      codeOwners,
      files,
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

  const downloadFiles = async (releaseVersion: string): Promise<ReleaseInformation> => {
    const releaseRepository = {
      owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
      repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
    }

    log.debug("Fetching files from '%s/%s'.", releaseRepository.owner, releaseRepository.repo)
    const release = await getReleaseFromTag(releaseVersion, releaseRepository.owner, releaseRepository.repo)

    log.debug("Fetching files from URL: '%s'.", release.zipball_url)

    if (!release.zipball_url) {
      throw new Error(`Release '${release.id}' has no zipball URL.`)
    }

    log.debug("Fetching release information from '%s'.", release.zipball_url)
    const { data: contents } = (await octokit.repos.downloadZipballArchive({
      ...releaseRepository,
      ref: release.tag_name,
    })) as OctokitResponse<ArrayBuffer>
    log.debug('Fetched release contents.')

    return {
      contents,
      version: release.tag_name,
    }
  }

  const enrichWithPrePendingHeader = (mustacheRenderedContent: string, file: File, codeowners: string): string => {
    const fileExtension = file.destinationPath.split('.').pop()
    if (!(fileExtension === 'yaml' || fileExtension === 'toml' || fileExtension === 'yml')) {
      log.debug('File extension: %s with not supported comments', fileExtension)
      return mustacheRenderedContent
    }

    const codeOwnersEntries = parseCodeowners(codeowners)
    const matchedCodeOwner = matchFile(file.sourcePath, codeOwnersEntries)

    const header = process.env.PREPENDING_HEADER_TEMPLATE || '#OWNER: {{{stewards}}}'
    if (!header) log.info('Prepending header is not defined, using default.')

    const renderedPrePendingHeader = render(header, {
      'template-repository': process.env.TEMPLATE_REPOSITORY_NAME ?? '',
      stewards: matchedCodeOwner?.owners,
    })

    return `${renderedPrePendingHeader}\n\n${mustacheRenderedContent}`
  }

  const renderFiles = async (configuration: RepositoryConfiguration): Promise<Files> => {
    log.debug('Processing configuration changes.')
    const { version } = configuration
    log.debug("Configuration uses release version '%s' and values %o.", version, configuration.values)

    const { contents, version: fetchedVersion } = await downloadFiles(version)
    const extractedContent = await extractZipContents(contents, configuration)

    const delimiters: [string, string] = ['<<<', '>>>']
    const rendered = extractedContent.files.map(file => {
      const mustacheRenderedContent = render(file.contents, configuration.values, {}, delimiters)

      if (!extractedContent.codeOwners) {
        return { ...file, contents: mustacheRenderedContent }
      }
      return {
        ...file,
        contents: enrichWithPrePendingHeader(mustacheRenderedContent, file, extractedContent.codeOwners),
      }
    })
    log.debug('Processed %d files.', rendered.length)
    return { version: fetchedVersion, files: rendered }
  }

  const getReleaseInformation = async (version: string): Promise<E.Either<ValidationError[], RepositoryFiles>> => {
    log.debug("Downloading release with version '%s'.", version)

    try {
      const { contents } = await downloadFiles(version)

      const loaded = await loadAsync(contents)

      const defaults = await extract(loaded, 'defaults.yaml')
      log.debug('Saw default configuration: %o', defaults)

      const allFiles = Object.keys(loaded.files)

      const parsed = parse(defaults) as RepositoryConfiguration

      return E.right({ configuration: parsed, files: allFiles })
    } catch (e) {
      const message: ValidationError = { message: `Could not fetch release for version '${version}'` }
      return E.left([message])
    }
  }

  return {
    renderFiles,
    getReleaseInformation,
  }
}
