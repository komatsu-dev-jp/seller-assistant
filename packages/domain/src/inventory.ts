export type InventoryStatus =
  | "putaway_pending"
  | "available"
  | "reserved"
  | "picked"
  | "packed"
  | "shipped"
  | "quarantined"
  | "lost"
  | "disposed";

export type LocationState = "active" | "inactive" | "retired";

export interface LocationNode {
  id: string;
  workspaceId: string;
  parentId: string | null;
  code: string;
  state: LocationState;
  canStoreInventory: boolean;
  singleItemOnly: boolean;
  allowMixedSku: boolean;
  maxUnits: number | null;
}

export interface InventoryUnit {
  id: string;
  workspaceId: string;
  skuId: string;
  inventoryNumber: string;
  status: InventoryStatus;
  locationId: string | null;
}

export interface InventoryLabel {
  id: string;
  workspaceId: string;
  targetType: "inventory_unit" | "location";
  targetId: string;
  version: number;
  tokenHash: string;
  shortCode: string;
  active: boolean;
}

export interface ScanEvidence {
  labelId: string;
  labelVersion: number;
  scannedAt: string;
}

export interface ScanSession {
  id: string;
  operation: "putaway" | "move" | "pick";
  inventoryUnitId: string;
  expectedCurrentLocationId: string | null;
  destinationLocationId: string;
  inventoryEvidence: ScanEvidence;
  locationEvidence: ScanEvidence;
  confirmedBy: string | null;
  consumedAt: string | null;
}

export interface PlacementContext {
  unit: InventoryUnit;
  destination: LocationNode;
  occupants: InventoryUnit[];
}

export type InventoryViolation =
  | "workspace_mismatch"
  | "location_not_active"
  | "location_not_storable"
  | "single_item_location_occupied"
  | "location_capacity_reached"
  | "mixed_sku_not_allowed";

const locatedStatuses = new Set<InventoryStatus>(["available", "reserved", "picked", "packed"]);

export function requiresFixedLocation(status: InventoryStatus): boolean {
  return locatedStatuses.has(status);
}

export function validateUnitLocation(
  unit: InventoryUnit,
  location?: LocationNode,
): InventoryViolation[] {
  if (!requiresFixedLocation(unit.status)) return [];
  if (!unit.locationId || !location) return ["location_not_storable"];

  const violations: InventoryViolation[] = [];
  if (unit.workspaceId !== location.workspaceId) violations.push("workspace_mismatch");
  if (location.state !== "active") violations.push("location_not_active");
  if (!location.canStoreInventory) violations.push("location_not_storable");
  return violations;
}

export function validatePlacement({
  unit,
  destination,
  occupants,
}: PlacementContext): InventoryViolation[] {
  const violations: InventoryViolation[] = [];
  if (unit.workspaceId !== destination.workspaceId) violations.push("workspace_mismatch");
  if (destination.state !== "active") violations.push("location_not_active");
  if (!destination.canStoreInventory) violations.push("location_not_storable");
  if (destination.singleItemOnly && occupants.some((item) => item.id !== unit.id)) {
    violations.push("single_item_location_occupied");
  }
  const otherOccupants = occupants.filter((item) => item.id !== unit.id);
  if (destination.maxUnits !== null && otherOccupants.length >= destination.maxUnits) {
    violations.push("location_capacity_reached");
  }
  if (!destination.allowMixedSku && otherOccupants.some((item) => item.skuId !== unit.skuId)) {
    violations.push("mixed_sku_not_allowed");
  }
  return [...new Set(violations)];
}

export type ScanViolation =
  | "scan_already_used"
  | "human_confirmation_required"
  | "inventory_label_mismatch"
  | "location_label_mismatch"
  | "label_inactive"
  | "label_version_mismatch";

export function validateScanSession(
  session: ScanSession,
  inventoryLabel: InventoryLabel,
  locationLabel: InventoryLabel,
): ScanViolation[] {
  const violations: ScanViolation[] = [];
  if (session.consumedAt) violations.push("scan_already_used");
  if (!session.confirmedBy) violations.push("human_confirmation_required");
  if (
    inventoryLabel.targetType !== "inventory_unit" ||
    inventoryLabel.targetId !== session.inventoryUnitId ||
    inventoryLabel.id !== session.inventoryEvidence.labelId
  ) {
    violations.push("inventory_label_mismatch");
  }
  if (
    locationLabel.targetType !== "location" ||
    locationLabel.targetId !== session.destinationLocationId ||
    locationLabel.id !== session.locationEvidence.labelId
  ) {
    violations.push("location_label_mismatch");
  }
  if (!inventoryLabel.active || !locationLabel.active) violations.push("label_inactive");
  if (
    inventoryLabel.version !== session.inventoryEvidence.labelVersion ||
    locationLabel.version !== session.locationEvidence.labelVersion
  ) {
    violations.push("label_version_mismatch");
  }
  return [...new Set(violations)];
}

export interface CountResolutionActors {
  initialCounterId: string;
  reconfirmerId: string;
  requesterId: string;
  approverId: string;
}

export function canResolveMissingInventory(actors: CountResolutionActors): boolean {
  const distinctActors = new Set([
    actors.initialCounterId,
    actors.reconfirmerId,
    actors.requesterId,
    actors.approverId,
  ]);
  return (
    actors.initialCounterId !== actors.reconfirmerId &&
    actors.requesterId !== actors.approverId &&
    distinctActors.size >= 2
  );
}

export interface IdempotencyRecord<TResult> {
  key: string;
  payloadHash: string;
  result: TResult;
}

export type IdempotencyDecision<TResult> =
  { kind: "new" } | { kind: "replay"; result: TResult } | { kind: "conflict" };

export function decideIdempotency<TResult>(
  existing: IdempotencyRecord<TResult> | undefined,
  key: string,
  payloadHash: string,
): IdempotencyDecision<TResult> {
  if (!existing || existing.key !== key) return { kind: "new" };
  if (existing.payloadHash === payloadHash) return { kind: "replay", result: existing.result };
  return { kind: "conflict" };
}
