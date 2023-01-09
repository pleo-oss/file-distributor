import { ProbotOctokit } from 'probot'
import { Token } from 'yaml/dist/parse/cst'

export interface PathConfiguration {
  source: string
  destination: string
}

export type ConfigurationValues = { [key: string]: string | undefined }

export interface CSTRepresentation {
  tokens: Token[]
  lines: number[]
}

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
  files: File[]
}

export interface File {
  sourcePath: string
  destinationPath: string
  contents: string
}

export interface Files {
  version: string
  files: File[]
}

export interface ReleaseInformation {
  contents: ArrayBuffer
  version: string
}

export interface PRDetails {
  title: string
  description: string
}

export type Check = {
  owner: string
  repo: string
  sha: string
  conclusion: 'action_required' | 'failure' | 'neutral' | 'success'
  checkRunId: number | undefined
  errors: ValidationError[]
}

export interface CheckInput {
  prNumber: number
  repository: RepositoryDetails
  configFileName: string
  sha: string
  checkId?: number
}

export interface ValidationError {
  message: string | undefined
  line?: number | undefined
}

export interface ConfigurationValidation {
  result: boolean
  errors: ValidationError[]
}

export type OctokitInstance = InstanceType<typeof ProbotOctokit>
