-- Drop the redundant jsonb-filter path. Keep first-class columns + indexes.
-- match_documents now filters on real columns and uses an HNSW index for vector search.

-- HNSW index for cosine similarity on embeddings.
-- Defaults (m=16, ef_construction=64) are fine for sub-1M rows per Supabase docs.
create index if not exists documents_embedding_hnsw
    on public.documents
    using hnsw (embedding vector_cosine_ops);

-- Btree on repo_id for the common filter path (single-repo lookup).
create index if not exists documents_repo_id_idx
    on public.documents (repo_id);

-- Replace match_documents: filter on first-class columns, drop jsonb metadata path.
-- Also enables iterative HNSW scan so filter-then-search keeps recall.
drop function if exists public.match_documents(vector, int, jsonb, double precision);

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
    -- Iterative scan keeps HNSW recall when a WHERE clause filters out candidates.
    -- pgvector >= 0.8.
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

-- Drop the duplicated jsonb metadata column. repo_id/issue_id/issue_number live as real cols.
alter table public.documents drop column if exists metadata;
