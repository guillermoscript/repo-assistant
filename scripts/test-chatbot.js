require("dotenv").config();
const { buildChatBot } = require("../lib/chatBot");

(async () => {
    const { ingestIssueComment } = await buildChatBot();

    const command = process.argv[2] ?? "@repo-assistant-ai dup #154";

    const payload = {
        action: "created",
        repository: {
            id: 736927284,
            name: "repo-assistant",
            owner: { login: "guillermoscript", type: "User", id: 52298929 },
            full_name: "guillermoscript/repo-assistant",
        },
        issue: {
            number: 162,
            pull_request: undefined,
        },
        comment: {
            id: Math.floor(Math.random() * 1e9),
            body: command,
            created_at: new Date().toISOString(),
            html_url: "https://github.com/guillermoscript/repo-assistant/issues/162",
            user: { login: "guillermoscript", type: "User", id: 52298929 },
        },
    };

    const handled = ingestIssueComment(payload);
    console.log("ingested:", handled, "command:", command);

    await new Promise((r) => setTimeout(r, 10000));
    process.exit(0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
