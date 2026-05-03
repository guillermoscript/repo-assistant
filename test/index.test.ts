// Import necessary modules and mock utilities
import { Probot, ProbotOctokit } from "probot";
import nock from "nock";
import myProbotApp from "../src";
import payload from "./fixtures/issues.opened.json";

// Mock utilities and fixtures
const fs = require("fs");
const path = require("path");
const privateKey = fs.readFileSync(path.join(__dirname, "fixtures/mock-cert.pem"), "utf-8");

// Mock responses and external services
const mockOpenAIResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          labels: ["duplicate"],
          content: "This issue is a duplicate.",
        }),
      },
    },
  ],
};
const mockEmbeddingResponse = {
  data: [
    {
      embedding: [/* 1536-dimensional vector */],
    },
  ],
};
const mockSupabaseResponse = [
  {
    id: 1,
    content: "Mock issue content",
    metadata: {
      issue_number: 1,
      issue_id: 1,
      repo_id: 123,
    },
    similarity: 0.9, // High similarity score indicating a duplicate
  },
];

describe("Repo Assistant AI", () => {
  let probot;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      privateKey: privateKey,
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    probot.load(myProbotApp);
  });

  test("saves an issue in the database and checks for duplicates", async () => {
    // Mock GitHub API for authentication and comment creation
    const mockGitHub = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" })
      .post("/repos/owner/repo/issues/1/comments")
      .reply(200)
      .post("/repos/owner/repo/issues/1/labels")
      .reply(200);

    // Mock OpenAI API for embeddings and chat completions
    const mockOpenAI = nock("https://api.openai.com")
      .post("/v1/embeddings")
      .reply(200, mockEmbeddingResponse)
      .post("/v1/chat/completions")
      .reply(200, mockOpenAIResponse);

    // Mock Supabase API for the RPC call
    const mockSupabase = nock("https://your-supabase-url")
      .post("/rest/v1/rpc/match_documents")
      .reply(200, mockSupabaseResponse);

    // Simulate receiving a webhook event
    await probot.receive({ name: "issues", payload: payload });

    // Assertions to ensure the mocks have been called
    expect(mockGitHub.isDone()).toBeTruthy();
    expect(mockOpenAI.isDone()).toBeTruthy();
    expect(mockSupabase.isDone()).toBeTruthy();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});
