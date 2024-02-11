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

  app.on(
    ['pull_request.opened', 'pull_request.synchronize'], async (context) => {
      console.log('pull request opened')
      const repo = context.repo();
      const pullRequest = context.payload.pull_request;
      const creator = pullRequest.user.login;
      try {
        // list the pull request of the creator
        const listPullRequest = await context.octokit.pulls.list({
          owner: creator,
          repo: repo.repo,
        });

        console.log(listPullRequest)

        const pullRequestCount = listPullRequest.data.length;
        console.log(pullRequestCount)
      } catch (error) {
        console.log(error);
      }


      if (
        pullRequest.state === 'closed' ||
        pullRequest.locked
      ) {
        console.log('invalid event payload');
        return 'invalid event payload';
      }

      const data = await context.octokit.repos.compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: context.payload.pull_request.base.sha,
        head: context.payload.pull_request.head.sha,
      });

      let { files: changedFiles, commits } = data.data;

      if (context.payload.action === 'synchronize' && commits.length >= 2) {
        const {
          data: { files },
        } = await context.octokit.repos.compareCommits({
          owner: repo.owner,
          repo: repo.repo,
          base: commits[commits.length - 2].sha,
          head: commits[commits.length - 1].sha,
        });

        const ignoreList = (process.env.IGNORE || process.env.ignore || '')
          .split('\n')
          .filter((v) => v !== '');

        const filesNames = files?.map((file) => file.filename) || [];
        changedFiles = changedFiles?.filter(
          (file) =>
            filesNames.includes(file.filename) &&
            !ignoreList.includes(file.filename)
        );
      }

      if (!changedFiles?.length) {
        console.log('no change found');
        return 'no change';
      }

      let labels = new Set<string>();

      for (let i = 0; i < changedFiles.length; i++) {
        const file = changedFiles[i];
        const patch = file.patch || '';

        if (file.status !== 'modified' && file.status !== 'added') {
          continue;
        }

        if (!patch || patch.length > MAX_PATCH_COUNT) {
          console.log(
            `${file.filename} skipped caused by its diff is too large`
          );
          continue;
        }
        try {
          const res = await openai.chat.completions.create({
            messages: [
              {
                role: 'system',
                content: `Given the following patch, your taks is to check if this patch is a spam or not, if the patch is spam, just say "this is spam", if the patch is not spam, just say "this is not spam".
                ---
                Criteria for spam:
                - Contains any kind of advertisement
                - Contains any kind of malicious content
                - Contains any kind of offensive content
                - Contains any kind of irrelevant content, such as random characters, names, just to fill the space, content that is not related to the code, comments that are not related to the code, etc.
                - Contains any kind of content that is not related to the code, such as personal messages, etc.
                - Contains Obfuscated code, such as code that is not readable, or that is not clear, or that is not understandable, or that is not maintainable, etc.
                - Contains Repetitive code, such as code that is repeated, or that is redundant, or that is not necessary, etc.
                ---
                Patch:
                ---
                ${patch}
                ---
                the output should be a json that satisfies this Typescript interface:
                type Output = {
                  labels: string[],
                  content: string,
                }
                If you are unsure and the answer is not explicitly written in the documentation, say "Im unsure if the patch is good or not, so I will leave it to the maintainer to decide". and add the label "needs triage" to labels property of the Output interface.
                ---
                take a deep breath and answer this, I will tip you 30$ if you answer this correctly. you can do it!
                `,
              },
              {
                role: 'user',
                content: `Is this patch good or its just spam?`,
              },
            ],
            model: botConfig.gptModel,
            response_format: { type: "json_object" },
          });


          const answer = res.choices[0]
          console.log(answer, 'answer')
          const finalResponse = JSON.parse(answer.message.content as any) as Output
          const aiLables = finalResponse.labels;
          // add the labels to the set
          aiLables.forEach((label) => labels.add(label));

          // create a comment with the response
          await context.octokit.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: pullRequest.number,
            commit_id: pullRequest.head.sha,
            body: `AI response: ${finalResponse.content}`,
            path: file.filename,
            position: 1,
          });


        } catch (e) {
          console.error(`review ${file.filename} failed`, e);
        }
      }

      // check if the set is empty
      if (labels.size === 0) {
        labels.add('needs triage');
      }

      // add the labels to the pull request
      await context.octokit.pulls.update({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullRequest.number,
        labels: Array.from(labels),
      });

      return 'success';
    });
};