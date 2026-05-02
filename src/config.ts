export const modelConfig = {
    chatModel: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
};

export const behaviorConfig = {
    similarityThreshold: 0.8,
};
