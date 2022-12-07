import { Logger } from 'probot'
import { LineCounter, parseDocument, Parser } from 'yaml'
import {
  RepositoryDetails,
  RepositoryConfiguration,
  OctokitInstance,
  PathConfiguration,
  Validated,
  present,
  err,
} from './types'

export const combineConfigurations = async (
  base: RepositoryConfiguration,
  override: Partial<RepositoryConfiguration>,
): Promise<RepositoryConfiguration> => {
  const baseFiles = new Set((base.files ?? []).map(entry => JSON.stringify(entry)))
  const overrideFiles = new Set((override.files ?? []).map(entry => JSON.stringify(entry)))
  return {
    ...base,
    ...override,
    values: {
      ...base.values,
      ...override.values,
    },
    files: Array.from(new Set([...baseFiles, ...overrideFiles])).map(entry => JSON.parse(entry)),
  }
}

export const ensurePathConfiguration = (files?: (PathConfiguration | string)[]) => {
  const pathPrefix = process.env['TEMPLATE_PATH_PREFIX'] ?? ''
  return files?.map((file: PathConfiguration | string) => {
    if (typeof file === 'string') {
      return {
        source: `${pathPrefix}${file}`,
        destination: file,
      }
    }
    return file
  })
}

export const generateSyntaxTree = async (input: string) => {
  const lineCounter = new LineCounter()

  const cst = new Parser(lineCounter.addNewLine).parse(input)
  const tokens = Array.from(cst)

  const rep = {
    tokens: tokens,
    lines: lineCounter.lineStarts,
  }

  return rep
}

export const configuration = (log: Logger, octokit: Pick<OctokitInstance, 'repos'>) => {
  const determineConfigurationChanges = async (
    configuration: string,
    fileName: string,
    repository: RepositoryDetails,
  ): Promise<Validated<RepositoryConfiguration>> => {
    log.debug('Saw changes to %s.', fileName)

    const document = parseDocument(configuration)
    if (document.errors.length > 0) return err(document.errors)

    const parsed = document.toJS() as RepositoryConfiguration
    log.debug('Saw configuration file contents %o', parsed)

    const combinedConfiguration: RepositoryConfiguration = {
      ...parsed,
      files: ensurePathConfiguration(parsed.files),
      values: {
        ...parsed.values,
        repositoryName: repository.repo,
        defaultBranch: repository.defaultBranch,
      },
    }

    log.debug('Saw combined configuration contents %o', combinedConfiguration)
    return present(combinedConfiguration)
  }

  const extractConfiguration = async (repository: RepositoryDetails, fileName: string, sha: string) => {
    const { data: fileContents } = await octokit.repos.getContent({
      ...repository,
      path: fileName,
      ref: sha,
    })

    const { content } = fileContents as { content: string }
    const decodedContent = Buffer.from(content, 'base64').toString()
    log.debug('%s contains: %s', fileName, decodedContent)
    return decodedContent
  }

  return {
    determineConfigurationChanges,
    extractConfiguration,
  }
}
