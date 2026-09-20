import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(`apps/web/src/components/${file}.tsx`, "utf8");

describe("refresh assignment summaries after offline synchronization", () => {
  it("notifies only after actual synchronization or assignment removal", () => {
    const source = read("offline-sync-status");
    expect(source).toContain("result.synced > 0 || result.discarded > 0");
    expect(source).toContain("window.dispatchEvent(new Event(PUTAWAY_SYNC_CHANGED))");
    expect(source.indexOf("await syncPendingPutaways()")).toBeLessThan(
      source.indexOf("window.dispatchEvent"),
    );
  });
  it("subscribes and cleans up both mobile and management summaries", () => {
    for (const file of ["mobile-assignment-summary", "home-workspace"]) {
      const source = read(file);
      expect(source).toContain("window.addEventListener(PUTAWAY_SYNC_CHANGED,");
      expect(source).toContain("window.removeEventListener(PUTAWAY_SYNC_CHANGED,");
    }
  });
  it("invalidates old mobile requests before displaying the next assignment response", () => {
    const source = read("mobile-assignment-summary");
    expect(source).toContain("[role, workspaceId, revision]");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("if (controller.signal.aborted) return;");
    expect(source).toContain("return () => controller.abort()");
    expect(source).toContain('setError("")');
  });
  it("allows only the newest management request to update data, errors and loading", () => {
    const source = read("home-workspace");
    expect(source).toContain("const generation = ++refreshGeneration.current");
    expect(source.match(/if \(generation !== refreshGeneration.current\) return;/g)).toHaveLength(
      2,
    );
    expect(source).toContain("if (generation === refreshGeneration.current) setLoading(false)");
    expect(source).toContain("refreshGeneration.current += 1");
    expect(source.indexOf("if (generation !== refreshGeneration.current) return;")).toBeLessThan(
      source.indexOf("setSummary(nextSummary)"),
    );
  });
});
