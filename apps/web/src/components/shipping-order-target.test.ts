import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("apps/web/src/components/shipping-workspace.tsx"), "utf8");
const page = readFileSync(resolve("apps/web/src/app/shipping/page.tsx"), "utf8");

describe("explicit shipping order target", () => {
  it("explains an empty candidate list without presenting a loading or failed request as empty", () => {
    const creation = source.slice(
      source.indexOf("const orderCreationControl ="),
      source.indexOf("const orderCreationControl =") + 700,
    );
    expect(creation).toContain("!loading && !error && orderCandidates.length === 0");
    expect(creation).toContain("注文に使える商品がありません。");
    expect(creation).toContain("保管場所へ格納してください。");
    expect(creation).toContain('<a href="/workflow">商品の準備へ進む</a>');
  });
  it("leaves the completed order target when continuing to the next task", () => {
    const continuation = source.slice(
      source.indexOf("onContinue={"),
      source.indexOf("onEditShippingCatalog={", source.indexOf("onContinue={")),
    );
    expect(continuation).toContain('approvedScreen.stage === "complete"');
    expect(continuation).toContain('if (busy === null) window.location.assign("/shipping")');
    expect(continuation).not.toContain("await refresh()");
  });
  it("awaits query parameters after existing page authorization and rejects repeated values", () => {
    expect(page).toContain('requirePageSession(["owner", "inventory_manager", "shipping"])');
    expect(page).toContain("await searchParams");
    expect(page).toContain('typeof order === "string" ? order : ""');
    expect(page).toContain("requestedOrderId={requestedOrderId}");
  });
  it("initializes both creation state and ref consistently without changing no-query defaults", () => {
    expect(source).toContain("useState(canManage && requestedOrderId === undefined)");
    expect(source).toContain("useRef(canManage && requestedOrderId === undefined)");
    expect(source).toContain("useState<string | null>(requestedOrderId ?? null)");
    expect(source).toContain("useRef<string | null>(requestedOrderId ?? null)");
  });
  it("resolves targets only after filtering authorized tasks without bypassing deferred transitions", () => {
    const apply = source.slice(
      source.indexOf("const applyTaskResult ="),
      source.indexOf("const refresh =", source.indexOf("const applyTaskResult =")),
    );
    expect(apply).toContain("isFutureIso(entry.assignmentExpiresAt)");
    expect(apply).toContain(
      "!explicitOrderTargetRef.current || entry.orderId === requestedOrderId",
    );
    expect(apply).toContain("shouldDeferTaskResult(");
    expect(apply).toContain("clearPrivateForAutomaticTransition(transition)");
    expect(apply).toContain("taskRequestGate.current.isLatest(token)");
    expect(source).toContain("explicitOrderTarget && !task");
    expect(source).toContain("別の注文や新規登録は開いていません。");
  });
  it("releases the initial URL constraint only after an allowed explicit switch", () => {
    for (const [start, end] of [
      ["function selectOrder(", "function startNewOrder("],
      ["function startNewOrder(", "async function completePrivateMutationBeforeFollowUp"],
    ]) {
      const operation = source.slice(source.indexOf(start!), source.indexOf(end!));
      expect(operation.indexOf("assertOrderSwitchAllowed(")).toBeLessThan(
        operation.indexOf("explicitOrderTargetRef.current = false"),
      );
      expect(operation).toContain("setExplicitOrderTarget(false)");
      expect(operation).toContain("clearOrderScopeForSwitch(previous)");
      expect(operation.indexOf("assertOrderSwitchAllowed(")).toBeLessThan(
        operation.indexOf("window.history.replaceState("),
      );
    }
    expect(source).toContain(
      'window.history.replaceState(null, "", `/shipping?order=${encodeURIComponent(orderId)}`)',
    );
    expect(source).toContain('window.history.replaceState(null, "", "/shipping")');
  });
});
