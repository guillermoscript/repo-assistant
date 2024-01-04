import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions"

type Config = {
    similarityThreshold: number,
    gptModel: ChatCompletionCreateParamsBase['model']
}

export const botConfig: Config = {
    // Define a similarity threshold
    similarityThreshold: 0.8,
    gptModel: "gpt-4-1106-preview"
}