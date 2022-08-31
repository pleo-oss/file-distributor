import { Context, Probot } from 'probot';
import { parse } from 'yaml';
import { RepositoryDetails, RepositoryConfiguration } from './types';

export default (app: Probot, context: Context<'push'>) => async (fileName: string, repository: RepositoryDetails, sha: string) => {
  app.log.debug(`Saw changes to ${fileName}.`);
  const fileContents = await context.octokit.repos.getContent({
    ...repository,
    path: fileName,
    ref: sha,
  });

  const { content } = fileContents.data as any;
  const decodedContent = Buffer.from(content, 'base64').toString();
  app.log.debug(`'${fileName}' contains:`);
  app.log.debug(decodedContent);

  const parsed: RepositoryConfiguration = parse(decodedContent);
  return parsed;
};
