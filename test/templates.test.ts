import JSZip from 'jszip'
import { RepositoryConfiguration } from '../lib/types'
import { renderTemplates } from '../lib/templates'
import { Logger } from 'probot'
import { OctokitInstance } from '../src/types'

const stubTemplates = async (): Promise<ArrayBuffer> => {
  const zip = new JSZip()
  return zip
    .file('templates/test_template.json', '{"owner": "pleo", "repo": "{{appName}}"}')
    .file('templates/test_template.toml', 'owner = "pleo" repo = "{{appName}}"')
    .generateAsync({ type: 'arraybuffer', streamFiles: true })
}

const log = { info: () => ({}), error: () => ({}), debug: () => ({}) } as unknown as Logger

describe('should be able to render templates successfully', () => {
  test('should render basic json and toml template', async () => {
    //given
    const mockedOctokit = {
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
            data: stubTemplates(),
          }
        },
      },
    } as unknown as OctokitInstance

    const repoConfig: RepositoryConfiguration = {
      version: '0.0.3',
      files: [
        { source: 'templates/test_template.json', destination: 'test_template.json' },
        { source: 'templates/test_template.toml', destination: 'test_template.toml' },
      ],
      values: { appName: 'expected-app-name' },
    }

    //when
    const renderedTemplates = await renderTemplates(repoConfig)(log)(mockedOctokit)

    //then
    expect(renderedTemplates.templates.length).toBe(2)

    //and
    expect(renderedTemplates.templates[0].contents).toBe(`{"owner": "pleo", "repo": "expected-app-name"}`)
    expect(renderedTemplates.templates[1].contents).toBe(`owner = "pleo" repo = "expected-app-name"`)
  })
})
