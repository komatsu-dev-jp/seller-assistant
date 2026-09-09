import { describe, expect, it } from "vitest";

import {
  assignedLocationPhotoContentQuerySchema,
  confirmOrderShippingReadinessRequestSchema,
  createOrderRequestSchema,
  orderRegistrationResponseSchema,
  orderShippingReadinessResponseSchema,
  saveShippingMethodRequestSchema,
  selectOrderShippingMethodRequestSchema,
  shipOrderRequestSchema,
  shippingTaskResponseSchema,
} from "./index.js";

const baseOrder = {
  skuId: "00000000-0000-4000-8000-000000000001",
  inventoryUnitId: "00000000-0000-4000-8000-000000000002",
  saleAmountMinor: null,
  costAmountMinor: 1_000,
  sellingFeeMinor: null,
  shippingCostMinor: null,
  packagingCostMinor: null,
  taxBasis: "unknown" as const,
  sourceMeaning: "本人が注文情報を確認",
  occurredAt: "2026-08-31T00:00:00.000Z",
  addressMode: "stored" as const,
  shippingAddress: "架空の配送先",
  idempotencyKey: "00000000-0000-4000-8000-000000000003",
  humanConfirmed: true as const,
};

describe("P14 order registration and shipping contracts", () => {
  it("requires a product title and a nullable order-scoped location photo URL", () => {
    const locationPhotoUrl =
      "/v1/workspaces/00000000-0000-4000-8000-000000000010/orders/00000000-0000-4000-8000-000000000001/pick-location-photo/content?inventoryUnitId=00000000-0000-4000-8000-000000000002&movementSequence=7";
    const task = {
      orderId: "00000000-0000-4000-8000-000000000001",
      orderNumber: "ORD-20260831-000001",
      productTitle: "架空の発送商品",
      state: "confirmed" as const,
      inventoryNumber: "INV-000123-8",
      inventoryUnitId: "00000000-0000-4000-8000-000000000002",
      skuId: "00000000-0000-4000-8000-000000000003",
      locationCode: "BX-014-3-2",
      locationPhotoUrl,
      addressMode: "stored" as const,
      inventoryLabelVersion: 1,
      locationLabelVersion: 1,
      assignmentExpiresAt: "2026-08-31T01:00:00.000Z",
    };
    expect(shippingTaskResponseSchema.safeParse(task).success).toBe(true);
    const missingProductTitle: Record<string, unknown> = { ...task };
    delete missingProductTitle.productTitle;
    expect(shippingTaskResponseSchema.safeParse(missingProductTitle).success).toBe(false);
    const missingLocationPhotoUrl: Record<string, unknown> = { ...task };
    delete missingLocationPhotoUrl.locationPhotoUrl;
    expect(shippingTaskResponseSchema.safeParse(missingLocationPhotoUrl).success).toBe(false);
    expect(shippingTaskResponseSchema.safeParse({ ...task, locationPhotoUrl: null }).success).toBe(
      true,
    );
    expect(
      shippingTaskResponseSchema.safeParse({
        ...task,
        locationPhotoUrl:
          "https://example.test/v1/workspaces/00000000-0000-4000-8000-000000000010/locations/secret/photo",
      }).success,
    ).toBe(false);
    expect(
      shippingTaskResponseSchema.safeParse({
        ...task,
        locationPhotoUrl: locationPhotoUrl.replace(task.inventoryUnitId, task.skuId),
      }).success,
    ).toBe(false);
    expect(
      assignedLocationPhotoContentQuerySchema.parse({
        inventoryUnitId: task.inventoryUnitId,
        movementSequence: "7",
      }),
    ).toEqual({ inventoryUnitId: task.inventoryUnitId, movementSequence: 7 });
    expect(
      assignedLocationPhotoContentQuerySchema.safeParse({
        inventoryUnitId: task.inventoryUnitId,
        movementSequence: "7",
        locationId: "00000000-0000-4000-8000-000000000011",
      }).success,
    ).toBe(false);
  });

  it("supports server-numbered orders only with a required sales channel", () => {
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        channelTransactionId: null,
        buyerDisplayName: null,
      }).success,
    ).toBe(true);
    expect(createOrderRequestSchema.safeParse(baseOrder).success).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        shippingCostMinor: 210,
      }).success,
    ).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        sellingFeeMinor: 0,
      }).success,
    ).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        packagingCostMinor: 0,
      }).success,
    ).toBe(false);
  });

  it("requires coherent explicit anonymous and stored address modes", () => {
    const registered = {
      ...baseOrder,
      salesChannelKey: "mercari",
      salesChannelName: "メルカリ",
    };
    expect(
      createOrderRequestSchema.safeParse({
        ...registered,
        addressMode: "anonymous",
        shippingAddress: null,
      }).success,
    ).toBe(true);
    expect(
      createOrderRequestSchema.safeParse({
        ...registered,
        addressMode: "anonymous",
      }).success,
    ).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({
        ...registered,
        shippingAddress: null,
      }).success,
    ).toBe(false);
    const missingMode: Record<string, unknown> = { ...registered };
    delete missingMode.addressMode;
    expect(createOrderRequestSchema.safeParse(missingMode).success).toBe(false);
  });

  it("keeps the legacy client-numbered order request compatible", () => {
    const legacyWithoutMode = { ...baseOrder } as Record<string, unknown>;
    delete legacyWithoutMode.addressMode;
    const parsedLegacy = createOrderRequestSchema.safeParse({
      ...legacyWithoutMode,
      orderNumber: "ORDER-LEGACY-1",
      sellingFeeMinor: 500,
      shippingCostMinor: 750,
      packagingCostMinor: 100,
    });
    expect(parsedLegacy.success).toBe(true);
    if (parsedLegacy.success) expect(parsedLegacy.data.addressMode).toBe("stored");
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        orderNumber: "ORDER-REGISTERED-1",
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        shippingCostMinor: 750,
      }).success,
    ).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        orderNumber: "ORDER-LEGACY-2",
        sellingFeeMinor: 500,
        packagingCostMinor: 100,
      }).success,
    ).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        orderNumber: "ORDER-LEGACY-3",
        sellingFeeMinor: null,
        shippingCostMinor: 750,
        packagingCostMinor: 100,
      }).success,
    ).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        orderNumber: "ORDER-LEGACY-4",
        sellingFeeMinor: 500,
        shippingCostMinor: 750,
        packagingCostMinor: null,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown order and catalog fields", () => {
    expect(
      createOrderRequestSchema.safeParse({
        ...baseOrder,
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        externalFetch: true,
      }).success,
    ).toBe(false);
    expect(
      saveShippingMethodRequestSchema.safeParse({
        methodId: null,
        expectedRevision: null,
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        methodName: "ネコポス",
        trackingAvailable: true,
        feeMinor: 210,
        deliveryEstimate: "1〜2日",
        officialCheckedOn: "2026-08-26",
        officialReferenceUrl: "https://example.test/official-fee",
        officialReferenceNote: null,
        active: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000004",
        humanConfirmed: true,
        automaticallyFetched: true,
      }).success,
    ).toBe(false);
  });

  it("requires a human-managed official reference and coherent catalog revisions", () => {
    const method = {
      methodId: null,
      expectedRevision: null,
      salesChannelKey: "mercari",
      salesChannelName: "メルカリ",
      methodName: "ネコポス",
      trackingAvailable: true,
      feeMinor: 210,
      deliveryEstimate: null,
      officialCheckedOn: "2026-08-26",
      officialReferenceUrl: null,
      officialReferenceNote: "公式画面を本人が確認",
      active: true,
      idempotencyKey: "00000000-0000-4000-8000-000000000005",
      humanConfirmed: true as const,
    };
    expect(saveShippingMethodRequestSchema.safeParse(method).success).toBe(true);
    expect(
      saveShippingMethodRequestSchema.safeParse({
        ...method,
        officialReferenceNote: null,
      }).success,
    ).toBe(false);
    expect(
      saveShippingMethodRequestSchema.safeParse({
        ...method,
        methodId: "00000000-0000-4000-8000-000000000006",
      }).success,
    ).toBe(false);
  });

  it("requires exact unique missing-information acknowledgement and explicit method selection", () => {
    expect(
      selectOrderShippingMethodRequestSchema.safeParse({
        methodId: "00000000-0000-4000-8000-000000000006",
        expectedSelectionRevision: null,
        idempotencyKey: "00000000-0000-4000-8000-000000000007",
        humanConfirmed: true,
      }).success,
    ).toBe(true);
    expect(
      confirmOrderShippingReadinessRequestSchema.safeParse({
        expectedRegistrationRevision: 1,
        expectedSelectionRevision: 1,
        acknowledgedMissingInformation: ["channel_transaction_id", "sale_amount"],
        idempotencyKey: "00000000-0000-4000-8000-000000000008",
        humanConfirmed: true,
      }).success,
    ).toBe(true);
    expect(
      confirmOrderShippingReadinessRequestSchema.safeParse({
        expectedRegistrationRevision: 1,
        expectedSelectionRevision: 1,
        acknowledgedMissingInformation: ["sale_amount", "sale_amount"],
        idempotencyKey: "00000000-0000-4000-8000-000000000008",
        humanConfirmed: true,
      }).success,
    ).toBe(false);
  });

  it("keeps P14 shipment evidence all-or-none while preserving legacy ship requests", () => {
    const legacy = {
      addressLeaseId: null,
      idempotencyKey: "00000000-0000-4000-8000-000000000009",
      humanConfirmed: true as const,
    };
    expect(shipOrderRequestSchema.safeParse(legacy).success).toBe(true);
    expect(
      shipOrderRequestSchema.safeParse({
        ...legacy,
        shippingMethodSelectionId: "00000000-0000-4000-8000-000000000010",
      }).success,
    ).toBe(false);
    expect(
      shipOrderRequestSchema.safeParse({
        ...legacy,
        shippingMethodSelectionId: "00000000-0000-4000-8000-000000000010",
        readinessConfirmationId: "00000000-0000-4000-8000-000000000011",
        shippedAt: "2026-08-31T01:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("keeps buyer, sale amount, cost, profit, tax and setting actors out of shipping readiness", () => {
    const payload = {
      orderId: "00000000-0000-4000-8000-000000000012",
      orderNumber: "ORD-20260831-000001",
      registrationRevision: 1,
      salesChannel: { key: "mercari", name: "メルカリ" },
      channelTransactionIdStatus: "missing",
      saleAmountStatus: "missing",
      selectedMethod: null,
      missingInformation: ["channel_transaction_id", "sale_amount"],
      blockingIssues: ["shipping_method"],
      humanConfirmation: { state: "required", confirmationId: null, confirmedAt: null },
    };
    expect(orderShippingReadinessResponseSchema.safeParse(payload).success).toBe(true);
    expect(
      orderShippingReadinessResponseSchema.safeParse({
        ...payload,
        registrationRevision: null,
        salesChannel: null,
        channelTransactionIdStatus: "unregistered",
        blockingIssues: ["order_registration", "shipping_method"],
      }).success,
    ).toBe(true);
    const missingRevision: Record<string, unknown> = { ...payload };
    delete missingRevision.registrationRevision;
    expect(orderShippingReadinessResponseSchema.safeParse(missingRevision).success).toBe(false);
    for (const forbidden of [
      "buyerDisplayName",
      "saleAmountMinor",
      "costAmountMinor",
      "profitMinor",
      "taxBasis",
      "changedBy",
    ]) {
      expect(
        orderShippingReadinessResponseSchema.safeParse({ ...payload, [forbidden]: "hidden" })
          .success,
      ).toBe(false);
    }
  });

  it("keeps full registration details in the management-only response", () => {
    expect(
      orderRegistrationResponseSchema.safeParse({
        orderId: "00000000-0000-4000-8000-000000000012",
        orderNumber: "ORD-20260831-000001",
        registrationRevisionId: "00000000-0000-4000-8000-000000000013",
        salesChannelKey: "mercari",
        salesChannelName: "メルカリ",
        channelTransactionId: null,
        buyerDisplayName: null,
        revision: 1,
        supersedesRevisionId: null,
        changedAt: "2026-08-31T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
