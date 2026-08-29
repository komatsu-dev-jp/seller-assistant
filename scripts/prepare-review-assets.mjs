import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const sourcePublic = path.join(repositoryRoot, "apps", "web", "public");
const reviewPublic = path.join(repositoryRoot, "apps", "review", "public");

await mkdir(reviewPublic, { recursive: true });
await cp(sourcePublic, reviewPublic, {
  recursive: true,
  force: true,
  filter: (source) => path.resolve(source) !== path.join(sourcePublic, "sw.js"),
});

console.log(`Prepared review assets from ${path.relative(repositoryRoot, sourcePublic)}.`);
