require("dotenv").config();
import { Octokit } from "octokit";
import { autoCloseConfig } from "./config";
import { supabaseClient } from "./utils/supabase";
import { judgeDuplicate, type Candidate } from "./duplicateJudge";

type Octo = ReturnType<typeof makeOctokit>;

function makeOctokit() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN required");
    const client = new Octokit({ auth: token });
    return Object.assign(client.rest, { paginate: client.paginate.bind(client) });
}

const NEGATIVE_REACTIONS = new Set(["-1", "confused"]);
const DUPLICATE_LABEL = "duplicate";
const POSSIBLE_DUPLICATE_LABEL = "possible-duplicate";

// Same thresholds as src/index.ts. Kept local to avoid circular import.
const DUPLICATE_CONFIDENT = 90;
const DUPLICATE_POSSIBLE = 50;

type Decision =
    | { action: "close"; reason: string }
    | { action: "promote-and-close"; reason: string; confidence: number; duplicateOf: number; reasoning: string }
    | { action: "clear-possible-label"; reason: string; confidence: number; reasoning: string }
    | { action: "skip"; reason: string };

async function decide(
    octokit: Octo,
    owner: string,
    repo: string,
    issueNumber: number,
    targetLabel: typeof DUPLICATE_LABEL | typeof POSSIBLE_DUPLICATE_LABEL,
    now: Date,
): Promise<Decision> {
    const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });

    if (issue.state !== "open") {
        return { action: "skip", reason: `state=${issue.state}` };
    }

    const hasTargetLabel = (issue.labels ?? []).some((l: any) =>
        typeof l === "string" ? l === targetLabel : l.name === targetLabel,
    );
    if (!hasTargetLabel) {
        return { action: "skip", reason: `${targetLabel} label removed` };
    }

    // Walk timeline to find when the bot applied the target label and what happened after.
    const events = await octokit.paginate(octokit.issues.listEventsForTimeline, {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
    });

    // Treat the actor as the bot when actor.type is "Bot" OR when the override env
    // AUTO_CLOSE_BOT_LOGIN explicitly names a user (useful for testing or for App-token setups
    // where the App user is technically a regular user).
    const explicitBotLogin = process.env.AUTO_CLOSE_BOT_LOGIN ?? null;
    const isBotActor = (actor: any): boolean => {
        if (!actor) return false;
        if (actor.type === "Bot") return true;
        if (explicitBotLogin && actor.login === explicitBotLogin) return true;
        return false;
    };

    let labeledAt: Date | null = null;
    let botCommentId: number | null = null;

    for (const ev of events) {
        const e = ev as any;
        if (e.event === "labeled" && e.label?.name === targetLabel && isBotActor(e.actor)) {
            // Latest application wins (label may have been removed and re-added).
            labeledAt = new Date(e.created_at);
        }
        if (e.event === "commented" && e.body?.startsWith("AI response:") && isBotActor(e.actor)) {
            botCommentId = e.id;
        }
    }

    if (!labeledAt) {
        return { action: "skip", reason: `no ${targetLabel} label event by bot found` };
    }

    const ageHours = (now.getTime() - labeledAt.getTime()) / 3_600_000;
    if (ageHours < autoCloseConfig.graceHours) {
        return {
            action: "skip",
            reason: `grace period not elapsed (${ageHours.toFixed(1)}h < ${autoCloseConfig.graceHours}h)`,
        };
    }

    // Override: any non-bot comment after the label was applied.
    for (const ev of events) {
        const e = ev as any;
        if (e.event !== "commented") continue;
        const commentedAt = new Date(e.created_at);
        if (commentedAt <= labeledAt) continue;
        if (isBotActor(e.actor)) continue;
        const author = e.actor?.login;
        if (author) {
            return { action: "skip", reason: `human comment by @${author} after label` };
        }
    }

    // Override: issue reopened after label.
    for (const ev of events) {
        const e = ev as any;
        if (e.event === "reopened" && new Date(e.created_at) > labeledAt) {
            return { action: "skip", reason: "reopened after label" };
        }
    }

    // Override: 👎 or 😕 reaction on the bot's comment.
    if (botCommentId) {
        const reactions = await octokit.reactions.listForIssueComment({
            owner,
            repo,
            comment_id: botCommentId,
        });
        const negative = reactions.data.find((r: any) => NEGATIVE_REACTIONS.has(r.content));
        if (negative) {
            return { action: "skip", reason: `negative reaction (${negative.content}) on bot comment` };
        }
    }

    if (targetLabel === DUPLICATE_LABEL) {
        return { action: "close", reason: `grace ${autoCloseConfig.graceHours}h elapsed, no overrides` };
    }

    // possible-duplicate: re-judge with the LLM before deciding.
    const issueText = `# ${issue.title}: \n ${issue.body ?? ""}`;
    const candidates = await fetchCandidatesFromSupabase(issue.repository ? (issue as any).repository.id : undefined, issueNumber, issueText);
    if (candidates.length === 0) {
        return { action: "skip", reason: "no candidates available for re-judgment (possibly stale embedding)" };
    }

    const judgment = await judgeDuplicate(issueText, candidates);

    if (judgment.confidence >= DUPLICATE_CONFIDENT && judgment.duplicate_of) {
        return {
            action: "promote-and-close",
            reason: `re-judge confirms duplicate (${judgment.confidence}%)`,
            confidence: judgment.confidence,
            duplicateOf: judgment.duplicate_of,
            reasoning: judgment.reasoning,
        };
    }
    if (judgment.confidence < DUPLICATE_POSSIBLE) {
        return {
            action: "clear-possible-label",
            reason: `re-judge cleared possible-duplicate (${judgment.confidence}%)`,
            confidence: judgment.confidence,
            reasoning: judgment.reasoning,
        };
    }
    return {
        action: "skip",
        reason: `re-judge still uncertain (${judgment.confidence}%) — leaving as possible-duplicate`,
    };
}

async function fetchCandidatesFromSupabase(
    _repoId: number | undefined,
    issueNumber: number,
    _issueText: string,
): Promise<Candidate[]> {
    // Look up the document row for THIS issue, then re-run match_documents with its embedding
    // to get fresh top-K candidates.
    const { data: rows, error } = await supabaseClient
        .from("documents")
        .select("repo_id, embedding")
        .eq("issue_number", issueNumber)
        .limit(1);

    if (error || !rows || rows.length === 0) {
        return [];
    }

    const row = rows[0] as { repo_id: number; embedding: number[] | string };
    // Supabase returns vector columns as JSON string. Parse if needed.
    const embedding = typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding;

    const { data: matches, error: matchErr } = await supabaseClient.rpc("match_documents", {
        query_embedding: embedding,
        filter_repo_id: row.repo_id,
        match_count: 5,
        match_threshold: 0.65,
    });

    if (matchErr || !matches) {
        return [];
    }

    return (matches as any[])
        .filter((m) => m.issue_number !== issueNumber)
        .map((m) => ({
            issue_number: m.issue_number,
            content: m.content,
            similarity: m.similarity,
        }));
}

async function findIssuesWithLabel(octokit: Octo, owner: string, repo: string, label: string) {
    const q = `repo:${owner}/${repo} is:issue is:open label:"${label}"`;
    return octokit.paginate(octokit.search.issuesAndPullRequests, { q, per_page: 100 });
}

async function executeDecision(
    octokit: Octo,
    owner: string,
    repo: string,
    issueNumber: number,
    decision: Decision,
    tag: string,
) {
    if (decision.action === "skip") {
        console.log(`${tag} skip — ${decision.reason}`);
        return;
    }

    const isDryRun = autoCloseConfig.dryRun;

    if (decision.action === "close") {
        if (isDryRun) {
            console.log(`${tag} DRY RUN — would close (${decision.reason})`);
            return;
        }
        console.log(`${tag} closing — ${decision.reason}`);
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `Auto-closing as duplicate after the ${autoCloseConfig.graceHours}h grace period elapsed with no human override. Reopen the issue if this was incorrect.`,
        });
        await octokit.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            state: "closed",
            state_reason: "not_planned",
        });
        return;
    }

    if (decision.action === "promote-and-close") {
        if (isDryRun) {
            console.log(`${tag} DRY RUN — would promote possible-duplicate → duplicate and close (${decision.reason})`);
            return;
        }
        console.log(`${tag} promoting + closing — ${decision.reason}`);
        await octokit.issues.removeLabel({
            owner,
            repo,
            issue_number: issueNumber,
            name: POSSIBLE_DUPLICATE_LABEL,
        });
        await octokit.issues.addLabels({
            owner,
            repo,
            issue_number: issueNumber,
            labels: [DUPLICATE_LABEL],
        });
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `Re-judged with ${decision.confidence}% confidence — duplicate of #${decision.duplicateOf}. ${decision.reasoning}\n\nAuto-closing after the ${autoCloseConfig.graceHours}h grace period with no human override. Reopen if incorrect.`,
        });
        await octokit.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            state: "closed",
            state_reason: "not_planned",
        });
        return;
    }

    if (decision.action === "clear-possible-label") {
        if (isDryRun) {
            console.log(`${tag} DRY RUN — would clear possible-duplicate label (${decision.reason})`);
            return;
        }
        console.log(`${tag} clearing label — ${decision.reason}`);
        await octokit.issues.removeLabel({
            owner,
            repo,
            issue_number: issueNumber,
            name: POSSIBLE_DUPLICATE_LABEL,
        });
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `Re-judged with ${decision.confidence}% confidence — no longer considered a duplicate. Removing the possible-duplicate label. ${decision.reasoning}`,
        });
        return;
    }
}

async function processRepo(octokit: Octo, slug: string) {
    const [owner, repo] = slug.split("/");
    if (!owner || !repo) {
        console.error(`Invalid repo slug: ${slug}`);
        return;
    }

    const now = new Date();

    for (const label of [DUPLICATE_LABEL, POSSIBLE_DUPLICATE_LABEL] as const) {
        console.log(`\n[${slug}] scanning open issues with label:${label}`);
        const issues = await findIssuesWithLabel(octokit, owner, repo, label);
        console.log(`[${slug}] ${issues.length} ${label} candidate(s)`);

        for (const item of issues) {
            const decision = await decide(octokit, owner, repo, item.number, label, now);
            const tag = `[${slug}#${item.number}]`;
            await executeDecision(octokit, owner, repo, item.number, decision, tag);
        }
    }
}

async function main() {
    if (!autoCloseConfig.enabled) {
        console.log("AUTO_CLOSE_ENABLED is not set to true. Exiting.");
        return;
    }
    if (autoCloseConfig.repos.length === 0) {
        console.error("AUTO_CLOSE_REPOS is empty. Set a comma-separated list of owner/repo.");
        process.exit(1);
    }

    const octokit = makeOctokit();
    console.log(
        `Auto-close run: graceHours=${autoCloseConfig.graceHours} dryRun=${autoCloseConfig.dryRun} repos=${autoCloseConfig.repos.join(",")}`,
    );

    for (const slug of autoCloseConfig.repos) {
        try {
            await processRepo(octokit, slug);
        } catch (err) {
            console.error(`[${slug}] error:`, err);
        }
    }
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error("Fatal:", err);
        process.exit(1);
    },
);
