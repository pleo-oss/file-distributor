<h1 align="center">
📄 🔄 📦
</h1>
<h1 align="center"> File Distributor</h1>

<p align="center">A GitHub App for distributing files/templates to configured repositories in an organisation.</p>

---

This app monitors repositories for changes made to a repository template configuration detailing which templates the repository contains and which template conditions to use for rendering templates.

## Configuration
The app expects repositories to contain a `<repository-name>.yaml` file containing the template configuration the repository uses.

The configuration has the following format: 

``` yaml
# The template version to use (optional).
version: v10.7.0

# Whether to merge template changes automatically (optional).
automerge: true

# Templates to add to the repository (optional).
files:           
  - source: path/to/template/filename.yaml
    destination: path/to/template-destination/filename.yaml

# Configuration values for template formatting (optional).
values:          
  someTemplateProperty: some-value
```

The app listens for `push` events to `main` or `master` in repositories which modify the repository configuration. 

The app then pulls the repository configuration, downloads templates and processes templates according to the repository configuration. 

Processed templates are then submitted to the repository as a PR. If `automerge` is enabled, the PR is merged automatically.

## Templates
Templates support the full [Mustache template language](https://mustache.github.io) tags. 

Logic is handled as follows using a `YAML` template as an example:
```yaml
on:
  push:

jobs:
  build:
    steps:
      - name: Checkout {{repositoryName}}
        uses: actions/checkout@v3.0.2
        #{{^shouldCheckoutCode}}
        if: false
        #{{/shouldCheckoutCode}}

      #{{#shouldLoginToDockerHub}}
      - name: Login to DockerHub
        uses: docker/login-action@v2.0.0
        with:
          username: pleodeployments
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      #{{/shouldLoginToDockerHub}}
```

See the [Mustache manual](https://mustache.github.io/mustache.5.html) for more information on the template syntax.

## Setup

```sh
# Install dependencies
yarn

# Build the bot
yarn build

# Build and run the bot
yarn build:run

# Run the bot
yarn start
```

## Docker

```sh
# 1. Build container
docker build -t file-distributor .

# 2. Start container
docker run \
  -e APP_ID=<app-id> \
  -e PRIVATE_KEY=<pem-value> \
  -e WEBHOOK_SECRET=<webhook-secret> \
  -e TEMPLATE_REPOSITORY_NAME=<template-repository-name> \
  -e TEMPLATE_REPOSITORY_OWNER=<template-repository-owner> \
  -e BRANCHES_TO_PROCESS=<branches-to-process-regex> \
  file-distributor
```

## Environment variables
The app expects the following environment variables to be present:
```
WEBHOOK_PROXY_URL=https://smee.io/development-url-here

APP_ID=app-id-here
PRIVATE_KEY_PATH=private-key.pem
WEBHOOK_SECRET=secret-here

TEMPLATE_REPOSITORY_NAME=template-repository
TEMPLATE_REPOSITORY_OWNER=template-repository-owner

BRANCHES_TO_PROCESS=master|main
```

## Contributing

If you have suggestions for how `file-distributor` could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[Unlicense](LICENSE) © 2022 pleo-oss
