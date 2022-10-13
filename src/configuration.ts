import { parse } from 'yaml'
import { RepositoryDetails, RepositoryConfiguration, OctokitInstance } from './types'

export const determineConfigurationChanges =
  (fileName: string, repository: RepositoryDetails, sha: string) => async (octokit: Pick<OctokitInstance, 'repos'>) => {
    console.debug(`Saw changes to ${fileName}.`)
    const { data: fileContents } = await octokit.repos.getContent({
      ...repository,
      path: fileName,
      ref: sha,
    })

    const { content } = fileContents as { content: string }
    const decodedContent = Buffer.from(content, 'base64').toString()
    console.debug(`'${fileName}' contains:`)
    console.debug(decodedContent)

    const parsed: RepositoryConfiguration = parse(decodedContent)
    return parsed
  }
