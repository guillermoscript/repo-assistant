// Chat SDK packages ("chat", "@chat-adapter/github", "@chat-adapter/state-pg")
// are ESM-only. The rest of this project compiles to CJS for Probot, so we
// can't `import { Chat } from "chat"` at the top level — TS would emit a
// require() that Node rejects with ERR_PACKAGE_PATH_NOT_EXPORTED.
//
// Workaround: types-only imports for compile-time, runtime via dynamicImport.
// new Function() prevents TS from rewriting the import() to a require().
import type { Chat as ChatType, Adapter as AdapterType } from "chat";
import type { GitHubRawMessage, GitHubAdapter } from "@chat-adapter/github";
import { generateText } from "ai";
import { Octokit } from "octokit";
import { chatModel } from "./utils/aiProvider";

const dynamicImport = new Function("specifier", "return import(specifier)") as <T = any>(
    specifier: string,
) => Promise<T>;

const CMD_DUP = /^\s*(?:dup|duplicate)\s+(?:of\s+)?#(\d+)\s*$/i;
const CMD_NOTDUP = /^\s*(?:notdup|not\s+duplicate|not-duplicate)\s*$/i;
const CMD_QUALITY = /^\s*quality\s*$/i;
const CMD_RELABEL = /^\s*relabel\s+(.+)$/i;

type GitHubBotEnv = {
    botUserName: string;
    githubToken: string;
};

type RestApi = InstanceType<typeof Octokit>["rest"];

function readEnv(): GitHubBotEnv {
    const botUserName = process.env.BOT_USERNAME;
    const githubToken = process.env.GITHUB_TOKEN;
    if (!botUserName) throw new Error("BOT_USERNAME env var required for Chat SDK bot");
    if (!githubToken) throw new Error("GITHUB_TOKEN env var required for Chat SDK bot to call REST APIs");
    return { botUserName, githubToken };
}

let toAiMessagesFn: any = null;

async function loadDeps() {
    const [chatPkg, ghPkg, pgPkg] = await Promise.all([
        dynamicImport("chat"),
        dynamicImport("@chat-adapter/github"),
        dynamicImport("@chat-adapter/state-pg"),
    ]);
    toAiMessagesFn = chatPkg.toAiMessages;
    return {
        Chat: chatPkg.Chat as typeof ChatType,
        createGitHubAdapter: ghPkg.createGitHubAdapter as (config?: any) => GitHubAdapter,
        createPostgresState: pgPkg.createPostgresState as (config?: any) => any,
    };
}

export type ChatBotHandle = {
    env: GitHubBotEnv;
    ingestIssueComment: (payload: any) => boolean;
};

export async function buildChatBot(): Promise<ChatBotHandle> {
    const env = readEnv();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL env var required (Postgres for Chat SDK state)");

    const { Chat, createGitHubAdapter, createPostgresState } = await loadDeps();

    const octokit = new Octokit({ auth: env.githubToken }).rest;

    const adapter = createGitHubAdapter({
        token: env.githubToken,
        userName: env.botUserName,
        // Adapter requires webhookSecret even though we never call its webhook handler
        // (we ingest pre-verified payloads via processMessage). Reuse Probot's secret.
        webhookSecret: process.env.WEBHOOK_SECRET ?? "unused",
    });

    const state = createPostgresState({
        url: databaseUrl,
        keyPrefix: "repo_assistant_chat_sdk",
    });
    await state.connect();

    const bot = new Chat({
        userName: env.botUserName,
        adapters: { github: adapter },
        state,
    } as any);

    bot.onNewMention(async (thread: any, message: any) => {
        await thread.subscribe();
        await routeMessage(thread, message, octokit);
    });

    bot.onSubscribedMessage(async (thread: any, message: any) => {
        await routeMessage(thread, message, octokit);
    });

    function makeRaw(payload: any): GitHubRawMessage | null {
        if (!payload?.comment || !payload?.repository || !payload?.issue) return null;
        return {
            type: "issue_comment",
            comment: payload.comment,
            repository: payload.repository,
            prNumber: payload.issue.number,
            threadType: payload.issue.pull_request ? "pr" : "issue",
        };
    }

    function ingestIssueComment(payload: any): boolean {
        const raw = makeRaw(payload);
        if (!raw) return false;
        // Filter own comments to prevent self-loops. The Chat SDK adapter authenticates
        // with GITHUB_TOKEN (a PAT in dev), so posts appear under the PAT user — not the
        // GitHub App's bot login. Filter on:
        //   1. our marker prefix "AI response:" (covers PAT-posted bot messages)
        //   2. bot login (covers GitHub App auth)
        //   3. App's bot login form "<name>[bot]"
        if (payload.comment.body?.startsWith("AI response:")) return false;
        const author = payload.comment.user?.login;
        if (author === env.botUserName || author === `${env.botUserName}[bot]`) return false;

        const threadType = raw.type === "issue_comment" ? raw.threadType ?? "pr" : "pr";
        const threadId = adapter.encodeThreadId({
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            prNumber: payload.issue.number,
            type: threadType,
        });
        const message = adapter.parseMessage(raw);
        (bot as any).processMessage(adapter as unknown as AdapterType, threadId, message);
        return true;
    }

    return { env, ingestIssueComment };
}

async function routeMessage(thread: any, message: any, octokit: RestApi) {
    const raw = message.raw as GitHubRawMessage;
    if (raw.type !== "issue_comment") {
        await thread.post("I only handle commands on the issue conversation, not on review comments.");
        return;
    }
    const owner = raw.repository.owner.login;
    const repo = raw.repository.name;
    const issueNumber = raw.prNumber;

    const text = stripMention(message.text).trim();

    const dupMatch = text.match(CMD_DUP);
    if (dupMatch) {
        await handleDupCommand(thread, octokit, owner, repo, issueNumber, Number(dupMatch[1]));
        return;
    }
    if (CMD_NOTDUP.test(text)) {
        await handleNotDupCommand(thread, octokit, owner, repo, issueNumber);
        return;
    }
    if (CMD_QUALITY.test(text)) {
        await handleQualityCommand(thread, octokit, owner, repo, issueNumber);
        return;
    }
    const relabelMatch = text.match(CMD_RELABEL);
    if (relabelMatch) {
        await handleRelabelCommand(thread, octokit, owner, repo, issueNumber, relabelMatch[1]);
        return;
    }

    await handleFreeForm(thread, octokit, issueNumber, text);
}

function stripMention(text: string): string {
    return text.replace(/@[\w-]+(\[bot\])?\s*/g, "").trim();
}

async function handleDupCommand(
    thread: any,
    octokit: any,
    owner: string,
    repo: string,
    issueNumber: number,
    targetIssueNumber: number,
) {
    try {
        await octokit.issues.removeLabel({ owner, repo, issue_number: issueNumber, name: "possible-duplicate" }).catch(() => {});
        await octokit.issues.removeLabel({ owner, repo, issue_number: issueNumber, name: "needs triage" }).catch(() => {});
        await octokit.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: ["duplicate"] });
        await thread.post(`AI response: Confirmed duplicate of #${targetIssueNumber}. Applied \`duplicate\` label.`);
    } catch (err) {
        await thread.post(`AI response: Could not apply duplicate label: ${(err as Error).message}`);
    }
}

async function handleNotDupCommand(thread: any, octokit: any, owner: string, repo: string, issueNumber: number) {
    let removed = 0;
    for (const name of ["duplicate", "possible-duplicate"]) {
        try {
            await octokit.issues.removeLabel({ owner, repo, issue_number: issueNumber, name });
            removed++;
        } catch {
            // not present
        }
    }
    if (removed > 0) {
        await thread.post(`AI response: Got it — removed ${removed} duplicate label(s). Marking as needs triage.`);
        await octokit.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: ["needs triage"] }).catch(() => {});
    } else {
        await thread.post("AI response: No duplicate labels were set on this issue. Nothing to remove.");
    }
}

async function handleQualityCommand(thread: any, octokit: any, owner: string, repo: string, issueNumber: number) {
    const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });
    const issueText = `Title: ${issue.title}\n\nBody:\n${issue.body ?? "(empty)"}`;

    const { text } = await generateText({
        model: chatModel,
        system: `You are scoring the quality of a GitHub issue for a maintainer's triage queue.
Score 0-100 across these five dimensions, then give a total. Be terse.

1. Length & detail (does it have enough words to be actionable?)
2. Structure (sections, headings, formatting)
3. Repro steps (numbered or clear sequence)
4. Examples (code blocks, error output, screenshots referenced)
5. Context (versions, environment, OS, browser)

Output format:
\`\`\`
Quality: NN/100
- Length & detail: N/20 — <one-line note>
- Structure: N/20 — <one-line note>
- Repro steps: N/20 — <one-line note>
- Examples: N/20 — <one-line note>
- Context: N/20 — <one-line note>

Suggestions: <one short sentence on what's missing or weak>
\`\`\``,
        prompt: issueText,
    });

    await thread.post(`AI response: Quality assessment for #${issueNumber}\n\n${text}`);
}

async function handleRelabelCommand(
    thread: any,
    octokit: any,
    owner: string,
    repo: string,
    issueNumber: number,
    rawList: string,
) {
    const labels = rawList.split(",").map((l) => l.trim()).filter(Boolean);
    if (labels.length === 0) {
        await thread.post("AI response: `relabel` needs a comma-separated list of labels.");
        return;
    }
    await octokit.issues.setLabels({ owner, repo, issue_number: issueNumber, labels });
    await thread.post(`AI response: Replaced labels with: ${labels.map((l) => `\`${l}\``).join(", ")}`);
}

async function handleFreeForm(thread: any, _octokit: any, issueNumber: number, text: string) {
    const historyMessages: any[] = [];
    let count = 0;
    for await (const msg of thread.allMessages) {
        historyMessages.push(msg);
        if (++count >= 20) break;
    }
    const aiHistory = toAiMessagesFn ? await toAiMessagesFn(historyMessages.slice(-10)) : [];

    const system = `You are a helpful repo-triage assistant chatting with a maintainer in the comment thread of a GitHub issue. Keep replies short and useful — 1-3 sentences.
Available commands the user can run instead of free-form: \`dup #N\`, \`notdup\`, \`quality\`, \`relabel a,b,c\`.
Current issue number: #${issueNumber}.`;

    const { text: reply } = await generateText({
        model: chatModel,
        system,
        messages: [...aiHistory, { role: "user", content: text }],
    });

    await thread.post(`AI response: ${reply}`);
}
