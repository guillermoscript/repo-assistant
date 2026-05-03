// Reusable auto-close sweep — same logic as autoClose.ts but as a callable
// function instead of a top-level script. Used by src/action.ts (auto-close mode).
import { Octokit } from "octokit";
import { autoCloseConfig } from "./config";
import { getStoredEmbedding, matchDocuments } from "./utils/supabase";
import { judgeDuplicate, type Candidate } from "./duplicateJudge";

type Octo = ReturnType<typeof makeOctokit>;
type Logger = { info: (msg: any, extra?: any) => void; error: (msg: any, extra?: any) => void };

function makeOctokit() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN required");
    const client = new Octokit({ auth: token });
    return Object.assign(client.rest, { paginate: client.paginate.bind(client) });
}

const NEGATIVE_REACTIONS = new Set(["-1", "confused"]);
const DUPLICATE_LABEL = "duplicate";
const POSSIBLE_DUPLICATE_LABEL = "possible-duplicate";
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
    if (issue.state !== "open") return { action: "skip", reason: `state=${issue.state}` };

    const hasTargetLabel = (issue.labels ?? []).some((l: any) =>
        typeof l === "string" ? l === targetLabel : l.name === targetLabel,
    );
    if (!hasTargetLabel) return { action: "skip", reason: `${targetLabel} label removed` };

    const events = await octokit.paginate(octokit.issues.listEventsForTimeline, {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
    });

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
            labeledAt = new Date(e.created_at);
        }
        if (e.event === "commented" && e.body?.startsWith("AI response:") && isBotActor(e.actor)) {
            botCommentId = e.id;
        }
    }

    if (!labeledAt) return { action: "skip", reason: `no ${targetLabel} label event by bot found` };

    const ageHours = (now.getTime() - labeledAt.getTime()) / 3_600_000;
    if (ageHours < autoCloseConfig.graceHours) {
        return {
            action: "skip",
            reason: `grace period not elapsed (${ageHours.toFixed(1)}h < ${autoCloseConfig.graceHours}h)`,
        };
    }

    for (const ev of events) {
        const e = ev as any;
        if (e.event !== "commented") continue;
        const commentedAt = new Date(e.created_at);
        if (commentedAt <= labeledAt) continue;
        if (isBotActor(e.actor)) continue;
        const author = e.actor?.login;
        if (author) return { action: "skip", reason: `human comment by @${author} after label` };
    }

    for (const ev of events) {
        const e = ev as any;
        if (e.event === "reopened" && new Date(e.created_at) > labeledAt) {
            return { action: "skip", reason: "reopened after label" };
        }
    }

    if (botCommentId) {
        const reactions = await octokit.reactions.listForIssueComment({
            owner,
            repo,
            comment_id: botCommentId,
        });
        const negative = reactions.data.find((r: any) => NEGATIVE_REACTIONS.has(r.content));
        if (negative) return { action: "skip", reason: `negative reaction (${negative.content}) on bot comment` };
    }

    if (targetLabel === DUPLICATE_LABEL) {
        return { action: "close", reason: `grace ${autoCloseConfig.graceHours}h elapsed, no overrides` };
    }

    const issueText = `# ${issue.title}: \n ${issue.body ?? ""}`;
    const candidates = await fetchCandidatesFromSupabase(issueNumber);
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

async function fetchCandidatesFromSupabase(issueNumber: number): Promise<Candidate[]> {
    const stored = await getStoredEmbedding(issueNumber);
    if (!stored) return [];

    const matches = await matchDocuments({
        queryEmbedding: stored.embedding,
        filterRepoId: stored.repo_id,
        matchCount: 5,
        matchThreshold: 0.65,
    });

    return matches
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
    log: Logger,
) {
    if (decision.action === "skip") {
        log.info(`${tag} skip — ${decision.reason}`);
        return;
    }

    const isDryRun = autoCloseConfig.dryRun;

    if (decision.action === "close") {
        if (isDryRun) {
            log.info(`${tag} DRY RUN — would close (${decision.reason})`);
            return;
        }
        log.info(`${tag} closing — ${decision.reason}`);
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
            log.info(`${tag} DRY RUN — would promote possible-duplicate → duplicate and close (${decision.reason})`);
            return;
        }
        log.info(`${tag} promoting + closing — ${decision.reason}`);
        await octokit.issues.removeLabel({ owner, repo, issue_number: issueNumber, name: POSSIBLE_DUPLICATE_LABEL });
        await octokit.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: [DUPLICATE_LABEL] });
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
            log.info(`${tag} DRY RUN — would clear possible-duplicate label (${decision.reason})`);
            return;
        }
        log.info(`${tag} clearing label — ${decision.reason}`);
        await octokit.issues.removeLabel({ owner, repo, issue_number: issueNumber, name: POSSIBLE_DUPLICATE_LABEL });
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `Re-judged with ${decision.confidence}% confidence — no longer considered a duplicate. Removing the possible-duplicate label. ${decision.reasoning}`,
        });
        return;
    }
}

async function processRepo(octokit: Octo, slug: string, log: Logger) {
    const [owner, repo] = slug.split("/");
    if (!owner || !repo) {
        log.error(`Invalid repo slug: ${slug}`);
        return;
    }

    const now = new Date();

    for (const label of [DUPLICATE_LABEL, POSSIBLE_DUPLICATE_LABEL] as const) {
        log.info(`\n[${slug}] scanning open issues with label:${label}`);
        const issues = await findIssuesWithLabel(octokit, owner, repo, label);
        log.info(`[${slug}] ${issues.length} ${label} candidate(s)`);

        for (const item of issues) {
            const decision = await decide(octokit, owner, repo, item.number, label, now);
            const tag = `[${slug}#${item.number}]`;
            await executeDecision(octokit, owner, repo, item.number, decision, tag, log);
        }
    }
}

export async function runAutoCloseSweep(log: Logger): Promise<void> {
    if (!autoCloseConfig.enabled) {
        log.info("AUTO_CLOSE_ENABLED is not set to true. Exiting.");
        return;
    }
    // Default to GITHUB_REPOSITORY (set by GitHub Actions) if AUTO_CLOSE_REPOS is empty.
    const repos =
        autoCloseConfig.repos.length > 0
            ? autoCloseConfig.repos
            : process.env.GITHUB_REPOSITORY
              ? [process.env.GITHUB_REPOSITORY]
              : [];
    if (repos.length === 0) {
        log.error("No repos to scan. Set AUTO_CLOSE_REPOS or run inside a GitHub Action.");
        return;
    }

    const octokit = makeOctokit();
    log.info(
        `Auto-close run: graceHours=${autoCloseConfig.graceHours} dryRun=${autoCloseConfig.dryRun} repos=${repos.join(",")}`,
    );

    for (const slug of repos) {
        try {
            await processRepo(octokit, slug, log);
        } catch (err) {
            log.error(`[${slug}] error: ${(err as Error).message}`);
        }
    }
}
