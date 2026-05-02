import { Probot } from 'probot';
import { embed, generateText, Output } from "ai";
import { z } from "zod";
import { createEmbeddingsAndSaveToDatabase } from "./insert";
import { behaviorConfig } from "./config";
import { chatModel, embeddingModel } from "./utils/aiProvider";
import { supabaseClient } from "./utils/supabase";

type MatchRow = {
  id: number;
  content: string;
  issue_id: number;
  issue_number: number;
  repo_id: number;
  similarity: number;
};

const outputSchema = z.object({
  labels: z.array(z.string()),
  content: z.string(),
});

async function createComment(context: any, body: string) {
  const issueComment = context.issue({ body });
  await context.octokit.rest.issues.createComment(issueComment);
}

async function addLabels(context: any, labels: string[]) {
  try {
    await context.octokit.rest.issues.addLabels({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: context.payload.issue.number,
      labels: labels
    });
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function generateAndApply(context: any, system: string, prompt: string) {
  const { output } = await generateText({
    model: chatModel,
    system,
    prompt,
    output: Output.object({ schema: outputSchema }),
  });

  await createComment(context, "AI response: " + output.content);
  await addLabels(context, output.labels);
}

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    const currentIssueTitle = context.payload.issue.title
    const currentIssueBody = context.payload.issue.body
    const currentIssue = `# ${currentIssueTitle}: \n ${currentIssueBody}`
    const repoId = context.payload.repository.id
    const issueId = context.payload.issue.id
    const issueNumber = context.payload.issue.number

    const { saved, embedding: storedEmbedding } = await createEmbeddingsAndSaveToDatabase(currentIssue, repoId, issueId, issueNumber)
    console.log(saved, 'isIssueSavedInDatabase')

    // Reuse the embedding produced during insert. Fallback to a fresh embed only if insert failed.
    let queryEmbedding = storedEmbedding;
    if (!queryEmbedding) {
      const { embedding } = await embed({ model: embeddingModel, value: currentIssue });
      queryEmbedding = embedding;
    }

    const { data, error } = await supabaseClient.rpc('match_documents', {
      query_embedding: queryEmbedding,
      filter_repo_id: repoId,
      match_count: behaviorConfig.candidateCount,
      match_threshold: behaviorConfig.candidateThreshold,
    });

    if (error) {
      console.error(error);
      const issueComment = context.issue({
        body: "An error occurred while trying to find a match for this issue."
      });
      context.octokit.rest.issues.createComment(issueComment);
      return;
    }

    const matches = (data as MatchRow[]).filter((m) => m.issue_id !== issueId);

    if (matches.length > 0) {
      // Always let the LLM judge from candidates above the floor. Embedding similarity alone
      // misses paraphrases and cross-lingual duplicates; the LLM handles both reliably.
      const systemPrompt = `You are judging whether a new GitHub issue is a duplicate of any existing issue.

Candidates retrieved by semantic similarity (may include unrelated issues — judge carefully):
---
${matches.map((m) => `Issue #${m.issue_number} (similarity ${m.similarity.toFixed(3)}):\n${m.content}`).join('\n---\n')}
---

New issue (number ${issueNumber}):
---
${currentIssue}
---

Rules:
- A duplicate describes the SAME underlying problem, feature, or question — even if worded differently or in a different language.
- Paraphrases and translations of an existing issue ARE duplicates.
- Issues touching the same area but describing a different problem are NOT duplicates.
- Three confidence levels:
  1. CONFIDENT DUPLICATE → labels: ["duplicate"]. Content: short message that includes the original issue number prefixed with "#" (e.g. "#42") so GitHub auto-links it, plus a one-sentence reason.
  2. POSSIBLE DUPLICATE (looks similar but you're not sure same problem, OR partial overlap) → labels: ["possible-duplicate", "needs triage"]. Content: name the candidate as "#N" and ask the maintainer to confirm.
  3. NOT A DUPLICATE → do NOT include "duplicate" or "possible-duplicate". Label the new issue based on its content (bug, enhancement, feature, question, documentation, performance, security, design, needs triage, invalid, wontfix, good first issue, help wanted, testing). Content: short note on labeling.`
      await generateAndApply(context, systemPrompt, `Is this issue a duplicate of any candidate? ${currentIssue}`);
    } else {
      if (!context.payload.issue.labels || context.payload.issue.labels.length === 0) {
        const systemPrompt = `Given the following sections from a github issues, add proper labels to the issue, depending on the context of the issue, for example: "bug" for bug issues, "enhancement" for enhancement issues, "question" for question issues, "needs triage" for issues that need to be triaged, "invalid" for issues that are invalid, "wontfix" for issues that wont be fixed, "good first issue" for issues that are good for first time contributors, "help wanted" for issues that need help from the community, "documentation" for issues that are related to documentation, "testing" for issues that are related to testing, "feature" for issues that are related to new features, "performance" for issues that are related to performance, "security" for issues that are related to security, "design" for issues that are related to design.

        Context (this section is the issue itself):
        ---
        Issue Title: ${currentIssueTitle}
        ---
        Issue Body: ${currentIssueBody}
        ---
        For the content field, write a really short message about how you labeled the issue.
        `

        await generateAndApply(context, systemPrompt, `What labels should this issue have? ${currentIssue}`);
      } else {
        await createComment(context, "Thanks for opening this issue! A maintainer will look into this shortly.");
      }
    }
  });

  app.on(
    "pull_request.opened",
    async () => {
      console.log('pull request opened')
    });

};
