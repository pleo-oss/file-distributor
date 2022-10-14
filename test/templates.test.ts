import JSZip from 'jszip'
import {PathConfiguration} from '../src/types'
import {renderTemplates} from '../lib/templates'
import {Logger} from 'probot'
import {OctokitInstance} from '../src/types'

const log = {info: () => ({}), error: () => ({}), debug: () => ({})} as unknown as Logger

const stubTemplates = async (files: { path: string, data: string }[]): Promise<ArrayBuffer> => {
  const zip = new JSZip()
  files.forEach(value => {
    zip.file(value.path, value.data)
  })
  return zip
    .generateAsync({type: 'arraybuffer', streamFiles: true})
}

const createMockedOctokit = (files: { path: string, data: string }[]): OctokitInstance => {
  return {
    repos: {
      getReleaseByTag: () => {
        return {
          data: {
            zipball_url: 'https://fake.url',
          },
        }
      },
      downloadZipballArchive: () => {
        return {
          data: stubTemplates(files),
        }
      },
    },
  } as unknown as OctokitInstance;
};

function testCodeOwnersFile() {
  return {
    path: '.github/CODEOWNERS',
    data: `* @pleo-io/global_team

templates/pattern* @pleo-io/team_from_pattern

templates/test_template.json @pleo-io/concrete_team_x
templates/test_template.toml @pleo-io/concrete_team_y
`
  };
}

const testRepositoryConfiguration = (pathConfigurations: PathConfiguration[], values: { [key: string]: string } = {appName: 'expected-app-name'}) => ({
  version: "0.0.3",
  files: pathConfigurations,
  values: values
});

describe('Template rendering', () => {
  test('should renders basic json and toml template', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      {path: 'templates/test_template.json', data: '{"owner": "pleo", "repo": "{{appName}}"}'},
      {path: 'templates/test_template.toml', data: 'owner = "pleo" repo = "{{appName}}"'}
    ]);

    const configuration = testRepositoryConfiguration([
      {source: 'templates/test_template.json', destination: 'test_template.json'},
      {source: 'templates/test_template.toml', destination: 'test_template.toml'},
    ]);

    //when
    const renderedTemplates = await renderTemplates(configuration)(log)(mockedOctokit)

    //then
    expect(renderedTemplates.templates.length).toBe(2)

    //and
    expect(renderedTemplates.templates[0].contents).toBe(`{"owner": "pleo", "repo": "expected-app-name"}`)
    expect(renderedTemplates.templates[1].contents).toBe(`owner = "pleo" repo = "expected-app-name"`)
  })

  test('should skip prepending header for json file when CODEOWNERS defined', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      {path: 'templates/test_template.json', data: '{"owner": "pleo", "repo": "{{appName}}"}'},
      testCodeOwnersFile()]);

    const configuration = testRepositoryConfiguration([
      {source: 'templates/test_template.json', destination: 'test_template.json'},
    ]);

    //when
    const renderedTemplates = await renderTemplates(configuration)(log)(mockedOctokit)

    //then
    expect(renderedTemplates.templates[0].contents).toBe(`{"owner": "pleo", "repo": "expected-app-name"}`)
  })

  test('should add default prepending header for `toml` file when CODEOWNERS defined', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      {path: 'templates/test_template.toml', data: 'owner = "pleo" repo = "{{appName}}"'}, testCodeOwnersFile()]);

    const configuration = testRepositoryConfiguration([
      {source: 'templates/test_template.toml', destination: 'test_template.toml'},
    ]);

    //when
    const renderedTemplates = await renderTemplates(configuration)(log)(mockedOctokit)

    //then
    expect(renderedTemplates.templates[0].contents).toBe('#OWNER: @pleo-io/concrete_team_y\n\nowner = "pleo" repo = "expected-app-name"')
  });

  test('should prepending header from environment variable template', async () => {
    //given
    process.env.PREPENDING_HEADER_TEMPLATE = "#OTHER PREPENDING HEADER\n#TEAM:"

    const mockedOctokit = createMockedOctokit([
      {path: 'templates/test_template.toml', data: 'repo = "{{appName}}"'}, testCodeOwnersFile()]);

    const configuration = testRepositoryConfiguration([
      {source: 'templates/test_template.toml', destination: 'test_template.toml'},
    ]);

    //when
    const renderedTemplates = await renderTemplates(configuration)(log)(mockedOctokit)

    //then
    expect(renderedTemplates.templates[0].contents).toBe('#OTHER PREPENDING HEADER\n#TEAM:@pleo-io/concrete_team_y\n\nrepo = "expected-app-name"')
  });

  test('should assign global CODEOWNERS when not defined explicitly for file', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      {path: 'templates/global_template.toml', data: 'repo = "{{appName}}"'}, testCodeOwnersFile()]);

    const configuration = testRepositoryConfiguration([
      {source: 'templates/global_template.toml', destination: 'global_template.toml'},
    ]);

    //when
    const renderedTemplates = await renderTemplates(configuration)(log)(mockedOctokit)

    //then
    expect(renderedTemplates.templates[0].contents).toBe('#OWNER: @pleo-io/global_team\n\nrepo = "expected-app-name"')
  });

  test('should assign pattern CODEOWNERS when not defined explicitly for file', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      {path: 'templates/pattern_template_1.toml', data: 'repo = "{{appName}}"'},
      {path: 'templates/pattern_template_2.yaml', data: 'appVersion = "{{appVersion}}"'},
      testCodeOwnersFile()]);

    const configuration = testRepositoryConfiguration([
      {source: 'templates/pattern_template_1.toml', destination: 'test_template.toml'},
      {source: 'templates/pattern_template_2.yaml', destination: 'test_template.yaml'},
    ], {appName: 'expected-app-name', appVersion: 'expected-app-version'});

    //when
    const renderedTemplates = await renderTemplates(configuration)(log)(mockedOctokit)

    //then
    expect(renderedTemplates.templates[0].contents).toBe('#OWNER: @pleo-io/team_from_pattern\n\nrepo = "expected-app-name"')
    expect(renderedTemplates.templates[1].contents).toBe('#OWNER: @pleo-io/team_from_pattern\n\nappVersion = "expected-app-version"')
  });

  beforeEach(() => {
    process.env.PREPENDING_HEADER_TEMPLATE = ""
  });

});
