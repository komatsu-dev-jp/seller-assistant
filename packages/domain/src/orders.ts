export type OrderState =
  "draft" | "confirmed" | "picking" | "packed" | "shipped" | "cancelled" | "returned";

export type ActorRole = "owner" | "inventory_manager" | "field_worker" | "shipping" | "accounting";

const transitions: Record<OrderState, readonly OrderState[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["picking", "cancelled"],
  picking: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["returned"],
  cancelled: [],
  returned: [],
};

export interface TransitionRequest {
  from: OrderState;
  to: OrderState;
  actorRole: ActorRole;
  hasActiveAllocation: boolean;
  hasConfirmedPickScan: boolean;
  hasPackingEvidence: boolean;
  addressLeaseActive: boolean;
}

export function validateOrderTransition(request: TransitionRequest): string[] {
  const violations: string[] = [];
  if (!transitions[request.from].includes(request.to)) violations.push("transition_not_allowed");
  if (request.to === "picking" && !request.hasActiveAllocation) {
    violations.push("active_allocation_required");
  }
  if (request.to === "packed" && !request.hasConfirmedPickScan) {
    violations.push("confirmed_pick_scan_required");
  }
  if (request.to === "shipped" && !request.hasPackingEvidence) {
    violations.push("packing_evidence_required");
  }
  if (
    ["picking", "packed", "shipped"].includes(request.to) &&
    request.actorRole === "shipping" &&
    !request.addressLeaseActive
  ) {
    violations.push("active_address_lease_required");
  }
  if (!["owner", "inventory_manager", "shipping"].includes(request.actorRole)) {
    violations.push("role_not_allowed");
  }
  return violations;
}

export type ReturnInventoryState =
  "return_received" | "quarantined" | "inspected" | "available" | "disposed";

const returnTransitions: Record<ReturnInventoryState, readonly ReturnInventoryState[]> = {
  return_received: ["quarantined"],
  quarantined: ["inspected"],
  inspected: ["available", "disposed"],
  available: [],
  disposed: [],
};

export function canTransitionReturn(from: ReturnInventoryState, to: ReturnInventoryState): boolean {
  return returnTransitions[from].includes(to);
}
