# file-distributor

A GitHub App for distributing files/templates to configured repositories in an organisation.

## Setup

```sh
# Install dependencies
yarn

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

## Contributing

If you have suggestions for how file-distributor could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2022 pleo-oss
