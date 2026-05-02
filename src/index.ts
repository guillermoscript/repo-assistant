import { Probot } from "probot";
import { buildChatBot } from "./chatBot";
import { handleIssueOpened } from "./handlers/issueOpened";

export = (app: Probot) => {
    // Optional Chat SDK comment surface. Probot already verifies and parses the
    // webhook; we hand off the parsed issue_comment payload to Chat SDK via
    // processMessage(), avoiding a second webhook URL and a second HMAC pass.
    // Chat SDK is ESM-only so initialization is async; we resolve a promise that
    // gates the issue_comment handler.
    const chatBotReady: Promise<((p: any) => boolean) | null> =
        process.env.CHAT_SDK_ENABLED === "true"
            ? buildChatBot()
                  .then((b) => {
                      app.log.info("Chat SDK GitHub adapter active (issue_comment surface)");
                      return b.ingestIssueComment;
                  })
                  .catch((err) => {
                      app.log.error({ err }, "Failed to initialize Chat SDK bot — comment commands disabled");
                      return null;
                  })
            : Promise.resolve(null);

    app.on("issue_comment.created", async (context) => {
        const ingest = await chatBotReady;
        if (ingest) ingest(context.payload);
    });

    app.on("issues.opened", async (context) => {
        await handleIssueOpened(context.octokit.rest as any, context.payload as any, app.log);
    });

    app.on("pull_request.opened", async () => {
        app.log.info("pull request opened");
    });
};
