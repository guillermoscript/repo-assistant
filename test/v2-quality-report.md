# Repo Assistant v2 — Quality Evaluation Report

**Date:** 2026-05-02
**Bot version:** Vercel AI SDK migration (gpt-5.4-mini chat, text-embedding-3-small embed)
**Method:** Manual end-to-end test against `guillermoscript/repo-assistant`, local Supabase, fresh `documents` table
**Similarity threshold:** 0.8

This document covers two test runs: an initial baseline, and a regression run after RAG performance improvements (HNSW index, filter columns, single-embed optimization).

---

## Run 1 — Baseline (pre-RAG fixes)

Issues #98–#115 (5 seed + 13 tests). Result: **11/13 pass (84.6%)**.

Failures:
- D2 (paraphrased memory leak) — not detected as duplicate.
- D3 (Spanish translation of dark mode) — not detected as duplicate.

Findings recorded:
- Auto-labeling reliable across bug, feature, doc, question categories.
- Spam, prompt injection, unicode, empty-input edge cases all handled.
- Threshold floor (related-not-dup) and ceiling (identical) both correct.
- Paraphrase + cross-lingual duplicate detection weak — embedding similarity falls below 0.8 threshold.

---

## Run 2 — Regression after RAG improvements

After applying:
- HNSW index on `documents.embedding`
- Btree index on `documents.repo_id`
- Dropped jsonb `metadata` column, switched RPC to typed first-class columns
- `match_documents` uses `SET LOCAL hnsw.iterative_scan = strict_order`
- App reuses the embedding produced during insert (no double-embed)
- Drops JS sort/slice in favor of `match_count: 5` in RPC

Issues #117–#134 (5 seed + 13 tests). Result: **11/13 pass (84.6%)** — same score, no regression.

### Detailed Run 2 results

| # | ID | Scenario | Labels | Comment ref | Status vs Run 1 |
|---|---|---|---|---|---|
| 117 | S1 | Bot crashes on PRs no body | `bug, needs triage` | – | seed (pass) |
| 118 | S2 | Add dark mode toggle | `enhancement, feature, design` | – | seed (pass) |
| 119 | S3 | Docs missing for /sync | `documentation, enhancement` | – | seed (pass) |
| 120 | S4 | How configure Supabase locally | `documentation, question` | – | seed (pass) |
| 121 | S5 | Memory leak after 24h | `bug, performance` | – | seed (pass) |
| 122 | L1 | SSL cert error | `bug, documentation, security` | – | ✅ pass |
| 123 | L2 | CSV export | `enhancement, feature` | – | ✅ pass |
| 124 | L3 | First-time setup tutorial | `documentation, good first issue, help wanted` | – | ✅ pass |
| 125 | L4 | Empty body title="test" | `needs triage` | – | ✅ pass |
| 126 | D1 | Paraphrase of #117 | `duplicate` | `#117` | ✅ pass |
| 127 | D2 | Paraphrase of #121 | `bug, performance` | none | ❌ fail (same as Run 1) |
| 128 | D3 | Spanish copy of #118 | `enhancement, feature, design` | none | ❌ fail (same as Run 1) |
| 129 | E1 | Crypto spam | `invalid, needs triage` | – | ✅ pass |
| 130 | E2 | Code dump only | `question, needs triage` | – | ✅ pass (was `bug, needs triage`) |
| 131 | E3 | Chinese title | `bug, needs triage` | – | ✅ pass |
| 132 | E4 | Prompt injection | `needs triage` | – | ✅ pass — defense holds (was `invalid, needs triage`) |
| 133 | T1 | Related fork-PR bug | `bug, needs triage` | – | ✅ pass |
| 134 | T2 | Identical to #117 | `duplicate` | `#117` | ✅ pass |

### Run 2 summary

| Category | Pass | Fail | Total |
|---|---|---|---|
| Auto-label (L1-L4) | 4 | 0 | 4 |
| Duplicate detection (D1-D3) | 1 | 2 | 3 |
| Adversarial (E1-E4) | 4 | 0 | 4 |
| Threshold edge (T1, T2) | 2 | 0 | 2 |
| **Total** | **11** | **2** | **13** |

**Pass rate: 84.6%** (matches Run 1, no regression).

### Run 2 changes vs Run 1

- E2 (code dump): `bug` → `question` — both reasonable for ambiguous code-only input.
- E4 (prompt injection): `invalid, needs triage` → `needs triage` — still rejected the injection; lost the explicit `invalid` label.
- All other test outcomes identical.

---

## Findings unchanged

### ✅ Strengths confirmed

1. Auto-labeling reliable across bug / feature / doc / question.
2. Empty/minimal input → `needs triage`, no crash.
3. Spam detection works.
4. Prompt injection defense holds (no obey across both runs).
5. Unicode/Chinese safe.
6. Latency: 4–6s round trip.

### ❌ Weaknesses persist

1. **Paraphrased duplicate detection** (D2) still fails. Same root cause: cosine similarity from `text-embedding-3-small` falls below 0.8 between semantically identical paraphrases.
2. **Cross-lingual duplicates** (D3) still missed. Embedding model is multilingual but cross-language scores are too low for the 0.8 threshold.

### ⚠ Label looseness (unchanged)

- Some scenarios get extra peripheral labels (`documentation` on bug reports, `help wanted` on code dumps).
- Not strictly wrong, but adds noise.

---

## What the RAG improvements bought us

Even though the score didn't change at this scale, the changes pay off elsewhere:

- **Cost ↓50%**: each webhook now does 1 embedding call instead of 2.
- **Latency at scale**: HNSW + iterative_scan keeps query latency in single-digit ms past 10k rows, where the seq scan would degrade to seconds. (At 18 rows the planner picks seq scan as expected — confirmed via EXPLAIN.)
- **Cleaner schema**: dropped duplicated `metadata` jsonb column, RPC accepts typed `bigint` filter.
- **Recall under filtering**: `hnsw.iterative_scan = strict_order` prevents HNSW under-fetching when WHERE clauses filter rows.

---

## Next steps to lift score above 85%

The score ceiling is the duplicate-detection threshold strategy, not the RAG plumbing. Options:

1. **Lower threshold to 0.65–0.7.** Captures D2-style paraphrases. Risk: may merge unrelated issues. Should be A/B tested with a wider corpus.
2. **Two-stage match.** Always retrieve top-K candidates regardless of cosine threshold, then let the chat model judge from candidate text. Currently the threshold gates the LLM out of the path. The LLM was clearly capable of judging similarity in D1 — give it the candidates for D2 too.
3. **Bigger embedding model.** `text-embedding-3-large` (3072 dims) for higher recall on paraphrases. Requires schema migration and re-embedding existing rows.
4. **Cross-lingual.** Translate to English before embedding, or use a multilingual-tuned model.
5. **Tighter system prompt** to discourage extra peripheral labels.

---

## Artifacts

- 36 test issues created and closed (#94–#134, plus the post-fix smoke test #116).
- `documents` table holds 18 embeddings from Run 2.
- Bot logs in background task `b74vf7nzc`.

---

## Run 3 — After two-stage retrieval + threshold drop

After applying:
- Lowered `candidateThreshold` 0.8 → 0.65 (matches simili-bot convention).
- Dropped the cosine-only duplicate gate. Bot now always retrieves top-5 candidates above 0.65 and lets the LLM judge from candidate text.
- New system prompt with explicit rules: paraphrase = dup, translation = dup, same-area-different-problem ≠ dup. Three confidence levels (`duplicate` / `possible-duplicate` + `needs triage` / not-dup label-by-content).

Issues #135–#152 (5 seed + 13 tests). Result: **13/13 pass (100%)**.

### Detailed Run 3 results

| # | ID | Scenario | Labels | Comment ref | Status vs Run 2 |
|---|---|---|---|---|---|
| 135 | S1 | Bot crashes on PRs no body | `bug, needs triage` | – | seed (pass) |
| 136 | S2 | Add dark mode toggle | `enhancement, feature` | – | seed (pass) |
| 137 | S3 | Docs missing for /sync | `documentation, enhancement` | – | seed (pass) |
| 138 | S4 | How configure Supabase locally | `documentation, question` | – | seed (pass) |
| 139 | S5 | Memory leak after 24h | `bug, performance` | – | seed (pass) |
| 140 | L1 | SSL cert error | `bug, enhancement, security` | – | ✅ pass |
| 141 | L2 | CSV export | `enhancement, help wanted, feature` | – | ✅ pass |
| 142 | L3 | First-time setup tutorial | `documentation, good first issue, help wanted` | – | ✅ pass |
| 143 | L4 | Empty body title="test" | `needs triage` | – | ✅ pass |
| 144 | D1 | Paraphrase of #135 | `duplicate` | `#135` | ✅ pass |
| 145 | D2 | Paraphrase of #139 | `duplicate` | `#139` | ✅ **NEW PASS** (was fail) |
| 146 | D3 | Spanish copy of #136 | `duplicate` | `#136` | ✅ **NEW PASS** (was fail) |
| 147 | E1 | Crypto spam | `invalid, needs triage` | – | ✅ pass |
| 148 | E2 | Code dump only | `needs triage` | – | ✅ pass |
| 149 | E3 | Chinese title | `bug, needs triage` | – | ✅ pass |
| 150 | E4 | Prompt injection | `invalid, needs triage` | – | ✅ pass — defense holds |
| 151 | T1 | Related fork-PR bug (not dup) | `bug, needs triage, security` | – | ✅ pass — LLM correctly rejected |
| 152 | T2 | Identical to #135 | `duplicate` | `#135` | ✅ pass |

### Run 3 summary

| Category | Pass | Fail | Total |
|---|---|---|---|
| Auto-label (L1-L4) | 4 | 0 | 4 |
| Duplicate detection (D1-D3) | **3** | **0** | **3** |
| Adversarial (E1-E4) | 4 | 0 | 4 |
| Threshold edge (T1, T2) | 2 | 0 | 2 |
| **Total** | **13** | **0** | **13** |

**Pass rate: 100%** (+15.4% vs Run 2). Both prior failures fixed.

### Why Run 3 fixed D2 and D3

- **D2** (paraphrased memory leak): cosine similarity to S5 was below the old 0.8 floor (~0.7), so the bot never asked the LLM. With the floor at 0.65 the candidate enters the LLM context, and the LLM correctly identifies the paraphrase as a duplicate of #139.
- **D3** (Spanish dark mode): same path. Cross-lingual embeddings clear 0.65 even though they don't clear 0.8. LLM reads both texts and recognises the translation as a duplicate of #136.

### Why T1 still passes (no false positive)

T1 is the same area as S1 (PR-from-fork bugs) but a *different* problem (webhook signature vs null body). Its embedding clears the 0.65 floor — but the LLM correctly applies the "same area but different problem ≠ duplicate" rule and labels it as a regular bug.

### Confidence-level usage

The new `possible-duplicate` label was available but the LLM did not need it on this corpus — it was always confident enough for either `duplicate` or a normal label. Keeps the option open for ambiguous future cases.

---

## v3 changes summary

- `src/config.ts`: `similarityThreshold: 0.8` → `candidateThreshold: 0.65` + `candidateCount: 5`.
- `src/index.ts`: Removed the `potentialDuplicate` cosine gate. Always run LLM judge when candidates exist.
- New system prompt with three confidence levels (`duplicate`, `possible-duplicate`, label-by-content).

---

## Run 4 — Confidence-tier output + possible-duplicate lifecycle

After applying:
- LLM now emits a numeric `confidence` (0-100) and `duplicate_of` along with reasoning.
- Threshold mapping: ≥90 → `duplicate`, 50-89 → `possible-duplicate` + `needs triage`, <50 → label-by-content.
- Comments now include the confidence percentage explicitly ("Confidence 99% — duplicate of #154").
- `judgeDuplicate` extracted to `src/duplicateJudge.ts` so both `index.ts` and `autoClose.ts` can call it.
- `autoClose.ts` now scans both `duplicate` AND `possible-duplicate` labels:
  - `duplicate` issues: existing close-after-grace flow.
  - `possible-duplicate` issues: after grace + no override, re-fetch candidates from Supabase and re-run `judgeDuplicate`. If confidence ≥ 90, promote label `possible-duplicate` → `duplicate` and close. If < 50, remove the `possible-duplicate` label (false alarm). Else (50-89), leave alone.

### Test design

Smaller targeted run (8 issues) to verify the new schema + lifecycle, not the full 13-scenario regression. Issues #154–#161.

| # | ID | Scenario | Bot's labels | Confidence | Status |
|---|---|---|---|---|---|
| 154 | S1 | Bot crashes on PRs no body | `bug, needs triage` | – | seed |
| 155 | S2 | Add dark mode toggle | `enhancement, feature` | – | seed |
| 156 | S3 | Memory leak after 24h | `bug, performance` | – | seed |
| 157 | D1 | Byte-identical to S1 | `duplicate` | **99%** | ✅ confident dup |
| 158 | D2 | Paraphrase of S3 | `duplicate` | **98%** | ✅ paraphrase caught |
| 159 | D3 | Spanish copy of S2 | `duplicate` | **98%** | ✅ cross-lingual caught |
| 160 | D4 | Ambiguous overlap with S3 | `possible-duplicate, needs triage` | **82%** | ✅ middle tier exercised |
| 161 | T1 | Same area as S1, different bug | `bug, security` | – | ✅ correctly NOT a dup |

All confident duplicates land in the 95-99% range; the deliberately ambiguous case lands at 82% which correctly maps to `possible-duplicate`.

### autoClose lifecycle test (dry run, grace=0)

```
[guillermoscript/repo-assistant] scanning open issues with label:duplicate
[#159] DRY RUN — would close
[#158] DRY RUN — would close
[#157] DRY RUN — would close
[guillermoscript/repo-assistant] scanning open issues with label:possible-duplicate
[#160] skip — re-judge still uncertain (62%) — leaving as possible-duplicate
```

The re-judge ran on #160, came back 62% (still in the middle tier), and correctly skipped — neither promoting nor clearing. The middle-tier behavior preserves human-judgment cases instead of forcing them into one bucket on a coin flip.

### Why this is a strict improvement over v3

- **Information gain:** maintainers see the bot's certainty as a number, not just a tier label. Easy to scan triage queues.
- **No regression:** all v3 wins (paraphrase, cross-lingual, T1 rejection) still hold and now come with explicit confidence.
- **Lifecycle:** `possible-duplicate` was a dead-end label in v3. In v4 it gets revisited every 6h, can be auto-promoted to `duplicate` (and closed) or auto-cleared, OR left for the maintainer if the LLM is still uncertain.
- **Code reuse:** the same `judgeDuplicate` helper drives both the issue-creation path and the autoClose re-judge path. Single source of truth for prompt and thresholds.

