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
