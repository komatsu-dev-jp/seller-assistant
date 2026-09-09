import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const maximumTextBytes = 1024 * 1024;

const rules = [
  {
    id: "private-key-header",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu,
  },
  { id: "github-token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/gu },
  { id: "github-fine-grained-token", pattern: /github_pat_[A-Za-z0-9_]{40,}/gu },
  { id: "openai-project-key", pattern: /sk-proj-[A-Za-z0-9_-]{20,}/gu },
  { id: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/gu },
  {
    id: "slack-webhook",
    pattern:
      /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/gu,
  },
  { id: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/gu },
  { id: "google-api-key", pattern: /AIza[0-9A-Za-z_-]{30,}/gu },
  { id: "stripe-live-key", pattern: /sk_live_[0-9A-Za-z]{16,}/gu },
  { id: "npm-token", pattern: /npm_[A-Za-z0-9]{20,}/gu },
  {
    id: "credential-bearing-url",
    pattern: /https?:\/\/[^\s:/]+:[^\s/@]+@[^\s/]+/gu,
  },
];

const ignoredPrefixes = [".git/", "node_modules/", "output/", "apps/review/public/"];

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

export function scanSecretText(text) {
  return rules.flatMap(({ id, pattern }) => {
    const count = Array.from(text.matchAll(new RegExp(pattern.source, pattern.flags))).length;
    return count > 0 ? [{ rule: id, count }] : [];
  });
}

function loadAllowlist() {
  const parsed = JSON.parse(
    readFileSync(path.join(repositoryRoot, "scripts", "secret-scan-allowlist.json"), "utf8"),
  );
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error("Secret scan allowlist has an unsupported format.");
  }
  return parsed.entries;
}

function listCandidateFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return output
    .split("\0")
    .map(normalizePath)
    .filter(Boolean)
    .filter((file) => !ignoredPrefixes.some((prefix) => file.startsWith(prefix)))
    .sort();
}

export function scanRepository() {
  const allowlist = loadAllowlist();
  const expected = new Map(
    allowlist.map((entry) => [`${normalizePath(entry.path)}\0${entry.rule}`, entry]),
  );
  const observedAllowlist = new Map();
  const findings = [];
  let scannedFiles = 0;
  let skippedFiles = 0;

  for (const relativePath of listCandidateFiles()) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    let size;
    try {
      size = statSync(absolutePath).size;
    } catch {
      skippedFiles += 1;
      continue;
    }
    if (size > maximumTextBytes) {
      skippedFiles += 1;
      continue;
    }

    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) {
      skippedFiles += 1;
      continue;
    }
    scannedFiles += 1;

    for (const result of scanSecretText(buffer.toString("utf8"))) {
      const key = `${relativePath}\0${result.rule}`;
      const allowed = expected.get(key);
      if (allowed && result.count === allowed.expectedCount) {
        observedAllowlist.set(key, result.count);
      } else {
        findings.push({ path: relativePath, rule: result.rule, count: result.count });
      }
    }
  }

  for (const [key, entry] of expected) {
    if (!observedAllowlist.has(key)) {
      findings.push({
        path: normalizePath(entry.path),
        rule: `${entry.rule}-allowlist-mismatch`,
        count: 0,
      });
    }
  }

  return {
    scannedFiles,
    skippedFiles,
    allowedFindings: observedAllowlist.size,
    findings,
  };
}

function main() {
  const result = scanRepository();
  console.log(
    `Secret scan: ${result.scannedFiles} text files checked, ${result.skippedFiles} binary/large files skipped, ${result.allowedFindings} documented fixture rule allowed.`,
  );
  if (result.findings.length === 0) {
    console.log("Secret scan passed: 0 unapproved secret-shaped findings.");
    return;
  }

  console.error(`Secret scan failed: ${result.findings.length} unapproved finding(s).`);
  for (const finding of result.findings) {
    console.error(`- ${finding.path} [${finding.rule}] count=${finding.count}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) main();
