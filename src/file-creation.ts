import * as E from 'fp-ts/Either'
import { Logger } from 'probot'
import { configuration } from './configuration'
import { git } from './git'
import { release } from './release'
import { OctokitInstance, RepositoryDetails } from './types'

export const fileCreation = (
  log: Logger,
  octokit: Pick<OctokitInstance, 'pulls' | 'repos' | 'git' | 'issues' | 'checks'>,
) => {
  const pushFiles = async (repository: RepositoryDetails, sha: string, configFileName: string) => {
    const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
    const { getReleaseInformation, renderFiles } = release(log, octokit)
    const { commitFilesToPR, getCommitFiles } = git(log, octokit)
    const { owner, repo } = repository
    log.info('Processing changes made in commit %s.', sha)
    const filesChanged = await getCommitFiles(repository, sha)
    if (!filesChanged.includes(configFileName)) return

    const configurationChanges = await determineConfigurationChanges(configFileName, repository, sha)
    if (E.isLeft(configurationChanges)) return

    const repositoryConfiguration = configurationChanges.right
    const fetched = await getReleaseInformation(repositoryConfiguration.version)

    if (E.isLeft(fetched)) return
    const { configuration: defaultValues } = fetched.right

    const combined = combineConfigurations(defaultValues, repositoryConfiguration)
    const { version, files: processed } = await renderFiles(combined)
    const pullRequestNumber = await commitFilesToPR(repository, version, processed)

    if (pullRequestNumber) {
      log.info('Committed files to %s/%s in #%d', owner, repo, pullRequestNumber)
      log.info('See: https://github.com/%s/%s/pull/%d', owner, repo, pullRequestNumber)
    } else {
      log.info('Commit leads to no changes - skipping PR creation.')
    }
  }

  return {
    pushFiles,
  }
}
