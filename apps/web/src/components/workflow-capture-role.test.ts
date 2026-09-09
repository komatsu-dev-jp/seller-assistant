import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assignedCaptureTasks } from "./workflow-capture-data";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const skuId = "22222222-2222-4222-8222-222222222222";
const fixture = {
  workspaceId,
  skuId,
  skuCode: "TEST-1",
  title: "架空商品",
  category: null,
  measurementProfile: null,
  photoAssetIds: [],
  photoRoles: [],
  measurements: [],
  assignmentExpiresAt: "2026-09-10T00:00:00.000Z",
};
const root = resolve(process.cwd(), "apps/web/src");

describe("assigned worker capture boundary", () => {
  it("accepts only the narrow capture response from an API mock", async () => {
    const api = vi
      .fn()
      .mockResolvedValue([
        { ...fixture, allocatedCostMinor: 999, profit: 99, shippingAddress: "must not reach UI" },
      ]);
    const result = assignedCaptureTasks(await api(), workspaceId);
    expect(result).toEqual([fixture]);
    expect(result[0]).not.toHaveProperty("allocatedCostMinor");
    expect(result[0]).not.toHaveProperty("shippingAddress");
  });
  it("rejects another workspace and malformed response", () => {
    expect(() => assignedCaptureTasks([fixture], "33333333-3333-4333-8333-333333333333")).toThrow();
    expect(() => assignedCaptureTasks([{ skuId }], workspaceId)).toThrow();
    expect(assignedCaptureTasks([], workspaceId)).toEqual([]);
  });
  it("preserves the separate page roles and assigned API, not owner data", () => {
    const workerRoute = readFileSync(resolve(root, "app/mobile/capture/page.tsx"), "utf8");
    const ownerRoute = readFileSync(resolve(root, "app/workflow/page.tsx"), "utf8");
    const source = readFileSync(resolve(root, "components/mobile-capture-workspace.tsx"), "utf8");
    expect(workerRoute).toContain(
      'requirePageSession(["owner", "inventory_manager", "field_worker"])',
    );
    expect(ownerRoute).toContain('requirePageSession(["owner", "inventory_manager"])');
    expect(source).toContain("/capture-tasks");
    expect(source).not.toContain("/p0-items");
    expect(source).not.toMatch(/allocatedCostMinor|profit|shippingAddress/);
    expect(source).toContain("clearUnassignedCaptureUploads");
    expect(source).toContain("<WorkflowLiveLayout captureOnly>");
    expect(source).toContain("draftReadyFor !== task.skuId");
    expect(source).toContain("if (cancelled) return");
  });
});
