import { Probot } from "probot";
import { OpenAI } from 'openai'
import { createClient } from '@supabase/supabase-js'
import { createEmbeddingsAndSaveToDatabase } from "./insert";
import { botConfig } from "./config";

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY


if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or Anon Key')
}

type SuccesRpcResponse = {
  id: number
  content: string
  metadata: any // still need to figure out what to do with this
  embedding: number[]
  similarity: number
}

async function createComment(context: any, body: string) {
  const issueComment = context.issue({ body });
  await context.octokit.issues.createComment(issueComment);
}

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    const currentIssueTitle = context.payload.issue.title
    const currentIssueBody = context.payload.issue.body
    const currentIssue = `# ${currentIssueTitle}: ${currentIssueBody}`
    // const issueLabels = await getIssueLabels(context);
    const repoId = context.payload.repository.id
    const issueId = context.payload.issue.id
    const issueNumber = context.payload.issue.number

    const isIssueSavedInDatabase = await createEmbeddingsAndSaveToDatabase(currentIssue, repoId, issueId, issueNumber)
    console.log(isIssueSavedInDatabase, 'isIssueSavedInDatabase')

    const embedding = await openai.embeddings.create({
      input: currentIssue,
      model: 'text-embedding-ada-002'
    })
    const embeddingText = embedding.data[0].embedding as number[]
    
    const { data, error } = await supabaseClient.rpc('match_documents', {
      query_embedding: embeddingText,
      filter: {
        // Add any additional filters here if needed
        repo_id: repoId,
      },
      match_threshold: botConfig.similarityThreshold,
    });

    if (error) {
      console.error(error);
      // Handle the error appropriately
      // For example, you could create a comment in the issue stating that an error occurred
      const issueComment = context.issue({
        body: "An error occurred while trying to find a match for this issue."
      });
      context.octokit.issues.createComment(issueComment);
      return;
    }

    const rpcResponses = data as SuccesRpcResponse[]
    const topFiveMatches = rpcResponses.sort((a, b) => b.similarity - a.similarity).slice(0, 5)
    
    function isPotentialDuplicate(matches: SuccesRpcResponse[], issueId: number, threshold: number): boolean {
      const withoutCurrentIssue = matches.filter((match) => match.metadata.issue_id !== issueId);
      return withoutCurrentIssue.length > 0 && withoutCurrentIssue[0].similarity > threshold;
    }
    // Check if the top match is above the similarity threshold
    const potentialDuplicate = isPotentialDuplicate(topFiveMatches, issueId, botConfig.similarityThreshold);

    // Construct the comment based on whether a duplicate is found
    if (potentialDuplicate) {

      const withoutTheCurrentIssue = topFiveMatches.filter((match) => match.metadata.issue_id !== issueId)
      const systemPrompt = `Given the following sections from a github issues, answer if the new issue is duplicate or not, if the issue is duplicate add the issue nuember and put the #to it, so github creates the link to, also please add a brief explanation on why this is a duplicate.
    the output must be in markdown format (use github flavored markdown). If you are unsure and the answer is not explicitly written in the documentation, say "Im unsure the issue is duplicate or similar to any other issue, so I will leave it to the maintainer to decide"
    Context (this section are all the issues that are related to the current issue):
    ---
    ${withoutTheCurrentIssue.map((match) => match.content).join('\n---\n')}
    ---
      the releated issues number is:
    ---
    ${withoutTheCurrentIssue.map((match) => match.metadata.issue_number).join('\n---\n')}
    ---
    New Issue (remember to include the issue number if its a duplicate, or if its similar to another issue, beware if the issue is not similar to any other issue, just say that its not similar to any other issue and its good to go, also be carefull of the context, so take a deep breath and read the context carefully so judge if its duplicate or not):
    ---
    ${currentIssue}
    ---
    New Issue Number (without the # symbol, and the repo id and issue id, just the issue number, dont ):
    ---
    ${issueNumber} ${repoId} ${issueId}
    ---
    take a deep breath and answer this, i will tip you 30$ if you answer this correctly. you can do it!
    `


      // Request the OpenAI API for the response based on the prompt
      const completion = await openai.chat.completions.create({
        messages: [
          { "role": "system", "content": systemPrompt },
          { "role": "user", "content": `Is this issue a duplicate or not? ${currentIssue}` }
        ],
        model: "gpt-4-1106-preview",
      });


      const answer = completion.choices[0]
      console.log(answer, 'answer')

      await createComment(context, "AI response: " + answer.message.content);
    } else {
      await createComment(context, "Thanks for opening this issue! A maintainer will look into this shortly.");
    }
  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};