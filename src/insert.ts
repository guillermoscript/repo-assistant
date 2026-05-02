import { embedMany } from "ai";
import { embeddingModel } from "./utils/aiProvider";
import { supabaseClient } from "./utils/supabase";

const MAX_TOKENS = 4000;

export const splitIntoChunks = (text: string): string[] => {
    if (text.length <= MAX_TOKENS) return [text];

    const sentences = text.split('. ');
    const chunks: string[] = [];
    let currentChunk = '';

    sentences.forEach(sentence => {
        if ((currentChunk + sentence).length <= MAX_TOKENS) {
            currentChunk += sentence + '. ';
        } else {
            chunks.push(currentChunk);
            currentChunk = sentence + '. ';
        }
    });

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
};

export type EmbedAndSaveResult = {
    saved: boolean;
    /** Embedding of the full input text (first chunk for short inputs). Reusable for match queries. */
    embedding: number[] | null;
};

export const createEmbeddingsAndSaveToDatabase = async (
    inputText: string,
    repoId: number,
    issueId: number,
    issueNumber: number
): Promise<EmbedAndSaveResult> => {
    const chunks = splitIntoChunks(inputText);

    try {
        const { embeddings } = await embedMany({
            model: embeddingModel,
            values: chunks,
        });

        const rows = chunks.map((chunk, i) => ({
            content: chunk,
            embedding: embeddings[i],
            repo_id: repoId,
            issue_id: issueId,
            issue_number: issueNumber,
        }));

        const { error } = await supabaseClient.from('documents').insert(rows);

        if (error) {
            console.error('Error inserting data into Supabase:', error);
            return { saved: false, embedding: null };
        }

        return { saved: true, embedding: embeddings[0] };
    } catch (error) {
        console.error('Error embedding/inserting:', error);
        return { saved: false, embedding: null };
    }
};
