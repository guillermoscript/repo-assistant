import { Probot } from 'probot';
import { createEmbeddingsAndSaveToDatabase } from "./insert";
import { botConfig } from "./config";
import { openai } from "./utils/openai";
import { supabaseClient } from "./utils/supabase";

const MAX_PATCH_COUNT = process.env.MAX_PATCH_LENGTH
  ? +process.env.MAX_PATCH_LENGTH
  : Infinity;

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

async function addLabels(context: any, labels: string[]) {
  try {
    await context.octokit.issues.addLabels({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: context.payload.issue.number,
      labels: labels
    });

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function createPromptAndCallOpenAI(context: any, systemPrompt: string, userPrompt: string) {
  const messages = [
    { "role": "system", "content": systemPrompt },
    { "role": "user", "content": userPrompt }
  ] as any

  // Request the OpenAI API for the response based on the prompt
  const completion = await openai.chat.completions.create({
    messages: messages,
    model: botConfig.gptModel,
    response_format: { type: "json_object" },
  });

  const answer = completion.choices[0]
  console.log(answer, 'answer')
  const finalResponse = JSON.parse(answer.message.content as any) as Output

  await createComment(context, "AI response: " + finalResponse.content);
  await addLabels(context, finalResponse.labels);
}

type Output = {
  labels: string[],
  content: string,
}

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    const currentIssueTitle = context.payload.issue.title
    const currentIssueBody = context.payload.issue.body
    const currentIssue = `# ${currentIssueTitle}: \n ${currentIssueBody}`
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

    function isPotentialDuplicate(matches: SuccesRpcResponse[], issueId: number, threshold: number, repoId: number) {
      const withoutCurrentIssue = matches.filter((match) => match.metadata.issue_id !== issueId && repoId === match.metadata.repo_id)
      return withoutCurrentIssue.length > 0 && withoutCurrentIssue[0].similarity > threshold;
    }
    // Check if the top match is above the similarity threshold
    const potentialDuplicate = isPotentialDuplicate(topFiveMatches, issueId, botConfig.similarityThreshold, repoId);

    // Construct the comment based on whether a duplicate is found
    if (potentialDuplicate) {

      const withoutTheCurrentIssue = topFiveMatches.filter((match) => match.metadata.issue_id !== issueId)
      const systemPrompt = `Given the following sections from a github issues, answer if the new issue is duplicate or not, if the issue is duplicate or similar write the issue number with a # like this: "#IssueNumber", so github creates the link to it, also please add a brief explanation on why this is a duplicate. 
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
      the output should be a json that satisfies this Typescript interface:
      type Output = {
        labels: string[],
        content: string,
      }
      If you are unsure and the answer is not explicitly written in the documentation, say "Im unsure the issue is duplicate or similar to any other issue, so I will leave it to the maintainer to decide". and add the label "needs triage" to labels property of the Output interface.
    ---
    take a deep breath and answer this, i will tip you 30$ if you answer this correctly. you can do it!
    `
      await createPromptAndCallOpenAI(context, systemPrompt, `Is this issue a duplicate or not? ${currentIssue}`);
    } else {
      if (!context.payload.issue.labels || context.payload.issue.labels.length === 0) { // If the issue has no labels, add the "needs triage" label

        const systemPrompt = `Given the following sections from a github issues, add proper labels to the issue, depending on the context of the issue, for example: "bug" for bug issues, "enhancement" for enhancement issues, "question" for question issues, "needs triage" for issues that need to be triaged, "invalid" for issues that are invalid, "wontfix" for issues that wont be fixed, "good first issue" for issues that are good for first time contributors, "help wanted" for issues that need help from the community, "documentation" for issues that are related to documentation, "testing" for issues that are related to testing, "feature" for issues that are related to new features, "performance" for issues that are related to performance, "security" for issues that are related to security, "design" for issues that are related to design.

        Context (this section is the issue itself):
        ---
        Issue Title: ${currentIssueTitle}
        ---
        Issue Body: ${currentIssueBody}
        ---
        be carefull of the context, so take a deep breath and read the context carefully so judge on how to label the issue.
        Your answer should be a json that satisfies this Typescript interface:
        type Output = {
          labels: string[],
          content: string,
        }
        for the content on the Output interface, just write a really short message about how you labeled the issue.
        Take a deep breath and answer this, i will tip you 30$ if you answer this correctly. you can do it!
        `

        await createPromptAndCallOpenAI(context, systemPrompt, `What labels should this issue have? ${currentIssue}`);
      } else {

        await createComment(context, "Thanks for opening this issue! A maintainer will look into this shortly.");
      }
    }
  });

  app.on(
    "pull_request.opened",
    async () => {
      console.log('pull request opened')
    });

};