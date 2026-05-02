// Forward GitHub Actions INPUT_<NAME> env vars to the names the rest of the
// codebase reads. MUST be the first import in src/action.ts so it runs before
// modules that snapshot env at import time (e.g. config.ts).
const map: Record<string, string> = {
    INPUT_OPENAI_API_KEY: "OPENAI_API_KEY",
    INPUT_SUPABASE_URL: "SUPABASE_URL",
    INPUT_SUPABASE_KEY: "SUPABASE_ANON_KEY",
    INPUT_MODE: "ACTION_MODE",
    INPUT_BOT_USERNAME: "BOT_USERNAME",
    INPUT_CHAT_SDK_ENABLED: "CHAT_SDK_ENABLED",
    INPUT_AUTO_CLOSE_ENABLED: "AUTO_CLOSE_ENABLED",
    INPUT_AUTO_CLOSE_GRACE_HOURS: "AUTO_CLOSE_GRACE_HOURS",
    INPUT_AUTO_CLOSE_DRY_RUN: "AUTO_CLOSE_DRY_RUN",
};

for (const [src, dst] of Object.entries(map)) {
    const v = process.env[src];
    if (v && !process.env[dst]) process.env[dst] = v;
}
