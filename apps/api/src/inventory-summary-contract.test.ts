import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unresolved inventory discrepancy summary", () => {
  it("excludes both terminal states while retaining workspace isolation and missing candidates", () => {
    const source = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
    const summary = source.slice(
      source.indexOf("async inventorySummary("),
      source.indexOf("async ownerPulse("),
    );
    expect(summary).toContain(
      "where workspace_id = ${workspaceId} and state not in ('resolved', 'restored')",
    );
    expect(summary).not.toContain("state <> 'resolved'");
    expect(summary).not.toContain("'candidate_confirmed'");
    expect(summary).toContain(
      'await requireRole(transaction, workspaceId, actor.identityId, ["owner", "inventory_manager"])',
    );
  });
  it("labels the count as unresolved rather than historical discrepancies", () => {
    const source = readFileSync(
      new URL("../../web/src/components/inventory-workspace.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('["未解決の差異", summary?.discrepancies');
  });
});
