import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("apps/web/src/components/product-research-panel.tsx"), "utf8");
const handoff = source.slice(
  source.indexOf("function ResearchHandoff("),
  source.indexOf("async function send("),
);
const helper = readFileSync(resolve("apps/web/src/lib/product-research-handoff.ts"), "utf8");

describe("AC-067 local-only handoff source boundary", () => {
  it("mounts only outside pilot and isolates drafts by workspace and SKU", () => {
    expect(source).toMatch(
      /\{!pilotActive \? \(\s*<>\s*\{research && research.workspaceId === workspaceId && research.skuId === skuId \? \(\s*<ResearchHandoff/u,
    );
    expect(source).toContain("key={`${workspaceId}:${skuId}`}");
    expect(handoff).toContain("useState(() => buildResearchSearchTerms(research))");
    expect(handoff).not.toMatch(/useEffect|refresh|setTerms\(buildResearch/u);
  });
  it("limits clipboard and external navigation to explicit click handlers", () => {
    expect(handoff).toMatch(
      /async function handleCopyClick[\s\S]*?navigator\.clipboard\.writeText\(text\)/u,
    );
    expect(handoff).toContain("onClick={() => void handleCopyClick(terms)}");
    expect(handoff).toContain("onClick={() => void handleCopyClick(question)}");
    expect(handoff).toMatch(
      /function handleSearchClick\(\) \{\s*const url = buildMercariSearchUrl\(terms\);\s*if \(!url\) return;\s*window.open\(url, "_blank", "noopener,noreferrer"\);/u,
    );
    expect(handoff).toContain("onClick={handleSearchClick}");
    expect(handoff.match(/window\.open\(/gu)).toHaveLength(1);
    expect(handoff.match(/navigator\.clipboard\.writeText\(/gu)).toHaveLength(1);
  });
  it("adds no fetch, automatic send, cookies or persistent storage", () => {
    expect(handoff + helper).not.toMatch(
      /\bfetch\s*\(|\bsend\s*\(|XMLHttpRequest|sendBeacon|document\.cookie|localStorage|sessionStorage/u,
    );
    expect(helper.match(/https:\/\//gu)).toHaveLength(1);
  });
});
