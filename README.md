# Repo Assistant AI

A GitHub App built with [Probot](https://github.com/probot/probot) that uses [OpenAI](https://openai.com/) to help you check if any issue is similar or a duplicate of another issue. As I have been working on Open Source project I have found that there are many issues that are similar to each other and I have to manually check if they are duplicate or not. So I decided to build this app to help me with that. With the help of OpenAI's and Supabase's API I was able to build this app. 

Right now this is just a blueprint and the bot works on this repo wwhen I run it locally, in the future I will plan to deploy it to a server and make it work on any repo. but for now you can clone the repo, create you own bot, use your own api keys (OpenAI, Supabase) and host it yourself and select the repos where you want this feature.

More features will be added as I go along. Hope you enjoy it.


## Setup

```sh
# Install dependencies
npm install

# Build the Ts
npm run build

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

## Sync existing issues

If you want to sync existing first you will need to have a github token with repo access and then run this command, you can go to [github.com/settings/tokens](https://github.com/settings/tokens) to create a token.
After that you will need to run this command

```sh
npm run sync --user=<username> --repo=<repo>
```
Always be sure to have the .env file with the supabasem, openai and github token. And to build the ts before running the command.

## Contributing

If you have suggestions for how repo-assistant could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2024 guillermoscript

## Supabase

you will need to create a supabase account for a tutorial on how to do that go to [supabase.io](https://supabase.io/).
after that you will need to add this simple sql on the sql editor

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

thats for storing the embeddings of the documents and for the search function.

also you will need to add your supabase url and key to the .env file

```env
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-key
```

## OpenAI

you will need to create an openai account for a tutorial on how to do that go to [openai.com](https://platform.openai.com/docs/quickstart?context=node).
after that you will need to add your api key to the .env file

```env
OPENAI_API_KEY=your-api-key
```
