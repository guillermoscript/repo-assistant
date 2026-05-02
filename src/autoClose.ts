require("dotenv").config();
import { Octokit } from "octokit";
import { autoCloseConfig } from "./config";

type Octo = ReturnType<typeof makeOctokit>;

function makeOctokit() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN required");
    const client = new Octokit({ auth: token });
    return Object.assign(client.rest, { paginate: client.paginate.bind(client) });
}

const NEGATIVE_REACTIONS = new Set(["-1", "confused"]);
const DUPLICATE_LABEL = "duplicate";

type Decision =
    | { action: "close"; reason: string }
    | { action: "skip"; reason: string };

async function decide(
    octokit: Octo,
    owner: string,
    repo: string,
    issueNumber: number,
    now: Date,
): Promise<Decision> {
    const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });

    if (issue.state !== "open") {
        return { action: "skip", reason: `state=${issue.state}` };
    }

    const hasDuplicateLabel = (issue.labels ?? []).some((l: any) =>
        typeof l === "string" ? l === DUPLICATE_LABEL : l.name === DUPLICATE_LABEL,
    );
    if (!hasDuplicateLabel) {
        return { action: "skip", reason: "duplicate label removed" };
    }

    // Walk timeline to find when the bot applied the duplicate label and what happened after.
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
        if (e.event === "labeled" && e.label?.name === DUPLICATE_LABEL && isBotActor(e.actor)) {
            // Latest application wins (label may have been removed and re-added).
            labeledAt = new Date(e.created_at);
        }
        if (e.event === "commented" && e.body?.startsWith("AI response:") && isBotActor(e.actor)) {
            botCommentId = e.id;
        }
    }

    if (!labeledAt) {
        return { action: "skip", reason: "no duplicate label event by bot found" };
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

    return { action: "close", reason: `grace ${autoCloseConfig.graceHours}h elapsed, no overrides` };
}

async function findDuplicateIssues(octokit: Octo, owner: string, repo: string) {
    const q = `repo:${owner}/${repo} is:issue is:open label:${DUPLICATE_LABEL}`;
    return octokit.paginate(octokit.search.issuesAndPullRequests, { q, per_page: 100 });
}

async function processRepo(octokit: Octo, slug: string) {
    const [owner, repo] = slug.split("/");
    if (!owner || !repo) {
        console.error(`Invalid repo slug: ${slug}`);
        return;
    }
    console.log(`\n[${slug}] scanning open issues with label:${DUPLICATE_LABEL}`);

    const issues = await findDuplicateIssues(octokit, owner, repo);
    console.log(`[${slug}] ${issues.length} candidate(s)`);

    const now = new Date();
    for (const item of issues) {
        const decision = await decide(octokit, owner, repo, item.number, now);
        const tag = `[${slug}#${item.number}]`;
        if (decision.action === "skip") {
            console.log(`${tag} skip — ${decision.reason}`);
            continue;
        }
        if (autoCloseConfig.dryRun) {
            console.log(`${tag} DRY RUN — would close (${decision.reason})`);
            continue;
        }
        console.log(`${tag} closing — ${decision.reason}`);
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: item.number,
            body: `Auto-closing as duplicate after the ${autoCloseConfig.graceHours}h grace period elapsed with no human override. Reopen the issue if this was incorrect.`,
        });
        await octokit.issues.update({
            owner,
            repo,
            issue_number: item.number,
            state: "closed",
            state_reason: "not_planned",
        });
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
