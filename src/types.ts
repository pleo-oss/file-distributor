import { ProbotOctokit } from 'probot'
import { Token } from 'yaml/dist/parse/cst'

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
  templates: TemplateFile[]
}

export interface TemplateFile {
  sourcePath: string
  destinationPath: string
  contents: string
}

export interface Templates {
  version: string
  templates: TemplateFile[]
}

export interface Template {
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
  message?: string
  line?: number
}

export interface ConcreteSyntaxTree {
  tokens: Token[]
  lines: number[]
}

export type Error = {
  type: 'error'
  errors: ValidationError[]
}

export type Successful<T> = { type: 'present'; value: T }
export type Validated<T> = Error | Successful<T>

export const err = (errors: ValidationError[]): Error => ({ type: 'error', errors })
export const present = <T>(value: T): Successful<T> => ({ type: 'present', value })

export type OctokitInstance = InstanceType<typeof ProbotOctokit>
