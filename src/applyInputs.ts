// Forward GitHub Actions INPUT_<NAME> env vars to the names the rest of the
// codebase reads. MUST run before modules that snapshot env at import time
// (e.g. config.ts). See action.ts — it requires this module *and* references
// the export below so webpack/ncc can't tree-shake the side effect away.
// GitHub Actions DOES NOT replace hyphens with underscores when forwarding
// `with:` inputs as env vars — `database-url` becomes `INPUT_DATABASE-URL`,
// not `INPUT_DATABASE_URL`. Keep the hyphen casing here to match what the
// runner actually sets.
const map: Record<string, string> = {
    "INPUT_OPENAI-API-KEY": "OPENAI_API_KEY",
    "INPUT_DATABASE-URL": "DATABASE_URL",
    INPUT_MODE: "ACTION_MODE",
    "INPUT_BOT-USERNAME": "BOT_USERNAME",
    "INPUT_CHAT-SDK-ENABLED": "CHAT_SDK_ENABLED",
    "INPUT_AUTO-CLOSE-ENABLED": "AUTO_CLOSE_ENABLED",
    "INPUT_AUTO-CLOSE-GRACE-HOURS": "AUTO_CLOSE_GRACE_HOURS",
    "INPUT_AUTO-CLOSE-DRY-RUN": "AUTO_CLOSE_DRY_RUN",
};

let forwarded = 0;
for (const [src, dst] of Object.entries(map)) {
    const v = process.env[src];
    if (v && !process.env[dst]) {
        process.env[dst] = v;
        forwarded++;
    }
}

export const inputsApplied = forwarded;
