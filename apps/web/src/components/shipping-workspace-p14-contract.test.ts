import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { shippingApprovedScreen } from "../lib/shipping-approved-stage";

const source = readFileSync(resolve("apps/web/src/components/shipping-workspace.tsx"), "utf8");

describe("P14 approved shipping web contract", () => {
  it("creates from explicit unallocated product and inventory context without sending orderNumber", () => {
    const createStart = source.indexOf("async function createOrder()");
    const createEnd = source.indexOf("async function selectOrderShippingMethod", createStart);
    const create = source.slice(createStart, createEnd);

    expect(createStart).toBeGreaterThan(-1);
    expect(source).toContain("entry.orderId === null");
    expect(source).toContain('entry.inventoryStatus === "available"');
    expect(source).toContain('entry.workflowState === "listing_confirmed"');
    expect(create).toContain("entry.skuId === selectedSkuId");
    expect(create).toContain("entry.inventoryUnitId === selectedInventoryUnitId");
    expect(create).toContain("`/v1/workspaces/${workspaceId}/orders`");
    expect(create).toContain('method: "POST"');
    expect(create).not.toContain("orderNumber:");
    expect(create).toContain("sellingFeeMinor: null");
    expect(create).toContain("shippingCostMinor: null");
    expect(create).toContain("packagingCostMinor: null");
    expect(create).toContain("channelTransactionId: nullableText(transactionIdInput)");
    expect(create).toContain("buyerDisplayName: nullableText(buyerDisplayNameInput)");
    expect(create).toContain("pendingCreatedOrderId.current = created.orderId");
    expect(create).toContain("currentOrderId.current = created.orderId");
    expect(create).toContain("setSelectedOrderId(created.orderId)");
  });

  it("advances a successfully created and selected order directly to M35 without an extra PATCH", () => {
    const registrationStart = source.indexOf("async function saveOrderRegistration()");
    const createStart = source.indexOf("async function createOrder()");
    const createEnd = source.indexOf("async function selectOrderShippingMethod", createStart);
    const registration = source.slice(registrationStart, createStart);
    const create = source.slice(createStart, createEnd);
    const reviewedAt = create.indexOf("setRegistrationReviewedOrderId(created.orderId)");
    const selectedAt = create.indexOf("setSelectedOrderId(created.orderId)");
    const refreshAt = create.indexOf("await refresh()");

    expect(registrationStart).toBeGreaterThan(-1);
    expect(createStart).toBeGreaterThan(registrationStart);
    expect(reviewedAt).toBeGreaterThan(-1);
    expect(selectedAt).toBeGreaterThan(reviewedAt);
    expect(refreshAt).toBeGreaterThan(selectedAt);
    expect(create).toContain('method: "POST"');
    expect(create).not.toContain('method: "PATCH"');
    expect(registration).toContain('method: "PATCH"');
    expect(registration).toContain("expectedRevision: activeRegistration.revision");
    expect(
      shippingApprovedScreen({
        taskState: "confirmed",
        registrationReviewed: true,
        preflightState: null,
        packingHumanConfirmed: false,
        shippingMethodSelected: false,
        shippingReviewConfirmed: false,
        shipmentCompleted: false,
      }),
    ).toEqual({ stage: "pick", mobileScreen: 35, pcScreen: 30 });
  });

  it("loads creation candidates only for managers and makes address mode explicit", () => {
    const refreshStart = source.indexOf("const refresh = useCallback");
    const refreshEnd = source.indexOf("useEffect(() => {\n    refreshRef.current", refreshStart);
    const refresh = source.slice(refreshStart, refreshEnd);

    expect(refresh).toContain("canManage");
    expect(refresh).toContain("`/v1/workspaces/${workspaceId}/p0-items`");
    expect(source).toContain('aria-label="注文する商品"');
    expect(source).toContain('aria-label="注文に割り当てる在庫"');
    expect(source).toContain('aria-label="住所の扱い"');
    expect(source).toContain('<option value="anonymous">匿名（住所を保存しない）</option>');
    expect(source).toContain('<option value="stored">住所が必要（暗号化して保存）</option>');
    expect(source).toContain('task.addressMode === "anonymous"');
  });

  it("keeps approved mobile 37 review separate from mobile 38 shipment recording", () => {
    const primaryStart = source.indexOf("function runApprovedPrimary");
    const primaryEnd = source.indexOf("function showPreviousApprovedStep", primaryStart);
    const primary = source.slice(primaryStart, primaryEnd);

    const reviewStart = primary.indexOf('if (displayedApprovedStage === "review") {');
    const shipStart = primary.indexOf('if (displayedApprovedStage === "ship") {');
    const review = primary.slice(reviewStart, shipStart);
    const ship = primary.slice(shipStart);

    expect(reviewStart).toBeGreaterThan(-1);
    expect(shipStart).toBeGreaterThan(reviewStart);
    expect(review).toContain("confirmOrderShippingReadiness");
    expect(review).not.toContain("confirmShipment");
    expect(ship).toContain("confirmShipment");
    expect(source).toContain('? "内容を確認しました"');
    expect(source).toContain('? "発送を記録"');
  });

  it("never fetches private order registration for the shipping-only role", () => {
    const loadStart = source.indexOf("const loadShippingContext");
    const loadEnd = source.indexOf("const reloadCurrentPrivateContext", loadStart);
    const load = source.slice(loadStart, loadEnd);
    const registrationRequest = load.indexOf(
      "`/v1/workspaces/${workspaceId}/orders/${orderId}/registration`",
    );

    expect(load).toContain("canManage && nextReadiness.registrationRevision !== null");
    expect(registrationRequest).toBeGreaterThan(
      load.indexOf("canManage && nextReadiness.registrationRevision !== null"),
    );
    expect(load).toContain(
      'setBuyerDisplayNameInput(canManage ? (nextRegistration?.buyerDisplayName ?? "") : "")',
    );
  });

  it("clears every P14 private snapshot on session loss and order change", () => {
    const clearStart = source.indexOf("const clearShippingContextState");
    const clearEnd = source.indexOf("const clearAllMutations", clearStart);
    const clear = source.slice(clearStart, clearEnd);

    for (const reset of [
      "shippingContextAbort.current?.abort()",
      "setRegistration(null)",
      'setTransactionIdInput("")',
      'setBuyerDisplayNameInput("")',
      "setShippingMethods([])",
      "setReadiness(null)",
      "setShippingContextOrderId(null)",
    ]) {
      expect(clear).toContain(reset);
    }
    expect(source).toContain("clearShippingContextState();");
  });

  it("loads M35 location photos fail-closed and binds the DOM to the current live task", () => {
    expect(source).toContain("const sourceUrl = task?.locationPhotoUrl;");
    expect(source).toContain("if (!orderId || !sourceUrl || !sessionAuthorized || !reauthVisible)");
    expect(source).toContain('headers: { accept: "image/jpeg,image/png" }');
    expect(source).toContain("!response.ok ||");
    expect(source).toContain("setLocationPhotoDisplay({ orderId, sourceUrl, objectUrl });");
    expect(source).toContain("visibleAssignedLocationPhotoUrl(");
    expect(source).toContain("locationPhotoUrl={locationPhotoUrl}");
    expect(source).toContain("clearLocationPhotoDisplay();");
  });

  it("routes M35 confirmation inputs through one-time exact-match timestamps", () => {
    const controlStart = source.indexOf("const pickVerificationControl");
    const controlEnd = source.indexOf("const policySaveControl", controlStart);
    const control = source.slice(controlStart, controlEnd);
    const handlerStart = source.indexOf("function handleApprovedFieldChange");
    const handlerEnd = source.indexOf("function runApprovedPrimary", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);
    const switchStart = source.indexOf("const clearOrderScopeForSwitch");
    const switchEnd = source.indexOf("const clearPrivateForAutomaticTransition", switchStart);
    const orderSwitch = source.slice(switchStart, switchEnd);
    const sessionClearStart = source.indexOf("const clearSessionState");
    const sessionClearEnd = source.indexOf(
      "const clearIfSessionAuthorizationFailed",
      sessionClearStart,
    );
    const sessionClear = source.slice(sessionClearStart, sessionClearEnd);
    const automaticTransitionStart = source.indexOf("const clearPrivateForAutomaticTransition");
    const automaticTransitionEnd = source.indexOf("const operationBody", automaticTransitionStart);
    const automaticTransition = source.slice(automaticTransitionStart, automaticTransitionEnd);
    const pickStart = source.indexOf("async function pick()");
    const pickEnd = source.indexOf("async function confirmPacking", pickStart);
    const pick = source.slice(pickStart, pickEnd);

    expect(control).toContain('handleApprovedFieldChange("inventoryNumber", event.target.value)');
    expect(control).toContain('handleApprovedFieldChange("locationCode", event.target.value)');
    expect(control).not.toContain("setInventoryInput(event.target.value");
    expect(control).not.toContain("setLocationInput(event.target.value");
    expect(handler).toContain(
      'normalized === task?.inventoryNumber ? current || new Date().toISOString() : ""',
    );
    expect(handler).toContain(
      'normalized === task?.locationCode ? current || new Date().toISOString() : ""',
    );
    expect(pick).toContain("inventoryScannedAt: inventoryConfirmedAt");
    expect(pick).toContain("locationScannedAt: locationConfirmedAt");
    expect(pick).toContain("inventoryScannedAt: intent.inventoryScannedAt");
    expect(pick).toContain("locationScannedAt: intent.locationScannedAt");
    expect(pick).toContain("confirmedAt: new Date().toISOString()");
    expect(pick).not.toContain("Date.now()");
    expect(pick).not.toMatch(/new Date\(now \+ \d\)/u);
    for (const clearScope of [orderSwitch, sessionClear, automaticTransition]) {
      expect(clearScope).toContain('setInventoryConfirmedAt("")');
      expect(clearScope).toContain('setLocationConfirmedAt("")');
    }
  });

  it("sends the new shipment evidence only as one all-or-none triple", () => {
    const shipmentStart = source.indexOf("async function confirmShipment");
    const shipmentEnd = source.indexOf("const uploadControls", shipmentStart);
    const shipment = source.slice(shipmentStart, shipmentEnd);

    expect(shipment).toContain("intent.shippingMethodSelectionId &&");
    expect(shipment).toContain("intent.readinessConfirmationId &&");
    expect(shipment).toContain("intent.shippedAt");
    expect(shipment).toContain("shippingMethodSelectionId: intent.shippingMethodSelectionId");
    expect(shipment).toContain("readinessConfirmationId: intent.readinessConfirmationId");
    expect(shipment).toContain("shippedAt: intent.shippedAt");
    expect(shipment).toContain("satisfies ShipOrderRequest");
  });
});
