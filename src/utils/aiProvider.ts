import { openai } from "@ai-sdk/openai";
import { modelConfig } from "../config";

export const chatModel = openai(modelConfig.chatModel);
export const embeddingModel = openai.embeddingModel(modelConfig.embeddingModel);
