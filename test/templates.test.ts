import JSZip from 'jszip'
import { PathConfiguration } from '../src/types'
import { templates } from '../src/templates'
import { Logger } from 'probot'
import { OctokitInstance } from '../src/types'

const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger

const stubTemplates = async (files: { path: string; data: string }[]): Promise<ArrayBuffer> => {
  const zip = new JSZip()
  files.forEach(value => {
    zip.file(value.path, value.data)
  })
  return zip.generateAsync({ type: 'arraybuffer', streamFiles: true })
}

const createMockedOctokit = (files: { path: string; data: string }[]): OctokitInstance => {
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
  } as unknown as OctokitInstance
}

function testCodeOwnersFile() {
  return {
    path: '.github/CODEOWNERS',
    data: `* @pleo-io/global_team

templates/pattern* @pleo-io/team_from_pattern

templates/test_template.json @pleo-io/concrete_team_x
templates/test_template.toml @pleo-io/concrete_team_y
`,
  }
}

const getRepositoryConfiguration = (
  pathConfigurations: (PathConfiguration | string)[],
  values: { [key: string]: string } = { appName: 'expected-app-name' },
) => ({
  version: '0.0.3',
  files: pathConfigurations,
  values: values,
})

describe('Template rendering', () => {
  test('should render basic json and toml template', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      { path: 'templates/test_template.json', data: '{"owner": "pleo", "repo": "<<<appName>>>"}' },
      { path: 'templates/test_template.toml', data: 'owner = "pleo" repo = "<<<appName>>>"' },
    ])

    const configuration = getRepositoryConfiguration([
      { source: 'templates/test_template.json', destination: 'test_template.json' },
      { source: 'templates/test_template.toml', destination: 'test_template.toml' },
    ])

    const { renderTemplates } = templates(log, mockedOctokit)

    //when
    const renderedTemplates = await renderTemplates(configuration)

    //then
    expect(renderedTemplates.templates.length).toBe(2)

    //and
    expect(renderedTemplates.templates[0].contents).toBe('{"owner": "pleo", "repo": "expected-app-name"}')
    expect(renderedTemplates.templates[1].contents).toBe('owner = "pleo" repo = "expected-app-name"')
  })

  test('should render relative path templates with expected prefix', async () => {
    const oldEnv = process.env

    const contents = [
      { path: 'templates/somePath/test_template.json', data: '{"owner": "pleo", "repo": "<<<appName>>>"}' },
      { path: 'templates/somePath/test_template.toml', data: 'owner = "pleo" repo = "<<<appName>>>"' },
    ]

    const mockedOctokit = createMockedOctokit([...contents])

    const configuration = getRepositoryConfiguration(['somePath/test_template.json', 'somePath/test_template.toml'])

    const { renderTemplates } = templates(log, mockedOctokit)

    process.env['TEMPLATE_PATH_PREFIX'] = 'templates/'

    const { templates: result } = await renderTemplates(configuration)

    expect(result.length).toEqual(2)
    expect(result[0].contents).toEqual('{"owner": "pleo", "repo": "expected-app-name"}')
    expect(result[1].contents).toEqual('owner = "pleo" repo = "expected-app-name"')
    expect(result[0].sourcePath).toEqual(contents[0].path)
    expect(result[1].sourcePath).toEqual(contents[1].path)

    process.env = oldEnv
  })

  test('should render mixed relative path templates and (source, destination) with expected prefixes', async () => {
    const oldEnv = process.env

    const contents = [
      { path: 'templates/somePath/test_template.json', data: '{"owner": "pleo", "repo": "<<<appName>>>"}' },
      { path: 'templates/somePath/test_template.toml', data: 'owner = "pleo" repo = "<<<appName>>>"' },
      { path: 'templates/test_template.json', data: '{"owner": "pleo", "repo": "<<<appName>>>"}' },
      { path: 'templates/test_template.toml', data: 'owner = "pleo" repo = "<<<appName>>>"' },
    ]

    const mockedOctokit = createMockedOctokit([...contents])

    const configuration = getRepositoryConfiguration([
      'somePath/test_template.json',
      'somePath/test_template.toml',
      { source: 'templates/test_template.json', destination: 'test_template.json' },
      { source: 'templates/test_template.toml', destination: 'test_template.toml' },
    ])

    const { renderTemplates } = templates(log, mockedOctokit)

    process.env['TEMPLATE_PATH_PREFIX'] = 'templates/'

    const { templates: result } = await renderTemplates(configuration)

    expect(result.length).toEqual(4)
    expect(result[0].contents).toEqual('{"owner": "pleo", "repo": "expected-app-name"}')
    expect(result[1].contents).toEqual('owner = "pleo" repo = "expected-app-name"')
    expect(result[2].contents).toEqual('{"owner": "pleo", "repo": "expected-app-name"}')
    expect(result[3].contents).toEqual('owner = "pleo" repo = "expected-app-name"')
    expect(result[0].sourcePath).toEqual(contents[0].path)
    expect(result[1].sourcePath).toEqual(contents[1].path)
    expect(result[2].sourcePath).toEqual(contents[2].path)
    expect(result[3].sourcePath).toEqual(contents[3].path)

    process.env = oldEnv
  })

  test('should skip prepending header for json file when CODEOWNERS defined', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      { path: 'templates/test_template.json', data: '{"owner": "pleo", "repo": "<<<appName>>>"}' },
      testCodeOwnersFile(),
    ])

    const configuration = getRepositoryConfiguration([
      { source: 'templates/test_template.json', destination: 'test_template.json' },
    ])

    const { renderTemplates } = templates(log, mockedOctokit)

    //when
    const renderedTemplates = await renderTemplates(configuration)

    //then
    expect(renderedTemplates.templates[0].contents).toBe('{"owner": "pleo", "repo": "expected-app-name"}')
  })

  test('should add default prepending header for `toml` file when CODEOWNERS defined', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      { path: 'templates/test_template.toml', data: 'owner = "pleo" repo = "<<<appName>>>"' },
      testCodeOwnersFile(),
    ])

    const configuration = getRepositoryConfiguration([
      { source: 'templates/test_template.toml', destination: 'test_template.toml' },
    ])

    const { renderTemplates } = templates(log, mockedOctokit)

    //when
    const renderedTemplates = await renderTemplates(configuration)

    //then
    expect(renderedTemplates.templates[0].contents).toBe(
      '#OWNER: @pleo-io/concrete_team_y\n\nowner = "pleo" repo = "expected-app-name"',
    )
  })

  test('should prepending header from environment variable template', async () => {
    //given
    process.env.PREPENDING_HEADER_TEMPLATE =
      '# THIS CODE WAS AUTOGENERATED. DO NOT MODIFY THIS FILE DIRECTLY\n' +
      '# THE SOURCE CODE LIVES IN A DIFFERENT REPOSITORY:\n' +
      '#  - {{{template-repository}}}\n' +
      '# FILE STEWARD: {{{stewards}}}'

    process.env.TEMPLATE_REPOSITORY_NAME = 'magic-templates'

    const mockedOctokit = createMockedOctokit([
      { path: 'templates/test_template.toml', data: 'repo = "<<<appName>>>"' },
      testCodeOwnersFile(),
    ])

    const configuration = getRepositoryConfiguration([
      { source: 'templates/test_template.toml', destination: 'test_template.toml' },
    ])

    const { renderTemplates } = templates(log, mockedOctokit)

    //when
    const renderedTemplates = await renderTemplates(configuration)

    //then
    expect(renderedTemplates.templates[0].contents).toBe(
      `# THIS CODE WAS AUTOGENERATED. DO NOT MODIFY THIS FILE DIRECTLY
# THE SOURCE CODE LIVES IN A DIFFERENT REPOSITORY:
#  - magic-templates
# FILE STEWARD: @pleo-io/concrete_team_y

repo = "expected-app-name"`,
    )
  })

  test('should assign global CODEOWNERS when not defined explicitly for file', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      { path: 'templates/global_template.toml', data: 'repo = "<<<appName>>>"' },
      testCodeOwnersFile(),
    ])

    const configuration = getRepositoryConfiguration([
      { source: 'templates/global_template.toml', destination: 'global_template.toml' },
    ])

    const { renderTemplates } = templates(log, mockedOctokit)

    //when
    const renderedTemplates = await renderTemplates(configuration)

    //then
    expect(renderedTemplates.templates[0].contents).toBe('#OWNER: @pleo-io/global_team\n\nrepo = "expected-app-name"')
  })

  test('should assign pattern CODEOWNERS when not defined explicitly for file', async () => {
    //given
    const mockedOctokit = createMockedOctokit([
      { path: 'templates/pattern_template_1.toml', data: 'repo = "<<<appName>>>"' },
      { path: 'templates/pattern_template_2.yaml', data: 'appVersion = "<<<appVersion>>>"' },
      testCodeOwnersFile(),
    ])

    const configuration = getRepositoryConfiguration(
      [
        { source: 'templates/pattern_template_1.toml', destination: 'test_template.toml' },
        { source: 'templates/pattern_template_2.yaml', destination: 'test_template.yaml' },
      ],
      { appName: 'expected-app-name', appVersion: 'expected-app-version' },
    )

    const { renderTemplates } = templates(log, mockedOctokit)

    //when
    const renderedTemplates = await renderTemplates(configuration)

    //then
    expect(renderedTemplates.templates[0].contents).toBe(
      '#OWNER: @pleo-io/team_from_pattern\n\nrepo = "expected-app-name"',
    )
    expect(renderedTemplates.templates[1].contents).toBe(
      '#OWNER: @pleo-io/team_from_pattern\n\nappVersion = "expected-app-version"',
    )
  })

  beforeEach(() => {
    process.env.PREPENDING_HEADER_TEMPLATE = ''
    process.env.TEMPLATE_REPOSITORY_NAME = ''
  })
})
