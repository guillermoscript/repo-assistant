
require("dotenv").config();
import { Octokit } from "octokit";
import { supabaseClient } from "./utils/supabase";
import { createEmbeddingsAndSaveToDatabase } from "./insert";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


// Initialize Octokit for GitHub API
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN }).rest;

async function fetchAndStoreOpenIssues(owner: string, repo: string) {
    let page = 1;
    const perPage = 100; // GitHub API max is 100
    let issuesToProcess: any[] = [];
    // get repo id
    const { data: repoData } = await octokit.repos.get({
        owner,
        repo,
    });

    const repoId = repoData.id;

    console.log(`Fetching open issues for ${owner}/${repo}...`)

    // Fetch all open issues from GitHub
    while (true) {
        const { data: issues } = await octokit.issues.listForRepo({
            owner,
            repo,
            state: 'open',
            per_page: perPage,
            page,
        });

        issuesToProcess = issuesToProcess.concat(issues);

        if (issues.length < perPage) {
            break; // No more issues to fetch
        }

        page++;
        await sleep(2000); // Wait 2 seconds to respect GitHub API rate limits
        console.log(`Fetched page ${page} of issues.`)
    }

    console.log(`Fetched ${issuesToProcess.length} issues in total.`)
    // Process and store issues
    for (const issue of issuesToProcess) {
        // Check if issue already exists in the database
        const { data, error } = await supabaseClient
            .from('documents')
            .select('id')
            .eq('issue_id', issue.id)
            .eq('issue_number', issue.number)
            .eq('repo_id', repoId)
            .single();

        // if issue is not in the database, create it
        if (error && error.code === 'PGRST116') {
            
            const issueId = issue.id;
            const issueNumber = issue.number;

            const isSaved = await createEmbeddingsAndSaveToDatabase(issue.title + " " + issue?.body, repoId, issueId, issueNumber)

            if (!isSaved) {
                console.error(`Error storing issue ${issue.number} in the database.`);
            } else {
                console.log(`Issue ${issue.number} stored successfully.`);
            }

            sleep(2000); // Wait 2 seconds to respect OpenAI API rate limits
        }

        // If the issue already exists, skip to the next one
        if (data) {
            console.log(`Issue ${issue.number} already exists in the database.`);
            continue;
        }

    }

    console.log('Sync process completed successfully.');
}

if (!process.env.npm_config_user || !process.env.npm_config_repo) {
    console.error('Missing user or repo arguments.');
    process.exit(1);
}

const user = process.env.npm_config_user;
const repo = process.env.npm_config_repo;
fetchAndStoreOpenIssues(user, repo).then(() => {
    console.log('Exiting...');
    process.exit(0);
}).catch((error) => {
    console.error('Error syncing issues:', error);
    process.exit(1);
});