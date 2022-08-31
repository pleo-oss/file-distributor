import { Context, Probot } from 'probot';
import { createWriteStream, promises as fs } from 'fs';
import axios from 'axios';
import { loadAsync } from 'jszip';
import { render } from 'mustache';
import { RepositoryDetails, RepositoryConfiguration, Template } from './types';

export const extractZipContents = (app: Probot) => async (filePath: string, configuration: RepositoryConfiguration) => {
  app.log.debug(`Extracting ZIP contents from ${filePath}.`);
  const zipFile = await fs.readFile(filePath);
  const loaded = await loadAsync(zipFile);

  const toProcess = Promise.all(
    configuration.files?.map(async (file) => {
      const found = loaded.file(new RegExp(file.source));
      app.log.debug(
        `Found ${found.length} file(s) matching ${file.source}. `,
      );
      const picked = found.shift();
      if (picked) app.log.debug(`Using ${picked.name} for ${file.source}. `);

      const text = await picked?.async('text');
      const contents = text?.replace(/#{{/gm, '{{');

      return {
        path: file.destination,
        contents,
      };
    }) ?? [],
  );

  const templates = (await toProcess).filter(
    (it) => it?.contents,
  ) as Template[];
  app.log.debug(`Extracted ${templates.length} ZIP templates.`);

  return templates;
};

const getReleaseFromTag = (context: Context<'push'>) => (tag?: string) => {
  const getLatestRelease = async (repository: RepositoryDetails) => {
    const latestRelease = await context.octokit.repos.getLatestRelease({
      ...repository,
    });
    return latestRelease.data;
  };

  const getRelease = async (repository: RepositoryDetails) => {
    if (!tag) { throw Error('A release tag is missing.'); }

    const release = await context.octokit.repos.getReleaseByTag({
      ...repository,
      tag,
    });
    return release.data;
  };

  return tag ? getRelease : getLatestRelease;
};

const downloadFile = async (url: string, path: string) => {
  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'Pleo Template Fetch',
    },
  });

  await new Promise((resolve, reject) => {
    const dest = createWriteStream(path);
    response.data
      .on('end', () => {
        resolve(path);
      })
      .on('error', (err: unknown) => {
        reject(err);
      })
      .pipe(dest);
  });

  return path;
};

export const downloadTemplates = (app: Probot, context: Context<'push'>) => async (repository: RepositoryDetails, templateVersion?: string) => {
  const templateRepository = {
    owner: process.env.TEMPLATE_REPOSITORY_OWNER ?? '',
    repo: process.env.TEMPLATE_REPOSITORY_NAME ?? '',
  };

  app.log.debug(
    `Fetching templates from '${templateRepository.owner}/${templateRepository.repo}.`,
  );
  const release = await getReleaseFromTag(context)(templateVersion)(
    templateRepository,
  );
  app.log.debug(`Fetching templates from URL: '${release.zipball_url}'.`);

  const templatePath = `/tmp/${repository.repo}`;
  try {
    await fs.mkdir(templatePath, { recursive: true });
  } catch (e: unknown) {
    app.log.error(
      `Failed to create temporary ZIP directory for '${repository.repo}'.`,
    );
    throw e;
  }

  if (!release.zipball_url) {
    app.log.error(`Release '${release.id}' has no zipball URL.`);
    throw Error(`Release '${release.id}' has no zipball URL.`);
  }

  app.log.debug(
    `Fetching release information from '${release.zipball_url}'.`,
  );

  const link: { url: string } = (await context.octokit.repos.downloadZipballArchive({
    ...templateRepository,
    ref: release.tag_name,
  })) as any;
  app.log.debug('Fetching release ZIP from:');
  app.log.debug(link);

  const filePath = `${templatePath}/release.zip`;
  const path = await downloadFile(link.url, filePath);
  app.log.debug('Fetched release ZIP.');

  return path;
};

export const renderTemplates = (app: Probot, context: Context<'push'>) => async (
  repository: RepositoryDetails,
  configuration: RepositoryConfiguration,
): Promise<Template[]> => {
  app.log.debug('Processing configuration changes.');
  const { version } = configuration;
  app.log.debug(`Configuration uses template version '${version}'.`);

  const templateFilePath = await downloadTemplates(app, context)(
    repository,
    version,
  );
  const templateContents = await extractZipContents(app)(
    templateFilePath,
    configuration,
  );

  const rendered = templateContents.map((template) => ({
    ...template,
    contents: render(template.contents, configuration.values),
  }));
  app.log.debug(`Processed ${rendered.length} templates.`);
  return rendered;
};
