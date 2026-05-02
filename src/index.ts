import { Probot } from 'probot';
import { embed, generateText, Output } from "ai";
import { z } from "zod";
import { createEmbeddingsAndSaveToDatabase } from "./insert";
import { behaviorConfig } from "./config";
import { chatModel, embeddingModel } from "./utils/aiProvider";
import { supabaseClient } from "./utils/supabase";
import { judgeDuplicate } from "./duplicateJudge";

type MatchRow = {
  id: number;
  content: string;
  issue_id: number;
  issue_number: number;
  repo_id: number;
  similarity: number;
};

// Confidence thresholds for the duplicate judge. Tuned to match simili-bot's
// 4-tier scale (90+ confident, 75-90 probable, 50-75 possible, <50 not).
const DUPLICATE_CONFIDENT = 90;
const DUPLICATE_POSSIBLE = 50;

const labelOnlySchema = z.object({
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

async function labelByContent(
  context: any,
  title: string,
  body: string | null,
  fullIssueText: string,
) {
  if (context.payload.issue.labels && context.payload.issue.labels.length > 0) {
    await createComment(context, "Thanks for opening this issue! A maintainer will look into this shortly.");
    return;
  }

  const systemPrompt = `Given the following sections from a github issues, add proper labels to the issue, depending on the context of the issue, for example: "bug" for bug issues, "enhancement" for enhancement issues, "question" for question issues, "needs triage" for issues that need to be triaged, "invalid" for issues that are invalid, "wontfix" for issues that wont be fixed, "good first issue" for issues that are good for first time contributors, "help wanted" for issues that need help from the community, "documentation" for issues that are related to documentation, "testing" for issues that are related to testing, "feature" for issues that are related to new features, "performance" for issues that are related to performance, "security" for issues that are related to security, "design" for issues that are related to design.

  Context (this section is the issue itself):
  ---
  Issue Title: ${title}
  ---
  Issue Body: ${body}
  ---
  For the content field, write a really short message about how you labeled the issue.
  `;

  await generateLabelsAndApply(context, systemPrompt, `What labels should this issue have? ${fullIssueText}`);
}

async function generateLabelsAndApply(context: any, system: string, prompt: string) {
  const { output } = await generateText({
    model: chatModel,
    system,
    prompt,
    output: Output.object({ schema: labelOnlySchema }),
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
      // LLM judges duplication and emits a confidence score. Embedding similarity is
      // recall-only; the LLM is the precision gate (handles paraphrase + cross-lingual).
      const judgment = await judgeDuplicate(
        currentIssue,
        matches.map((m) => ({
          issue_number: m.issue_number,
          content: m.content,
          similarity: m.similarity,
        })),
      );

      const dupRef = judgment.duplicate_of ? `#${judgment.duplicate_of}` : null;

      if (judgment.confidence >= DUPLICATE_CONFIDENT && dupRef) {
        await createComment(
          context,
          `AI response: Confidence ${judgment.confidence}% — duplicate of ${dupRef}. ${judgment.reasoning}`,
        );
        await addLabels(context, ["duplicate"]);
      } else if (judgment.confidence >= DUPLICATE_POSSIBLE && dupRef) {
        await createComment(
          context,
          `AI response: Confidence ${judgment.confidence}% — possibly duplicate of ${dupRef}, please confirm. ${judgment.reasoning}`,
        );
        await addLabels(context, ["possible-duplicate", "needs triage"]);
      } else {
        // Confidence too low to call it a duplicate. Fall through to label-by-content.
        await labelByContent(context, currentIssueTitle, currentIssueBody, currentIssue);
      }
    } else {
      await labelByContent(context, currentIssueTitle, currentIssueBody, currentIssue);
    }
  });

  app.on(
    "pull_request.opened",
    async () => {
      console.log('pull request opened')
    });

};
