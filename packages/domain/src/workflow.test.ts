import { describe, expect, it } from "vitest";

import { decideP0WorkflowAction, type P0WorkflowAction, type P0WorkflowState } from "./workflow";

describe("P0 workflow", () => {
  it("runs the representative journey only in order with human evidence", () => {
    const actions: Array<[P0WorkflowAction, P0WorkflowState]> = [
      ["confirm_purchase", "purchase_confirmed"],
      ["confirm_capture", "capture_confirmed"],
      ["confirm_listing", "listing_confirmed"],
      ["confirm_order", "order_confirmed"],
      ["confirm_pick", "picked"],
      ["confirm_pack", "packed"],
      ["confirm_ship", "shipped"],
      ["approve_journal", "journal_approved"],
    ];
    let state: P0WorkflowState = "sku_created";
    for (const [action, expected] of actions) {
      const result = decideP0WorkflowAction({
        currentState: state,
        action,
        actorRole: action === "approve_journal" ? "accounting" : "owner",
        actorKind: "human",
        evidenceCount: 1,
        requiredFactsConfirmed: true,
        manualChannelHandoff: true,
      });
      expect(result).toEqual({ allowed: true, nextState: expected, violations: [] });
      state = result.nextState;
    }
  });

  it("rejects skipping a stage", () => {
    const result = decideP0WorkflowAction({
      currentState: "sku_created",
      action: "confirm_listing",
      actorRole: "owner",
      actorKind: "human",
      evidenceCount: 1,
      requiredFactsConfirmed: true,
      manualChannelHandoff: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("workflow_state_mismatch");
  });

  it.each(["ai", "system"] as const)("rejects %s as the final confirmer", (actorKind) => {
    const result = decideP0WorkflowAction({
      currentState: "sku_created",
      action: "confirm_purchase",
      actorRole: "owner",
      actorKind,
      evidenceCount: 1,
      requiredFactsConfirmed: true,
      manualChannelHandoff: true,
    });
    expect(result.violations).toContain("human_confirmation_required");
  });

  it("requires manual channel handoff for listing completion", () => {
    const result = decideP0WorkflowAction({
      currentState: "capture_confirmed",
      action: "confirm_listing",
      actorRole: "owner",
      actorKind: "human",
      evidenceCount: 4,
      requiredFactsConfirmed: true,
      manualChannelHandoff: false,
    });
    expect(result.violations).toContain("manual_channel_handoff_required");
  });

  it("rejects a field worker approving a journal", () => {
    const result = decideP0WorkflowAction({
      currentState: "shipped",
      action: "approve_journal",
      actorRole: "field_worker",
      actorKind: "human",
      evidenceCount: 1,
      requiredFactsConfirmed: true,
      manualChannelHandoff: true,
    });
    expect(result.violations).toContain("role_not_allowed");
  });
});
