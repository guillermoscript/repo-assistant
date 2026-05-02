import { generateText, Output } from "ai";
import { z } from "zod";
import { chatModel } from "./utils/aiProvider";

export type Candidate = {
    issue_number: number;
    content: string;
    similarity?: number;
};

export const duplicateJudgmentSchema = z.object({
    // 0-100. 0 means definitely not a duplicate of any candidate.
    confidence: z.number().min(0).max(100),
    // Issue number of the candidate this is a duplicate of. null when confidence < 50.
    duplicate_of: z.number().nullable(),
    // 1-2 sentence justification, references "#N" so GitHub auto-links.
    reasoning: z.string(),
});

export type DuplicateJudgment = z.infer<typeof duplicateJudgmentSchema>;

const SYSTEM_PROMPT = `You are judging whether a new GitHub issue is a duplicate of any of the candidate issues retrieved by semantic search.

Rules:
- A duplicate describes the SAME underlying problem, feature, or question — even if worded differently or in a different language. Paraphrases and translations ARE duplicates.
- Issues touching the same area but describing a different problem are NOT duplicates.
- Output a confidence score 0-100:
  - 90-100: confident duplicate (very high overlap, near-identical intent)
  - 50-89: possible duplicate (significant overlap, but maintainer should confirm)
  - <50: not a duplicate
- Set duplicate_of to the candidate's issue number when confidence ≥ 50, otherwise null.
- Reasoning should be 1-2 sentences, reference the candidate as "#N" so GitHub auto-links.`;

export async function judgeDuplicate(
    newIssueText: string,
    candidates: Candidate[],
): Promise<DuplicateJudgment> {
    if (candidates.length === 0) {
        return { confidence: 0, duplicate_of: null, reasoning: "no candidates retrieved" };
    }

    const candidateBlock = candidates
        .map((c) => {
            const sim = typeof c.similarity === "number" ? ` (similarity ${c.similarity.toFixed(3)})` : "";
            return `Issue #${c.issue_number}${sim}:\n${c.content}`;
        })
        .join("\n---\n");

    const userPrompt = `Candidates:
---
${candidateBlock}
---

New issue:
---
${newIssueText}
---

Is the new issue a duplicate of any candidate? If yes, which one and how confident?`;

    const { output } = await generateText({
        model: chatModel,
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        output: Output.object({ schema: duplicateJudgmentSchema }),
    });

    return output;
}
