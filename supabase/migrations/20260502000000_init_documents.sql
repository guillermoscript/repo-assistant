create extension if not exists vector;

create table if not exists public.documents (
    id bigserial primary key,
    content text null,
    metadata jsonb null,
    embedding public.vector(1536) null,
    created_at timestamp with time zone null default current_timestamp,
    issue_number bigint null,
    issue_id bigint null,
    repo_id bigint null
);

create or replace function public.match_documents (
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb default '{}',
  match_threshold double precision default null
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where documents.metadata @> filter
  and (match_threshold is null or (1 - (documents.embedding <=> query_embedding)) > match_threshold)
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
