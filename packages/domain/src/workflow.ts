import type { ActorRole } from "./orders.js";

export type P0WorkflowState =
  | "sku_created"
  | "purchase_confirmed"
  | "capture_confirmed"
  | "listing_confirmed"
  | "order_confirmed"
  | "picked"
  | "packed"
  | "shipped"
  | "journal_approved";

export type P0WorkflowAction =
  | "confirm_purchase"
  | "confirm_capture"
  | "confirm_listing"
  | "confirm_order"
  | "confirm_pick"
  | "confirm_pack"
  | "confirm_ship"
  | "approve_journal";

export interface P0WorkflowActionRequest {
  currentState: P0WorkflowState;
  action: P0WorkflowAction;
  actorRole: ActorRole;
  actorKind: "human" | "ai" | "system";
  evidenceCount: number;
  requiredFactsConfirmed: boolean;
  manualChannelHandoff: boolean;
}

export interface P0WorkflowDecision {
  allowed: boolean;
  nextState: P0WorkflowState;
  violations: string[];
}

const transitionByAction: Record<
  P0WorkflowAction,
  { from: P0WorkflowState; to: P0WorkflowState; roles: readonly ActorRole[] }
> = {
  confirm_purchase: {
    from: "sku_created",
    to: "purchase_confirmed",
    roles: ["owner", "inventory_manager"],
  },
  confirm_capture: {
    from: "purchase_confirmed",
    to: "capture_confirmed",
    roles: ["owner", "inventory_manager", "field_worker"],
  },
  confirm_listing: {
    from: "capture_confirmed",
    to: "listing_confirmed",
    roles: ["owner", "inventory_manager"],
  },
  confirm_order: {
    from: "listing_confirmed",
    to: "order_confirmed",
    roles: ["owner", "inventory_manager", "shipping"],
  },
  confirm_pick: {
    from: "order_confirmed",
    to: "picked",
    roles: ["owner", "inventory_manager", "shipping"],
  },
  confirm_pack: {
    from: "picked",
    to: "packed",
    roles: ["owner", "inventory_manager", "shipping"],
  },
  confirm_ship: {
    from: "packed",
    to: "shipped",
    roles: ["owner", "inventory_manager", "shipping"],
  },
  approve_journal: {
    from: "shipped",
    to: "journal_approved",
    roles: ["owner", "accounting"],
  },
};

export function decideP0WorkflowAction(request: P0WorkflowActionRequest): P0WorkflowDecision {
  const transition = transitionByAction[request.action];
  const violations: string[] = [];
  if (request.currentState !== transition.from) violations.push("workflow_state_mismatch");
  if (!transition.roles.includes(request.actorRole)) violations.push("role_not_allowed");
  if (request.actorKind !== "human") violations.push("human_confirmation_required");
  if (!Number.isSafeInteger(request.evidenceCount) || request.evidenceCount < 1) {
    violations.push("evidence_required");
  }
  if (!request.requiredFactsConfirmed) violations.push("required_facts_not_confirmed");
  if (request.action === "confirm_listing" && !request.manualChannelHandoff) {
    violations.push("manual_channel_handoff_required");
  }
  return {
    allowed: violations.length === 0,
    nextState: violations.length === 0 ? transition.to : request.currentState,
    violations,
  };
}
