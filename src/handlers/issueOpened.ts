import { embed, generateText, Output } from "ai";
import { z } from "zod";
import type { Octokit } from "octokit";
import { createEmbeddingsAndSaveToDatabase } from "../insert";
import { behaviorConfig } from "../config";
import { chatModel, embeddingModel } from "../utils/aiProvider";
import { supabaseClient } from "../utils/supabase";
import { judgeDuplicate } from "../duplicateJudge";

type RestApi = InstanceType<typeof Octokit>["rest"];

type MatchRow = {
    id: number;
    content: string;
    issue_id: number;
    issue_number: number;
    repo_id: number;
    similarity: number;
};

const DUPLICATE_CONFIDENT = 90;
const DUPLICATE_POSSIBLE = 50;

const labelOnlySchema = z.object({
    labels: z.array(z.string()),
    content: z.string(),
});

export type IssueOpenedPayload = {
    repository: { id: number; owner: { login: string }; name: string };
    issue: {
        id: number;
        number: number;
        title: string;
        body: string | null;
        labels?: Array<{ name: string } | string>;
    };
};

export type Logger = {
    info: (msg: any, extra?: any) => void;
    error: (msg: any, extra?: any) => void;
};

async function createComment(
    octokit: RestApi,
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
) {
    await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}

async function addLabels(
    octokit: RestApi,
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[],
    log: Logger,
) {
    try {
        await octokit.issues.addLabels({ owner, repo, issue_number: issueNumber, labels });
        return true;
    } catch (error) {
        log.error({ err: error }, "addLabels failed");
        return false;
    }
}

async function labelByContent(
    octokit: RestApi,
    payload: IssueOpenedPayload,
    title: string,
    body: string | null,
    fullIssueText: string,
    log: Logger,
) {
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const issueNumber = payload.issue.number;

    if (payload.issue.labels && payload.issue.labels.length > 0) {
        await createComment(
            octokit,
            owner,
            repo,
            issueNumber,
            "Thanks for opening this issue! A maintainer will look into this shortly.",
        );
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

    const { output } = await generateText({
        model: chatModel,
        system: systemPrompt,
        prompt: `What labels should this issue have? ${fullIssueText}`,
        output: Output.object({ schema: labelOnlySchema }),
    });

    await createComment(octokit, owner, repo, issueNumber, "AI response: " + output.content);
    await addLabels(octokit, owner, repo, issueNumber, output.labels, log);
}

export async function handleIssueOpened(
    octokit: RestApi,
    payload: IssueOpenedPayload,
    log: Logger,
): Promise<void> {
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const currentIssueTitle = payload.issue.title;
    const currentIssueBody = payload.issue.body;
    const currentIssue = `# ${currentIssueTitle}: \n ${currentIssueBody}`;
    const repoId = payload.repository.id;
    const issueId = payload.issue.id;
    const issueNumber = payload.issue.number;

    const { saved, embedding: storedEmbedding } = await createEmbeddingsAndSaveToDatabase(
        currentIssue,
        repoId,
        issueId,
        issueNumber,
    );
    log.info({ saved }, "isIssueSavedInDatabase");

    let queryEmbedding = storedEmbedding;
    if (!queryEmbedding) {
        const { embedding } = await embed({ model: embeddingModel, value: currentIssue });
        queryEmbedding = embedding;
    }

    const { data, error } = await supabaseClient.rpc("match_documents", {
        query_embedding: queryEmbedding,
        filter_repo_id: repoId,
        match_count: behaviorConfig.candidateCount,
        match_threshold: behaviorConfig.candidateThreshold,
    });

    if (error) {
        log.error({ err: error }, "match_documents rpc failed");
        await createComment(
            octokit,
            owner,
            repo,
            issueNumber,
            "An error occurred while trying to find a match for this issue.",
        );
        return;
    }

    const matches = (data as MatchRow[]).filter((m) => m.issue_id !== issueId);

    if (matches.length > 0) {
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
                octokit,
                owner,
                repo,
                issueNumber,
                `AI response: Confidence ${judgment.confidence}% — duplicate of ${dupRef}. ${judgment.reasoning}`,
            );
            await addLabels(octokit, owner, repo, issueNumber, ["duplicate"], log);
            return;
        }

        if (judgment.confidence >= DUPLICATE_POSSIBLE && dupRef) {
            await createComment(
                octokit,
                owner,
                repo,
                issueNumber,
                `AI response: Confidence ${judgment.confidence}% — possibly duplicate of ${dupRef}, please confirm. ${judgment.reasoning}`,
            );
            await addLabels(
                octokit,
                owner,
                repo,
                issueNumber,
                ["possible-duplicate", "needs triage"],
                log,
            );
            return;
        }
    }

    await labelByContent(octokit, payload, currentIssueTitle, currentIssueBody, currentIssue, log);
}
