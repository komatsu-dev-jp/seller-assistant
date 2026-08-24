import {
  listingPrepPilotFixtures,
  type P0ItemResponse,
  type PilotRunResponse,
} from "@resale/contracts";

export type WorkflowStage = "purchase" | "capture" | "listing" | "order" | "accounting";

type ItemStageSnapshot = Pick<P0ItemResponse, "workflowState" | "orderState">;
type PilotStageSnapshot = {
  state: PilotRunResponse["state"];
  items: ReadonlyArray<{ completedAt: string | null }>;
};

export function canStartNextPilotFixture(pilotRun: PilotStageSnapshot | null): boolean {
  if (!pilotRun || pilotRun.state !== "active") return false;
  if (pilotRun.items.length >= listingPrepPilotFixtures.length) return false;
  const latestItem = pilotRun.items.at(-1);
  return !latestItem || latestItem.completedAt !== null;
}

export function stageAfterItemRefresh(
  currentStage: WorkflowStage,
  item: ItemStageSnapshot,
  pilotRun: PilotStageSnapshot | null,
): WorkflowStage {
  if (currentStage !== "purchase") return currentStage;
  if (canStartNextPilotFixture(pilotRun)) return "purchase";
  return nextStageForItem(item);
}

function nextStageForItem(item: ItemStageSnapshot): WorkflowStage {
  if (item.workflowState === "journal_approved" || item.orderState === "shipped") {
    return "accounting";
  }
  if (
    ["listing_confirmed", "order_confirmed", "picked", "packed", "shipped"].includes(
      item.workflowState,
    )
  ) {
    return "order";
  }
  if (item.workflowState === "capture_confirmed") return "listing";
  return "capture";
}
