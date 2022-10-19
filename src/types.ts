import { ProbotOctokit } from 'probot'

export interface PathConfiguration {
  source: string
  destination: string
}

export interface RepositoryConfiguration {
  version?: string
  automerge?: boolean
  files?: PathConfiguration[]
  values?: { [key: string]: string }
}

export interface RepositoryDetails {
  owner: string
  repo: string
}

export interface ExtractedContent {
  codeOwners?: string
  templates: Template[]
}

export interface Template {
  sourcePath: string
  destinationPath: string
  contents: string
}

export interface Templates {
  version: string
  templates: Template[]
}

export interface TemplateInformation {
  contents: ArrayBuffer
  version: string
}

export interface PRDetails {
  title: string
  description: string
}

export type OctokitInstance = InstanceType<typeof ProbotOctokit>
