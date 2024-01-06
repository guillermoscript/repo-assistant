import { openai } from "./utils/openai";
import { supabaseClient } from "./utils/supabase";

// Function to split the text into chunks with a maximum number of tokens
const MAX_TOKENS = 4000;
export const splitIntoChunks = (text: string): string[] => {
    // For simplicity, we'll assume that we can split by sentences.
    // A more sophisticated tokenizer would be required for production use.
    const sentences = text.split('. ');
    let chunks: string[] = [];
    let currentChunk = '';

    sentences.forEach(sentence => {
        // Append sentence to current chunk if it doesn't exceed MAX_TOKENS
        if ((currentChunk + sentence).length <= MAX_TOKENS) {
            currentChunk += sentence + '. ';
        } else {
            // Chunk is full, push it and start a new one
            chunks.push(currentChunk);
            currentChunk = sentence + '. ';
        }
    });

    // Push the last chunk if it's not empty
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
};

export const createEmbeddingsAndSaveToDatabase = async (inputText: string, repoId: number, issueId: number, issueNumber: number): Promise<boolean> => {
    const chunks = splitIntoChunks(inputText);

    for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        
        try {
            // Generate embedding for the chunk
            const embeddingResponse = await openai.embeddings.create({
                input: chunk,
                model: 'text-embedding-ada-002'
            });
            const embedding = embeddingResponse.data[0].embedding;
    
            // Insert the chunk content and its embedding into the database
            const { data, error } = await supabaseClient
                .from('documents')
                .insert([
                    {
                        content: chunk,
                        embedding: embedding,
                        metadata: {
                            repo_id: repoId,
                            issue_id: issueId,
                            issue_number: issueNumber,
                        },
                        repo_id: repoId,
                        issue_id: issueId,
                        issue_number: issueNumber,
                    }
                ]);
    
            if (error) {
                console.error('Error inserting data into Supabase:', error);
                return false;
            }
    
            console.log('Data inserted successfully:', data);
        } catch (error) {
            console.error('Error inserting data into Supabase:', error);
            return false;
        }
    }

    return true;
};
