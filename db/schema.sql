-- repo-assistant Postgres schema (Neon, Supabase, or any Postgres ≥15 with pgvector ≥0.8)
--
-- One-time bootstrap: paste this into the Neon SQL Editor (or `psql $DATABASE_URL -f db/schema.sql`)
-- after creating a fresh project. Idempotent — safe to re-run.

create extension if not exists vector;

create table if not exists public.documents (
    id bigserial primary key,
    content text null,
    embedding public.vector(1536) null,
    created_at timestamp with time zone null default current_timestamp,
    issue_number bigint null,
    issue_id bigint null,
    repo_id bigint null
);

-- HNSW index for cosine similarity. Defaults (m=16, ef_construction=64) are fine sub-1M rows.
create index if not exists documents_embedding_hnsw
    on public.documents
    using hnsw (embedding vector_cosine_ops);

-- Btree on repo_id for the common single-repo filter path.
create index if not exists documents_repo_id_idx
    on public.documents (repo_id);

-- match_documents: vector search filtered to a single repo, returns top-K above a threshold.
-- Iterative scan preserves HNSW recall when WHERE prunes candidates (pgvector ≥ 0.8).
drop function if exists public.match_documents(vector, bigint, int, double precision);

create or replace function public.match_documents (
    query_embedding vector(1536),
    filter_repo_id  bigint default null,
    match_count     int    default 10,
    match_threshold double precision default null
) returns table (
    id           bigint,
    content      text,
    issue_id     bigint,
    issue_number bigint,
    repo_id      bigint,
    similarity   float
)
language plpgsql
as $$
begin
    set local hnsw.iterative_scan = strict_order;

    return query
    select
        d.id,
        d.content,
        d.issue_id,
        d.issue_number,
        d.repo_id,
        1 - (d.embedding <=> query_embedding) as similarity
    from public.documents d
    where (filter_repo_id is null or d.repo_id = filter_repo_id)
      and (match_threshold is null
           or (1 - (d.embedding <=> query_embedding)) > match_threshold)
    order by d.embedding <=> query_embedding
    limit match_count;
end;
$$;
