import { Context } from 'probot'
import { parse } from 'yaml'
import { RepositoryDetails, RepositoryConfiguration } from './types'

export const determineConfigurationChanges =
  (context: Context<'push'>) => async (fileName: string, repository: RepositoryDetails, sha: string) => {
    console.debug(`Saw changes to ${fileName}.`)
    const fileContents = await context.octokit.repos.getContent({
      ...repository,
      path: fileName,
      ref: sha,
    })

    const { content } = fileContents.data as { content: string }
    const decodedContent = Buffer.from(content, 'base64').toString()
    console.debug(`'${fileName}' contains:`)
    console.debug(decodedContent)

    const parsed: RepositoryConfiguration = parse(decodedContent)
    return parsed
  }
