import { ProbotOctokit } from 'probot'

export interface PathConfiguration {
  source: string
  destination: string
}

export type ConfigurationValues = { [key: string]: string | undefined }

export interface RepositoryConfiguration {
  version: string
  automerge?: boolean
  files?: (PathConfiguration | string)[]
  values?: ConfigurationValues
}

export interface RepositoryDetails {
  owner: string
  repo: string
  defaultBranch: string
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
  errors: ValidationError[]
}

export interface ValidationError {
  message: string | undefined
  line: number | undefined
}

export interface TemplateValidation {
  result: boolean
  errors: ValidationError[]
}

export type OctokitInstance = InstanceType<typeof ProbotOctokit>

export class VersionNotFoundError extends Error {
  name = 'VersionNotFoundError'
  version: string
  owner: string
  repo: string
  constructor(message: string, owner: string, repo: string, version: string) {
    super(message)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
    this.owner = owner
    this.repo = repo
    this.version = version
  }
}
