import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions"

type Config = {
    similarityThreshold: number,
    gptModel: ChatCompletionCreateParamsBase['model']
    emmbeddingModel: string
}

export const botConfig: Config = {
    // Define a similarity threshold
    similarityThreshold: 0.8,
    gptModel: "gpt-4-turbo-preview",
    emmbeddingModel: 'text-embedding-3-small' // issues with the model
}