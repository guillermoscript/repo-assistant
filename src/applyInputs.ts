// Forward GitHub Actions INPUT_<NAME> env vars to the names the rest of the
// codebase reads. MUST run before modules that snapshot env at import time
// (e.g. config.ts). See action.ts — it requires this module *and* references
// the export below so webpack/ncc can't tree-shake the side effect away.
const map: Record<string, string> = {
    INPUT_OPENAI_API_KEY: "OPENAI_API_KEY",
    INPUT_DATABASE_URL: "DATABASE_URL",
    INPUT_MODE: "ACTION_MODE",
    INPUT_BOT_USERNAME: "BOT_USERNAME",
    INPUT_CHAT_SDK_ENABLED: "CHAT_SDK_ENABLED",
    INPUT_AUTO_CLOSE_ENABLED: "AUTO_CLOSE_ENABLED",
    INPUT_AUTO_CLOSE_GRACE_HOURS: "AUTO_CLOSE_GRACE_HOURS",
    INPUT_AUTO_CLOSE_DRY_RUN: "AUTO_CLOSE_DRY_RUN",
};

let forwarded = 0;
for (const [src, dst] of Object.entries(map)) {
    const v = process.env[src];
    if (v && !process.env[dst]) {
        process.env[dst] = v;
        forwarded++;
    }
}

// One-line debug so failures in CI tell us which inputs landed.
const inputKeys = Object.keys(process.env).filter((k) => k.startsWith("INPUT_"));
console.log(`[applyInputs] forwarded=${forwarded} INPUT_* keys=${inputKeys.join(",")}`);

export const inputsApplied = forwarded;
