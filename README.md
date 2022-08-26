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
version: v10.7.0 # The template version to use.
automerge: true  # Whether to merge template changes automatically
files:           # Templates to add to the template
  - source: path/to/template/filename.yaml
    destination: "path/to/template-destination/filename.yaml"
directories:
  - source: "path/to/template/filename.yaml"
    destination: "path/to/template-destination/filename.yaml"
    files:
      - source: path/to/template/filename.yaml
        destination: "path/to/template-destination/filename.yaml"
values:          # Template configuration values
  templateProperty: true
```

The app listens for `push` events to `main` or `master` in repositories which modify the repository configuration. 

The app then pulls the repository configuration, downloads templates and processes templates according to the repository configuration. 

Processed templates are then submitted to the repository as a PR. If `automerge` is enabled, the PR is merged automatically.

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
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> file-distributor
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
```

## Contributing

If you have suggestions for how `file-distributor` could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[Unlicense](LICENSE) © 2022 pleo-oss
