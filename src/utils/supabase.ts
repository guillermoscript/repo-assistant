// Postgres client for repo-assistant (Neon-friendly HTTP driver).
//
// Filename kept as `supabase.ts` to avoid churn across imports — the export
// name `db` is what callers should use. Works against any Postgres with
// pgvector: Neon (recommended), Supabase, or self-hosted.
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL (Postgres connection string with pgvector — see README)");
}

// `neon()` returns a tagged-template SQL function that issues HTTP requests.
// No pooled TCP, no startup handshake — ideal for short-lived GitHub Actions runs.
export const db = neon(databaseUrl);

export type DocumentRow = {
    id: number;
    content: string | null;
    issue_id: number | null;
    issue_number: number | null;
    repo_id: number | null;
};

export type MatchRow = {
    id: number;
    content: string;
    issue_id: number;
    issue_number: number;
    repo_id: number;
    similarity: number;
};

/** Insert a batch of (content, embedding, repo_id, issue_id, issue_number) rows. */
export async function insertDocuments(
    rows: Array<{
        content: string;
        embedding: number[];
        repo_id: number;
        issue_id: number;
        issue_number: number;
    }>,
): Promise<void> {
    if (rows.length === 0) return;

    // pgvector accepts `[1,2,3]` as a string literal — bind embeddings that way
    // since the HTTP driver doesn't have a vector type adapter.
    for (const r of rows) {
        const embeddingLiteral = `[${r.embedding.join(",")}]`;
        await db`
            insert into public.documents (content, embedding, repo_id, issue_id, issue_number)
            values (${r.content}, ${embeddingLiteral}::vector, ${r.repo_id}, ${r.issue_id}, ${r.issue_number})
        `;
    }
}

/** Look up a single existing document by (repo_id, issue_id, issue_number). */
export async function findDocumentByIssue(
    repoId: number,
    issueId: number,
    issueNumber: number,
): Promise<{ id: number } | null> {
    const rows = (await db`
        select id from public.documents
        where repo_id = ${repoId}
          and issue_id = ${issueId}
          and issue_number = ${issueNumber}
        limit 1
    `) as { id: number }[];
    return rows[0] ?? null;
}

/** Read the stored embedding for an issue (used by auto-close re-judging). */
export async function getStoredEmbedding(
    issueNumber: number,
): Promise<{ repo_id: number; embedding: number[] } | null> {
    const rows = (await db`
        select repo_id, embedding::text as embedding
        from public.documents
        where issue_number = ${issueNumber}
        limit 1
    `) as { repo_id: number; embedding: string }[];
    if (!rows[0]) return null;
    return { repo_id: rows[0].repo_id, embedding: parseVector(rows[0].embedding) };
}

/** Vector similarity search via the match_documents SQL function. */
export async function matchDocuments(args: {
    queryEmbedding: number[];
    filterRepoId: number | null;
    matchCount: number;
    matchThreshold: number | null;
}): Promise<MatchRow[]> {
    const embeddingLiteral = `[${args.queryEmbedding.join(",")}]`;
    const rows = (await db`
        select * from public.match_documents(
            ${embeddingLiteral}::vector,
            ${args.filterRepoId},
            ${args.matchCount},
            ${args.matchThreshold}
        )
    `) as MatchRow[];
    return rows;
}

function parseVector(s: string): number[] {
    // pgvector text format is `[1,2,3]`
    const trimmed = s.replace(/^\[|\]$/g, "");
    if (!trimmed) return [];
    return trimmed.split(",").map(Number);
}
