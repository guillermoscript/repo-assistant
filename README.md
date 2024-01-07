# Repo Assistant AI

Welcome to Repo Assistant AI! 🎉 This GitHub App is built with [Probot](https://github.com/probot/probot) and integrates [OpenAI](https://openai.com/) to help maintainers identify and label duplicate issues automatically. Using the power of OpenAI's embeddings and Supabase's database, this app streamlines your workflow by finding similarities between issues.


## Table of Contents

- [Bot Usage](#bot-usage)
- [Fetures](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Sync Existing Issues](#sync-existing-issues)
- [Examples](#examples)
- [Gallery](#gallery)
- [Contributing](#contributing)
- [License](#license)
- [Setting Up Supabase](#setting-up-supabase)
- [Setting Up OpenAI](#setting-up-openai)


## Bot Usage

Currently, Repo Assistant AI is in its initial stages and operates locally. In the future, it will be ready for server deployment and will work across various repositories. For now, follow the steps below to get started, set up your own instance, and test it on your chosen repositories.


## Features

- [x] Sync existing issues
- [x] Find duplicate issues
- [x] Label duplicate issues
- [x] Work across repositories
- [x] Add labels to opened issues without labels, and a brief description on why it was labeled
- [ ] Add labels to opened issues with labels (Not sure if this is necessary)
- [ ] Add labels to closed issues (Not sure if this is necessary)
- [ ] Deploy to server

Those are the main features that I can think of right now. If you have any other ideas, feel free to open an issue or submit a pull request!


## Getting Started

### Prerequisites

Before you start, make sure you have:

- A GitHub account
- A Supabase account
- An OpenAI account

### Installation

1. Clone the repository to your local machine:
    ```sh
    git clone https://github.com/your-username/repo-assistant-ai.git
    cd repo-assistant-ai
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

3. Build the TypeScript files:
    ```sh
    npm run build
    ```

### Configuration

1. Create a `.env` file in the root directory of your project and fill in your API keys and other environment variables:
    ```env
    # Supabase
    SUPABASE_URL=your-supabase-url
    SUPABASE_ANON_KEY=your-supabase-key

    # OpenAI
    OPENAI_API_KEY=your-openai-api-key

    # GitHub
    GITHUB_TOKEN=your-github-token
    APP_ID=your-app-id
    PRIVATE_KEY=your-pem-value
    ```

2. Set up your Supabase database by following the instructions in the [Setting Up Supabase](#setting-up-supabase) section below.

3. Set up your OpenAI API key by following the instructions in the [Setting Up OpenAI](#setting-up-openai) section below.

4. Run the bot:
    ```sh
    npm start
    ```


## Docker Deployment

To deploy the app using Docker, follow these steps:

1. Build the Docker container:
    ```sh
    docker build -t repo-assistant .
    ```

2. Start the container with the necessary environment variables:
    ```sh
    docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> repo-assistant
    ```


## Sync Existing Issues

To synchronize existing issues, you'll need a GitHub token with repository access:

1. Generate a GitHub token by visiting [github.com/settings/tokens](https://github.com/settings/tokens).

2. Run the sync command with your username and repository:
    ```sh
    npm run sync --user=<username> --repo=<repo>
    ```

Make sure to have the `.env` file set up with Supabase, OpenAI, and GitHub tokens before running the command.

## Examples

Duplicate Issue: [here](https://github.com/guillermoscript/repo-assistant/issues/57)
Original Issue: [here](https://github.com/guillermoscript/repo-assistant/issues/13)
New Unique Issue With labels added: [here](https://github.com/guillermoscript/repo-assistant/issues/53)


## Gallery

![Screen Shot 2024-01-07 at 10 23 53 AM](https://github.com/guillermoscript/repo-assistant/assets/52298929/84ced6ae-dc65-4a74-9685-6db363e893cd)
![Screen Shot 2024-01-07 at 10 59 19 AM](https://github.com/guillermoscript/repo-assistant/assets/52298929/0e10e581-3787-4e9e-93fb-1bc455e5a82e)
![Screen Shot 2024-01-07 at 10 59 50 AM](https://github.com/guillermoscript/repo-assistant/assets/52298929/b0f9050c-9523-4680-ac56-a9dc1406722e)


## Contributing

Got ideas on how to make Repo Assistant AI even better? Want to report a bug? Feel free to open an issue or submit a pull request! Check out our [Contributing Guide](CONTRIBUTING.md) for more information on how to get involved.


## License

Repo Assistant AI is open source software [licensed as ISC](LICENSE) © 2024 guillermoscript.


## Setting Up Supabase

To use Supabase, follow these steps:

1. Create an account at [supabase.io](https://supabase.io/).

2. Once logged in, create a new project.

3. Navigate to the SQL editor in your project's dashboard and run the following SQL commands to set up the necessary tables and functions:

```sql
-- Enable the pgvector extension to work with embedding vectors
create extension vector;


create table
  public.documents (
    id bigserial,
    content text null,
    metadata jsonb null,
    embedding public.vector null,
    created_at timestamp with time zone null default current_timestamp,
    issue_number bigint null,
    issue_id bigint null,
    repo_id bigint null,
    constraint documents_pkey primary key (id)
  ) tablespace pg_default;

create or replace function match_documents (
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb DEFAULT '{}',
  match_threshold double precision DEFAULT NULL::double precision
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float -- This column expects a float value
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity -- Ensure this is a float
  from documents
  where documents.metadata @> filter
  and (match_threshold is null or (1 - (documents.embedding <=> query_embedding)) > match_threshold)
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

4. Don't forget to add your Supabase URL and ANON KEY to the `.env` file as shown in the [Configuration](#configuration) section.


## Setting Up OpenAI

To set up OpenAI:

1. Create an account at [openai.com](https://platform.openai.com/docs/quickstart?context=node).

2. Navigate to the API section and generate a new API key.

3. Add your OpenAI API key to the `.env` file as described in the [Configuration](#configuration) section.

We're excited to have you try out Repo Assistant AI! If you encounter any issues or have questions, don't hesitate to reach out.