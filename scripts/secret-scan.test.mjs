import { expect, it } from "vitest";

import { scanSecretText } from "./secret-scan.mjs";

it("detects supported secret shapes without returning their values", () => {
  const privateKey = "-----BEGIN " + "PRIVATE KEY-----";
  const awsKey = "AKIA" + "A".repeat(16);
  const githubFineGrainedToken = "github" + "_pat_" + "A".repeat(60);
  const openAiProjectKey = "sk" + "-proj-" + "A".repeat(40);
  const slackWebhook =
    "https://hooks.slack.com" +
    "/services/" +
    "T".repeat(10) +
    "/" +
    "B".repeat(10) +
    "/" +
    "A".repeat(24);
  expect(
    scanSecretText(
      `${privateKey}\n${awsKey}\n${githubFineGrainedToken}\n${openAiProjectKey}\n${slackWebhook}`,
    ),
  ).toEqual([
    { rule: "private-key-header", count: 1 },
    { rule: "github-fine-grained-token", count: 1 },
    { rule: "openai-project-key", count: 1 },
    { rule: "slack-webhook", count: 1 },
    { rule: "aws-access-key", count: 1 },
  ]);
});

it("does not report ordinary app configuration text", () => {
  expect(scanSecretText("RESALE|INV-000001-7|V1\nNEXT_PUBLIC_API_BASE_URL")).toEqual([]);
});
