import { ProbotOctokit } from 'probot'

export interface PathConfiguration {
  source: string
  destination: string
}

export type ConfigurationValues = { [key: string]: string | undefined }

export interface RepositoryConfiguration {
  version: string
  automerge?: boolean
  files?: PathConfiguration[]
  values?: ConfigurationValues
}

export interface RepositoryDetails {
  owner: string
  repo: string
  defaultBranch?: string
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

export interface CreateCheckInput {
  owner: string
  repo: string
  sha: string
}

export type UpdateCheckInput = CreateCheckInput & {
  conclusion: string
  checkRunId: number
}

export interface TemplateValidation {
  result: boolean
  errors: string[]
}

export type OctokitInstance = InstanceType<typeof ProbotOctokit>
