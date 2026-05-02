export const modelConfig = {
    chatModel: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
};

export const behaviorConfig = {
    // Floor for candidate retrieval. LLM judges duplication from candidates above this floor.
    // 0.65 matches simili-bot convention; tuned to recall paraphrases that 0.8 misses.
    candidateThreshold: 0.65,
    // Top-K candidates fetched and shown to the LLM for duplicate judgment.
    candidateCount: 5,
};

export const autoCloseConfig = {
    // Opt-in. Set AUTO_CLOSE_ENABLED=true to allow the auto-close job to close issues.
    // Default off because closing issues is hard to undo at scale.
    enabled: process.env.AUTO_CLOSE_ENABLED === "true",
    // Hours after the bot applies the `duplicate` label before auto-close fires,
    // assuming no human override (override signals listed in src/autoClose.ts).
    // Override with AUTO_CLOSE_GRACE_HOURS for testing (e.g. 0).
    graceHours: process.env.AUTO_CLOSE_GRACE_HOURS
        ? Number(process.env.AUTO_CLOSE_GRACE_HOURS)
        : 72,
    // If true, log decisions but don't actually close or comment.
    dryRun: process.env.AUTO_CLOSE_DRY_RUN === "true",
    // Repos to scan. Comma-separated `owner/repo` list. Required when enabled.
    repos: (process.env.AUTO_CLOSE_REPOS ?? "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
};
