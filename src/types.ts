interface PathConfiguration {
  source: string;
  destination: string;
}

export interface RepositoryConfiguration {
  version?: string;
  automerge?: boolean;
  files?: PathConfiguration[];
  values?: { [key: string]: string };
}

export interface RepositoryDetails {
  owner: string;
  repo: string;
}

export interface Template {
  path: string;
  contents: string;
}

export interface Templates {
  version: string;
  templates: Template[],
}

export interface TemplateInformation {
  path: string,
  version: string
}

export interface PRDetails {
  title: string,
  description: string
}
