// MUST be first — forwards INPUT_* env vars before config.ts snapshots them.
import "./applyInputs";

import * as fs from "node:fs";
import { Octokit } from "octokit";
import { handleIssueOpened } from "./handlers/issueOpened";

type ActionLogger = {
    info: (msg: any, extra?: any) => void;
    error: (msg: any, extra?: any) => void;
};

const log: ActionLogger = {
    info: (msg, extra) => {
        if (typeof msg === "string") console.log(extra ? `${msg} ${JSON.stringify(extra)}` : msg);
        else console.log(JSON.stringify(msg));
    },
    error: (msg, extra) => {
        if (typeof msg === "string") console.error(extra ? `${msg} ${JSON.stringify(extra)}` : msg);
        else console.error(JSON.stringify(msg));
    },
};

function readEvent(): { name: string; payload: any } {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const eventName = process.env.GITHUB_EVENT_NAME;
    if (!eventPath || !eventName) {
        throw new Error("GITHUB_EVENT_PATH and GITHUB_EVENT_NAME required (run inside a GitHub Action)");
    }
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    return { name: eventName, payload };
}

function makeOctokit(): InstanceType<typeof Octokit>["rest"] {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN required (set via `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`)");
    return new Octokit({ auth: token }).rest;
}

async function runEventDispatch(): Promise<void> {
    const { name, payload } = readEvent();
    log.info(`event=${name} action=${payload.action}`);

    const octokit = makeOctokit();

    if (name === "issues" && payload.action === "opened") {
        await handleIssueOpened(octokit, payload, log);
        return;
    }

    if (name === "issue_comment" && payload.action === "created") {
        // Chat SDK comment commands. Loaded lazily because chatBot is ESM-only.
        const { buildChatBot } = await import("./chatBot");
        try {
            const bot = await buildChatBot();
            const handled = bot.ingestIssueComment(payload);
            if (handled) {
                // processMessage runs async inside the Chat SDK; give it time to post the reply
                // before the action exits. Comment commands are short — 30s ceiling is generous.
                await new Promise((r) => setTimeout(r, 15_000));
            } else {
                log.info("comment ignored (own message or unparseable)");
            }
        } catch (err) {
            log.error({ err: (err as Error).message }, "Chat SDK init failed; skipping comment");
        }
        return;
    }

    log.info(`no handler for event=${name} action=${payload.action} — skipping`);
}

async function runAutoClose(): Promise<void> {
    // Lazy-load to keep cold-start cheap when running event mode.
    const { runAutoCloseSweep } = await import("./autoCloseRunner");
    await runAutoCloseSweep(log);
}

async function main() {
    const mode = process.env.ACTION_MODE ?? "event";
    log.info(`repo-assistant action mode=${mode}`);

    if (mode === "auto-close") {
        await runAutoClose();
        return;
    }

    await runEventDispatch();
}

main().then(
    () => process.exit(0),
    (err) => {
        log.error("Fatal:", err);
        process.exit(1);
    },
);
