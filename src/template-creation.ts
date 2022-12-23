import * as E from 'fp-ts/Either'
import { Logger } from 'probot'
import { configuration } from './configuration'
import { git } from './git'
import { templates } from './templates'
import { OctokitInstance, RepositoryDetails } from './types'

export const templateCreation = (log: Logger, octokit: Pick<OctokitInstance, 'pulls' | 'repos' | 'git' | 'issues'>) => {
  const pushTemplates = async (repository: RepositoryDetails, sha: string, configFileName: string) => {
    const { combineConfigurations, determineConfigurationChanges } = configuration(log, octokit)
    const { getTemplateInformation, renderTemplates } = templates(log, octokit)
    const { commitFilesToPR, getCommitFiles } = git(log, octokit)
    const { owner, repo } = repository
    log.info('Processing changes made in commit %s.', sha)
    const filesChanged = await getCommitFiles(repository, sha)
    if (!filesChanged.includes(configFileName)) return

    const errorOrTemplateConfig = await determineConfigurationChanges(configFileName, repository, sha)
    if (E.isLeft(errorOrTemplateConfig)) return

    const { repositoryConfiguration } = errorOrTemplateConfig.right
    const { configuration: defaultValues } = await getTemplateInformation(repositoryConfiguration.version)

    const combined = combineConfigurations(defaultValues, repositoryConfiguration)
    const { version, templates: processed } = await renderTemplates(combined)
    const pullRequestNumber = await commitFilesToPR(repository, version, processed)

    if (pullRequestNumber) {
      log.info('Committed templates to %s/%s in #%d', owner, repo, pullRequestNumber)
      log.info('See: https://github.com/%s/%s/pull/%d', owner, repo, pullRequestNumber)
    } else {
      log.info('Commit leads to no changes - skipping PR creation.')
    }
  }

  return {
    pushTemplates,
  }
}
