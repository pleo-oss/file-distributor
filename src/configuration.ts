import { Logger } from 'probot'
import { parse } from 'yaml'
import { RepositoryDetails, RepositoryConfiguration, OctokitInstance, PathConfiguration } from './types'

export const combineConfigurations = (
  base: RepositoryConfiguration,
  override: Partial<RepositoryConfiguration>,
): RepositoryConfiguration => {
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

export const configuration = (log: Logger, octokit: Pick<OctokitInstance, 'repos'>) => {
  const determineConfigurationChanges = async (fileName: string, repository: RepositoryDetails, sha: string) => {
    log.debug('Saw changes to %s.', fileName)
    const { data: fileContents } = await octokit.repos.getContent({
      ...repository,
      path: fileName,
      ref: sha,
    })

    const { content } = fileContents as { content: string }
    const decodedContent = Buffer.from(content, 'base64').toString()
    log.debug('%s contains: %s', fileName, decodedContent)

    const parsed: RepositoryConfiguration = parse(decodedContent)

    log.debug('Saw configuration file contents: %s', parsed)

    const combinedConfiguration: RepositoryConfiguration = {
      ...parsed,
      files: ensurePathConfiguration(parsed.files),
      values: {
        ...parsed.values,
        repositoryName: repository.repo,
        defaultBranch: repository.defaultBranch,
      },
    }

    log.debug('Saw combined configuration contents:')
    log.debug(combinedConfiguration)

    return combinedConfiguration
  }

  return {
    determineConfigurationChanges,
    combineConfigurations,
  }
}
