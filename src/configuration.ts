import { Logger } from 'probot'
import { parse } from 'yaml'
import { RepositoryDetails, RepositoryConfiguration, OctokitInstance } from './types'

export const determineConfigurationChanges =
  (fileName: string, repository: RepositoryDetails, sha: string) =>
  (log: Logger) =>
  async (octokit: Pick<OctokitInstance, 'repos'>) => {
    log.debug(`Saw changes to ${fileName}.`)
    const { data: fileContents } = await octokit.repos.getContent({
      ...repository,
      path: fileName,
      ref: sha,
    })

    const { content } = fileContents as { content: string }
    const decodedContent = Buffer.from(content, 'base64').toString()
    log.debug(`'${fileName}' contains:`)
    log.debug(decodedContent)

    try {
      const parsed: RepositoryConfiguration = parse(decodedContent)
      log.debug('Saw configuration file contents:')
      log.debug(parsed)

      const combinedConfiguration: RepositoryConfiguration = {
        ...parsed,
        values: {
          ...parsed.values,
          repositoryName: repository.repo,
          defaultBranch: repository.defaultBranch,
        },
      }

      log.debug('Saw combined configuration contents:')
      log.debug(combinedConfiguration)

      return combinedConfiguration
    } catch (e: unknown) {
      return undefined
    }
  }
