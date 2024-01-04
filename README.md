# repo-assistant

> A GitHub App built with [Probot](https://github.com/probot/probot) that an ai assistant for your repo

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Docker

```sh
# 1. Build container
docker build -t repo-assistant .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> repo-assistant
```

## Contributing

If you have suggestions for how repo-assistant could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2024 guillermoscript
