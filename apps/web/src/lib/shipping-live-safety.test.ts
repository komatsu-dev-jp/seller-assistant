import { describe, expect, it, vi } from "vitest";

import {
  assertOrderSwitchAllowed,
  authorizeAndAcquireExecution,
  belongsToOrder,
  cancelMutationIfSessionExpired,
  canRecordShippingSale,
  classifyUploadAttempt,
  completeMutationBeforeFollowUp,
  decideShippingTaskTransition,
  handleSessionAuthorizationFailure,
  isFutureIso,
  isMutationAuthorized,
  isSessionAuthorizationFailure,
  mutationFingerprint,
  MutationBlockedError,
  MutationCoordinator,
  MutationKeyStore,
  MutationRetryRegistry,
  observeInitialPrivateRequest,
  parseMutationScope,
  PickerUploadQueue,
  pickerChangeDecision,
  pickerExecutionDecision,
  PrivateSessionGate,
  ReauthVisibilityGate,
  recoveryDecision,
  saleOccurredAtIso,
  scheduleExpiryRefresh,
  SensitiveShippingController,
  settleBeforeConflictRecovery,
  shippingPhotoChoiceAction,
  ShippingExecutionGate,
  ShippingPolicyRequestGate,
  ShippingTaskRequestGate,
  shouldClearOrderScopedState,
  shouldDeferTaskResult,
  shouldDiscardSnapshot,
  takeQueuedUploadForExecution,
  type MutationAuthorization,
  visibleAssignedLocationPhotoUrl,
} from "./shipping-live-safety";
import {
  isAllowedOrderShippingProxyPath,
  isAllowedShippingPhotoProxyPath,
  maxShippingPhotoBytes,
  privateNoStoreNoContentResponse,
  readShippingPhotoUpload,
} from "./workspace-proxy-request";
import type { ShippingPhotoUploadError } from "./workspace-proxy-request";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

describe("P13 live shipping safety helpers", () => {
  it("allows only exact shipping proxy paths and methods", () => {
    expect(isAllowedShippingPhotoProxyPath("GET", ["shipping-photo-policy"], uuid)).toBe(true);
    expect(isAllowedShippingPhotoProxyPath("PUT", ["shipping-photo-policy"], uuid)).toBe(true);
    expect(isAllowedShippingPhotoProxyPath("POST", ["shipping-photo-policy"], uuid)).toBe(false);
    expect(
      isAllowedShippingPhotoProxyPath("GET", ["orders", firstId, "shipping-photo-preflight"], uuid),
    ).toBe(true);
    expect(
      isAllowedShippingPhotoProxyPath("PUT", ["orders", firstId, "shipping-photo-preflight"], uuid),
    ).toBe(false);
    expect(
      isAllowedShippingPhotoProxyPath("POST", ["orders", firstId, "shipping-photos"], uuid),
    ).toBe(true);
    expect(
      isAllowedShippingPhotoProxyPath(
        "GET",
        ["orders", firstId, "shipping-photos", secondId, "content"],
        uuid,
      ),
    ).toBe(true);
    expect(
      isAllowedShippingPhotoProxyPath(
        "GET",
        ["orders", firstId, "shipping-photos", secondId, "unexpected"],
        uuid,
      ),
    ).toBe(false);
  });

  it("allows only the exact method and shape for P14 order and shipping paths", () => {
    expect(isAllowedOrderShippingProxyPath("GET", ["shipping-methods"], uuid)).toBe(true);
    expect(isAllowedOrderShippingProxyPath("POST", ["shipping-methods"], uuid)).toBe(true);
    expect(isAllowedOrderShippingProxyPath("PATCH", ["shipping-methods"], uuid)).toBe(false);
    expect(isAllowedOrderShippingProxyPath("GET", ["orders", firstId, "registration"], uuid)).toBe(
      true,
    );
    expect(
      isAllowedOrderShippingProxyPath("PATCH", ["orders", firstId, "registration"], uuid),
    ).toBe(true);
    expect(isAllowedOrderShippingProxyPath("POST", ["orders", firstId, "registration"], uuid)).toBe(
      false,
    );
    expect(
      isAllowedOrderShippingProxyPath("GET", ["orders", firstId, "shipping-method-options"], uuid),
    ).toBe(true);
    expect(
      isAllowedOrderShippingProxyPath(
        "POST",
        ["orders", firstId, "shipping-method-selections"],
        uuid,
      ),
    ).toBe(true);
    expect(
      isAllowedOrderShippingProxyPath("GET", ["orders", firstId, "shipping-readiness"], uuid),
    ).toBe(true);
    expect(
      isAllowedOrderShippingProxyPath(
        "POST",
        ["orders", firstId, "shipping-readiness-confirmations"],
        uuid,
      ),
    ).toBe(true);
    expect(
      isAllowedOrderShippingProxyPath(
        "GET",
        ["orders", firstId, "shipping-method-selections"],
        uuid,
      ),
    ).toBe(false);
    expect(
      isAllowedOrderShippingProxyPath(
        "POST",
        ["orders", firstId, "shipping-readiness", "extra"],
        uuid,
      ),
    ).toBe(false);
    expect(
      isAllowedOrderShippingProxyPath("GET", ["orders", "not-a-uuid", "shipping-readiness"], uuid),
    ).toBeNull();
  });

  it("shows a loaded assigned-location photo only for the exact live task binding", () => {
    const sourceUrl =
      `/v1/workspaces/${firstId}/orders/${secondId}/pick-location-photo/content` +
      `?inventoryUnitId=${firstId}&movementSequence=7`;
    const display = { orderId: secondId, sourceUrl, objectUrl: "blob:assigned-location" };
    const task = {
      orderId: secondId,
      locationPhotoUrl: sourceUrl,
      assignmentExpiresAt: "2099-08-30T00:00:00.000Z",
    };
    const now = Date.parse("2026-08-30T00:00:00.000Z");

    expect(visibleAssignedLocationPhotoUrl(display, task, true, now)).toBe(
      "blob:assigned-location",
    );
    expect(visibleAssignedLocationPhotoUrl(null, task, true, now)).toBeUndefined();
    expect(visibleAssignedLocationPhotoUrl(display, { ...task, orderId: firstId }, true, now)).toBe(
      undefined,
    );
    expect(
      visibleAssignedLocationPhotoUrl(
        display,
        { ...task, locationPhotoUrl: `${sourceUrl}0` },
        true,
        now,
      ),
    ).toBeUndefined();
    expect(visibleAssignedLocationPhotoUrl(display, task, false, now)).toBeUndefined();
    expect(
      visibleAssignedLocationPhotoUrl(
        display,
        { ...task, assignmentExpiresAt: "2026-08-30T00:00:00.000Z" },
        true,
        now,
      ),
    ).toBeUndefined();
    expect(
      visibleAssignedLocationPhotoUrl(
        display,
        { ...task, assignmentExpiresAt: null },
        true,
        now,
        true,
      ),
    ).toBe("blob:assigned-location");
  });

  it("authorizes manager creation and manager order work without a shipping assignment", () => {
    expect(parseMutationScope(`create:${firstId}`)).toEqual({
      scope: "creation",
      kind: "create",
      inventoryUnitId: firstId,
    });
    expect(
      isMutationAuthorized(`create:${firstId}`, {
        reauthVisible: true,
        currentOrderId: null,
        taskOrderId: null,
        assignmentExpiresAt: null,
        managerAccess: true,
      }),
    ).toBe(true);
    expect(
      isMutationAuthorized(`pick:${firstId}`, {
        reauthVisible: true,
        currentOrderId: firstId,
        taskOrderId: firstId,
        assignmentExpiresAt: null,
        managerAccess: true,
      }),
    ).toBe(true);
    expect(
      isMutationAuthorized(`pick:${firstId}`, {
        reauthVisible: true,
        currentOrderId: firstId,
        taskOrderId: firstId,
        assignmentExpiresAt: null,
      }),
    ).toBe(false);
  });

  it.each([
    `registration:${firstId}`,
    `shipping-method:${firstId}`,
    `shipping-readiness:${firstId}`,
  ])("authorizes the exact P14 order mutation scope %s", (slot) => {
    expect(parseMutationScope(slot)).toEqual({
      scope: "order",
      kind: slot.slice(0, slot.indexOf(":")),
      orderId: firstId,
    });
    expect(
      isMutationAuthorized(slot, {
        ...validAuthorization(),
        currentOrderId: firstId,
        taskOrderId: firstId,
      }),
    ).toBe(true);
    expect(
      isMutationAuthorized(slot, {
        ...validAuthorization(),
        currentOrderId: secondId,
        taskOrderId: secondId,
      }),
    ).toBe(false);
  });

  it("authorizes the shipping catalog only as a workspace-scoped mutation", () => {
    expect(parseMutationScope(`catalog:${uuid}`)).toEqual({
      scope: "workspace",
      kind: "catalog",
    });
    expect(parseMutationScope(`catalog:${uuid}:extra`)).toBeNull();
    expect(
      isMutationAuthorized(`catalog:${uuid}`, {
        reauthVisible: false,
        currentOrderId: null,
        taskOrderId: null,
        assignmentExpiresAt: null,
      }),
    ).toBe(true);
  });

  it("rejects every PUT except the exact policy route", () => {
    for (const segments of [
      ["orders", firstId, "pick"],
      ["orders", firstId, "pack"],
      ["orders", firstId, "ship"],
      ["orders", firstId, "address-leases"],
    ])
      expect(isAllowedShippingPhotoProxyPath("PUT", segments, uuid)).toBe(false);
  });

  it("accepts only bounded JPEG or PNG upload streams", async () => {
    const accepted = await readShippingPhotoUpload(
      streamRequest("image/jpeg", [new Uint8Array([1, 2])]),
    );
    expect(accepted.contentType).toBe("image/jpeg");
    expect(new Uint8Array(accepted.data)).toEqual(new Uint8Array([1, 2]));

    await expect(
      readShippingPhotoUpload(streamRequest("image/gif", [new Uint8Array([1])])),
    ).rejects.toMatchObject({ status: 400 } satisfies Partial<ShippingPhotoUploadError>);
    await expect(
      readShippingPhotoUpload(
        streamRequest("image/png", [new Uint8Array(maxShippingPhotoBytes + 1)]),
      ),
    ).rejects.toMatchObject({ status: 413 } satisfies Partial<ShippingPhotoUploadError>);
  });

  it("returns a private, empty 204 policy response without rewriting its status", () => {
    const response = privateNoStoreNoContentResponse();
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("limits sale entry and parses local date-time without assuming a timezone", () => {
    expect(canRecordShippingSale("owner")).toBe(true);
    expect(canRecordShippingSale("inventory_manager")).toBe(true);
    expect(canRecordShippingSale("shipping")).toBe(false);
    expect(saleOccurredAtIso("")).toBeNull();
    const localInput = "2026-08-30T12:34";
    expect(saleOccurredAtIso(localInput)).toBe(new Date(localInput).toISOString());
  });

  it("refreshes a stale choice when the current policy can decide it without an override", () => {
    expect(shippingPhotoChoiceAction("all", "present", "choice_required")).toBe("refresh");
    expect(shippingPhotoChoiceAction("all", "missing", "choice_required")).toBe("refresh");
    expect(shippingPhotoChoiceAction("disabled", "present", "choice_required")).toBe("refresh");
    expect(shippingPhotoChoiceAction("high_value_only", "present", "choice_required")).toBe(
      "refresh",
    );
    expect(shippingPhotoChoiceAction("high_value_only", "missing", "choice_required")).toBe(
      "choose",
    );
    expect(shippingPhotoChoiceAction(null, "present", "choice_required")).toBe("choose");
    expect(shippingPhotoChoiceAction(null, "missing", "choice_required")).toBe("choose");
    expect(shippingPhotoChoiceAction("all", "present", "capture_required")).toBe("none");
    expect(shippingPhotoChoiceAction("high_value_only", "present", "confirmed")).toBe("none");
  });

  it("refreshes at assignment expiry and treats the exact expiry as expired", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    scheduleExpiryRefresh(
      "2026-08-30T00:00:01.000Z",
      refresh,
      Date.parse("2026-08-30T00:00:00.000Z"),
    );
    vi.advanceTimersByTime(999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(isFutureIso("2026-08-30T00:00:01.000Z", Date.parse("2026-08-30T00:00:01.000Z"))).toBe(
      false,
    );
    vi.useRealTimers();
  });

  it("keeps a mutation key until that known operation is cleared", () => {
    const store = new MutationKeyStore();
    let count = 0;
    const create = () => `key-${++count}`;
    expect(store.get("upload:order:product", create)).toBe("key-1");
    expect(store.get("upload:order:product", create)).toBe("key-1");
    store.clear("upload:order:product");
    expect(store.get("upload:order:product", create)).toBe("key-2");
  });

  it("parses stable slots and authorizes policy independently from order assignment", () => {
    expect(parseMutationScope("policy:W")).toEqual({ scope: "workspace", kind: "policy" });
    expect(parseMutationScope("upload:A:product")).toEqual({
      scope: "order",
      kind: "upload",
      orderId: "A",
    });
    expect(parseMutationScope("upload:A:unexpected")).toBeNull();
    expect(parseMutationScope("unknown:A")).toBeNull();

    expect(isMutationAuthorized("policy:W", hiddenAuthorization())).toBe(true);
    expect(isMutationAuthorized("pack:A", hiddenAuthorization())).toBe(false);
    expect(isMutationAuthorized("pack:A", validAuthorization())).toBe(true);
    expect(isMutationAuthorized("pack:A", { ...validAuthorization(), currentOrderId: "B" })).toBe(
      false,
    );
    expect(
      isMutationAuthorized("pack:A", {
        ...validAuthorization(),
        assignmentExpiresAt: "2026-08-29T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it.each(["pack:A", "upload:A:product"])(
    "blocks %s retry while focus reauthorization is pending or failed, then sends exactly once",
    (slot) => {
      const coordinator = new MutationCoordinator();
      const executionGate = new ShippingExecutionGate();
      const exactFile = { name: "same.png", bytes: new Uint8Array([7, 8, 9]) };
      const first = coordinator.get(
        slot,
        "same-intent",
        () => "stable-key",
        (key) => ({ key, file: exactFile }),
      );
      coordinator.markUnknown(slot);
      let posts = 0;
      const attempt = (authorization: MutationAuthorization) => {
        coordinator.assertRunnable(slot);
        const token = authorizeAndAcquireExecution(executionGate, slot, authorization);
        posts += 1;
        executionGate.release(token);
      };

      expect(() => attempt(hiddenAuthorization())).toThrow(MutationBlockedError);
      // A failed GET leaves the same fail-closed authorization state in place.
      expect(() => attempt(hiddenAuthorization())).toThrow(MutationBlockedError);
      expect(posts).toBe(0);
      attempt(validAuthorization());
      expect(posts).toBe(1);
      const retry = coordinator.get(
        slot,
        "same-intent",
        () => "different-key",
        (key) => ({ key, file: { name: "different.png" } }),
      );
      expect(retry.key).toBe("stable-key");
      expect(retry.payload.file).toBe(exactFile);
      expect(retry.serialized).toBe(first.serialized);
    },
  );

  it("preserves unknown upload A through deferred task-zero/B and prioritizes A when it returns", () => {
    const coordinator = new MutationCoordinator();
    const registry = new MutationRetryRegistry();
    const executionGate = new ShippingExecutionGate();
    const reauthGate = new ReauthVisibilityGate();
    const slot = "upload:A:product";
    const exactFile = { name: "same.png", bytes: new Uint8Array([2, 4, 6]) };
    const active = authorizeAndAcquireExecution(executionGate, slot, validAuthorization());
    let currentOrderId: string | null = "A";
    let retryDisplay: { slot: string } | null = null;
    let pendingUpload: { operation: string; file: typeof exactFile } | null = {
      operation: slot,
      file: exactFile,
    };
    let privateState = {
      address: "private-address",
      preflight: "private-preflight",
      inventoryInput: "INV-A",
    };
    const first = coordinator.get(
      slot,
      "same-intent",
      () => "stable-key",
      (key) => ({ key, file: exactFile }),
    );

    // The expiry transition hides private DOM but defers clearing the slot
    // while the unresolved POST owns it.
    reauthGate.hide();
    expect(shouldDeferTaskResult(executionGate.busy, reauthGate.visible, "A", "A")).toBe(true);
    expect(shouldDeferTaskResult(executionGate.busy, reauthGate.visible, "A", null)).toBe(true);
    expect(reauthGate.visible).toBe(false);
    expect(coordinator.peek<typeof first.payload>(slot)?.payload.file).toBe(exactFile);
    expect(coordinator.peek(slot)?.key).toBe("stable-key");

    // The latest task-zero result is deferred while upload owns the execution
    // gate. It must be decided again after the network outcome is known.
    const deferredTaskIds: string[] = [];

    coordinator.markUnknown(slot);
    const retryAction = vi.fn(async () => undefined);
    registry.remember({ slot, label: "upload-product", action: retryAction });
    retryDisplay = { slot };
    executionGate.release(active);

    const applyTasks = (validOrderIds: string[]) => {
      const decision = decideShippingTaskTransition(
        currentOrderId,
        validOrderIds,
        coordinator.pendingSlot,
      );
      if (decision.orderChanged) {
        if (decision.clearOrderId) {
          coordinator.clearOrder(decision.clearOrderId);
          registry.clearOrder(decision.clearOrderId);
        }
        retryDisplay = retryDisplay?.slot === decision.preserveSlot ? retryDisplay : null;
        pendingUpload = pendingUpload?.operation === decision.preserveSlot ? pendingUpload : null;
        privateState = { address: "", preflight: "", inventoryInput: "" };
      }
      currentOrderId = decision.nextOrderId;
      if (currentOrderId) reauthGate.allowAfterValidAssignment();
      else reauthGate.hide();
      return decision;
    };

    const taskZero = applyTasks(deferredTaskIds);
    expect(taskZero).toMatchObject({
      previousOrderId: "A",
      nextOrderId: null,
      protectedOrderId: "A",
      preserveSlot: slot,
      clearOrderId: null,
    });
    expect(privateState).toEqual({ address: "", preflight: "", inventoryInput: "" });
    expect(coordinator.pendingSlot).toBe(slot);
    expect(coordinator.peek(slot)?.key).toBe(first.key);
    expect(coordinator.peek(slot)?.serialized).toBe(first.serialized);
    expect(pendingUpload?.file).toBe(exactFile);
    expect(registry.peek()?.action).toBe(retryAction);
    expect(retryDisplay).toEqual({ slot });

    const onlyB = applyTasks(["B"]);
    expect(onlyB.nextOrderId).toBe("B");
    expect(currentOrderId).toBe("B");
    expect(
      isMutationAuthorized(slot, {
        ...validAuthorization(),
        currentOrderId: "B",
        taskOrderId: "B",
      }),
    ).toBe(false);
    expect(() => coordinator.assertRunnable("pack:B")).toThrow(MutationBlockedError);

    let retryPosts = 0;
    const retry = () => {
      coordinator.assertRunnable(slot);
      const token = authorizeAndAcquireExecution(executionGate, slot, {
        ...validAuthorization(),
        currentOrderId,
        taskOrderId: currentOrderId,
        reauthVisible: reauthGate.visible,
      });
      const snapshot = coordinator.get(
        slot,
        "same-intent",
        () => "different-key",
        (key) => ({ key, file: { name: "different.png" } }),
      );
      retryPosts += 1;
      executionGate.release(token);
      return snapshot;
    };

    expect(() => retry()).toThrow(MutationBlockedError);
    expect(retryPosts).toBe(0);

    const aReturns = applyTasks(["B", "A"]);
    expect(aReturns.nextOrderId).toBe("A");
    expect(aReturns.clearOrderId).toBe("B");
    expect(currentOrderId).toBe("A");
    const retried = retry();
    expect(retryPosts).toBe(1);
    expect(retried.key).toBe(first.key);
    expect(retried.payload.file).toBe(exactFile);
    expect(retried.serialized).toBe(first.serialized);
    expect(registry.peek()?.action).toBe(retryAction);
  });

  it("discards a late old-A task result after a newer B result was deferred during execution", async () => {
    const requests = new ShippingTaskRequestGate();
    const executionGate = new ShippingExecutionGate();
    const reauthGate = new ReauthVisibilityGate();
    const active = authorizeAndAcquireExecution(executionGate, "pack:A", validAuthorization());
    const oldA = controlledPromise<"A">();
    const newB = controlledPromise<"B">();
    const oldToken = requests.begin();
    // Expiry/focus synchronously invalidates the old GET and hides the DOM
    // before the replacement request begins.
    requests.invalidate();
    reauthGate.hide();
    const newToken = requests.begin();
    const displayed: string[] = [];
    const observe = async (
      token: typeof newToken,
      result: Promise<"A" | "B">,
    ): Promise<{ token: typeof newToken; orderId: "B" } | null> => {
      const orderId = await result;
      if (!requests.isLatest(token)) return null;
      if (shouldDeferTaskResult(executionGate.busy, reauthGate.visible, "A", orderId)) {
        reauthGate.hide();
        return orderId === "B" ? { token, orderId } : null;
      }
      displayed.push(orderId);
      return null;
    };
    const observeOld = observe(oldToken, oldA.promise);
    const observeNew = observe(newToken, newB.promise);

    newB.resolve("B");
    const deferred = await observeNew;
    expect(reauthGate.visible).toBe(false);
    expect(displayed).toEqual([]);

    oldA.resolve("A");
    await observeOld;
    expect(displayed).toEqual([]);

    executionGate.release(active);
    if (deferred && requests.isLatest(deferred.token)) {
      displayed.push(deferred.orderId);
      reauthGate.allowAfterValidAssignment();
    }
    expect(displayed).toEqual(["B"]);
    expect(displayed).not.toContain("A");
    expect(reauthGate.visible).toBe(true);
  });

  it("blocks unknown File A from being overwritten by File B and retains A exactly", () => {
    const coordinator = new MutationCoordinator();
    const fileA = { name: "a.png", bytes: new Uint8Array([1, 2, 3]) };
    const fileB = { name: "b.png", bytes: new Uint8Array([4, 5, 6]) };
    const slot = "upload:A:product";
    const intentA = mutationFingerprint({ intentId: "file-a", name: fileA.name });
    const intentB = mutationFingerprint({ intentId: "file-b", name: fileB.name });
    const first = coordinator.get(
      slot,
      intentA,
      () => "stable-key",
      (key) => ({ key, file: fileA }),
    );
    coordinator.markUnknown(slot);

    expect(() =>
      coordinator.get(
        slot,
        intentB,
        () => "new-key",
        (key) => ({ key, file: fileB }),
      ),
    ).toThrow(MutationBlockedError);
    const retry = coordinator.get(
      slot,
      intentA,
      () => "new-key",
      (key) => ({ key, file: fileB }),
    );
    expect(retry.key).toBe("stable-key");
    expect(retry.payload.file).toBe(fileA);
    expect(retry.serialized).toBe(first.serialized);
  });

  it.each([
    ["sale:A", { amount: 1000 }, { amount: 2000 }],
    ["override:A", { choice: "use_photos" }, { choice: "skip_photos" }],
    ["policy:W", { threshold: 5000 }, { threshold: 6000 }],
  ])("blocks changed intent for %s while its result is unknown", (slot, firstIntent, changed) => {
    const coordinator = new MutationCoordinator();
    coordinator.get(
      slot,
      mutationFingerprint(firstIntent),
      () => "stable",
      (key) => ({
        key,
        ...firstIntent,
      }),
    );
    coordinator.markUnknown(slot);
    expect(() =>
      coordinator.get(
        slot,
        mutationFingerprint(changed),
        () => "new",
        (key) => ({
          key,
          ...changed,
        }),
      ),
    ).toThrow(MutationBlockedError);
    expect(coordinator.pendingSlot).toBe(slot);
  });

  it("requires a snapshot before unknown and refuses a different pending slot", () => {
    const coordinator = new MutationCoordinator();
    expect(() => coordinator.markUnknown("missing")).toThrow();
    coordinator.get(
      "A",
      "a",
      () => "a-key",
      (key) => ({ key }),
    );
    coordinator.get(
      "B",
      "b",
      () => "b-key",
      (key) => ({ key }),
    );
    coordinator.markUnknown("A");
    expect(() => coordinator.markUnknown("B")).toThrow(MutationBlockedError);
    expect(coordinator.pendingSlot).toBe("A");
  });

  it("keeps unknown A through B validation, address/lease gates, and target-only B settle", async () => {
    const coordinator = new MutationCoordinator();
    coordinator.get(
      "A",
      "a",
      () => "a-key",
      (key) => ({ key }),
    );
    coordinator.get(
      "B",
      "b",
      () => "b-key",
      (key) => ({ key }),
    );
    coordinator.markUnknown("A");

    const localValidation = () => {
      throw new Error("local validation");
    };
    expect(localValidation).toThrow("local validation");
    expect(() => coordinator.assertRunnable()).toThrow(MutationBlockedError);
    await expect(
      settleBeforeConflictRecovery(coordinator, "B", async () => {
        throw new Error("recovery GET failed");
      }),
    ).rejects.toThrow("recovery GET failed");
    expect(coordinator.pendingSlot).toBe("A");
    expect(coordinator.has("A")).toBe(true);
    expect(coordinator.has("B")).toBe(false);
  });

  it("settles every successful POST before a deferred follow-up GET", async () => {
    for (const slot of [
      "policy:W",
      "preflight:A",
      "override:A",
      "upload:A:product",
      "confirm:A",
      "sale:A",
      "pick:A",
      "pack:A",
      "ship:A",
    ]) {
      const coordinator = new MutationCoordinator();
      coordinator.get(
        slot,
        slot,
        () => `${slot}:key`,
        (key) => ({ key }),
      );
      let releaseFollowUp: (() => void) | undefined;
      const events: string[] = [];
      const pending = completeMutationBeforeFollowUp(
        async () => {
          events.push("post-2xx");
          return slot;
        },
        () => {
          coordinator.settle(slot);
          events.push("settled");
        },
        async () => {
          events.push("get-started");
          await new Promise<void>((resolve) => {
            releaseFollowUp = resolve;
          });
          events.push("get-finished");
        },
      );
      await vi.waitFor(() => expect(events).toEqual(["post-2xx", "settled", "get-started"]));
      expect(coordinator.has(slot)).toBe(false);
      releaseFollowUp?.();
      await pending;
      expect(events.at(-1)).toBe("get-finished");
    }
  });

  it("settles a pending policy PUT but skips every policy state follow-up after task 401", async () => {
    const coordinator = new MutationCoordinator();
    const sessionGate = new PrivateSessionGate();
    const slot = "policy:W";
    const response = controlledPromise<{ mode: string; revision: number }>();
    const sessionToken = sessionGate.capture();
    let policy: { mode: string; revision: number } | null = {
      mode: "high_value_only",
      revision: 1,
    };
    let notice = "old notice";
    let ownerPanelVisible = true;
    let fullClears = 0;
    let settleCalls = 0;
    let sendCalls = 0;
    const events: string[] = [];
    coordinator.get(
      slot,
      "policy-intent",
      () => "policy-key",
      (key) => ({ key, mode: "all" }),
    );
    const pending = completeMutationBeforeFollowUp(
      () => {
        sendCalls += 1;
        return response.promise;
      },
      () => {
        events.push("settle");
        settleCalls += 1;
        coordinator.settle(slot);
      },
      (saved) => {
        events.push("follow-up");
        policy = saved;
        notice = "saved";
      },
      () => {
        events.push("guard");
        return sessionGate.isCurrent(sessionToken);
      },
    );
    const clearSession = () => {
      if (!sessionGate.revoke()) return;
      fullClears += 1;
      coordinator.clearAll();
      policy = null;
      notice = "";
      ownerPanelVisible = false;
    };

    expect(handleSessionAuthorizationFailure(new TestStatusError(401), clearSession)).toBe(true);
    response.resolve({ mode: "all", revision: 2 });
    await pending;

    expect(events).toEqual(["guard", "settle", "guard"]);
    expect(sendCalls).toBe(1);
    expect(settleCalls).toBe(1);
    expect(coordinator.has(slot)).toBe(false);
    expect(fullClears).toBe(1);
    expect(policy).toBeNull();
    expect(notice).toBe("");
    expect(ownerPanelVisible).toBe(false);
    expect(sessionGate.authorized).toBe(false);
  });

  it("settles all nine revoked mutations with zero send and zero follow-up", async () => {
    for (const slot of [
      "policy:W",
      "preflight:A",
      "override:A",
      "upload:A:product",
      "confirm:A",
      "sale:A",
      "pick:A",
      "pack:A",
      "ship:A",
    ]) {
      const coordinator = new MutationCoordinator();
      const sessionGate = new PrivateSessionGate();
      const sessionToken = sessionGate.capture();
      const send = vi.fn(async () => slot);
      const followUp = vi.fn();
      const events: string[] = [];
      coordinator.get(
        slot,
        `${slot}-intent`,
        () => `${slot}-key`,
        (key) => ({ key }),
      );
      sessionGate.revoke();

      await completeMutationBeforeFollowUp(
        send,
        () => {
          events.push("settle");
          coordinator.settle(slot);
        },
        followUp,
        () => {
          events.push("guard");
          return sessionGate.isCurrent(sessionToken);
        },
      );

      expect(events).toEqual(["guard", "settle"]);
      expect(coordinator.has(slot)).toBe(false);
      expect(send).not.toHaveBeenCalled();
      expect(followUp).not.toHaveBeenCalled();
    }
  });

  it.each(["pick:A", "pack:A", "ship:A"])(
    "does not create a snapshot or POST %s when a controlled lease resolves after task 401",
    async (slot) => {
      const coordinator = new MutationCoordinator();
      const registry = new MutationRetryRegistry();
      const sessionGate = new PrivateSessionGate();
      const sessionToken = sessionGate.capture();
      const lease = controlledPromise<string>();
      let snapshotCreations = 0;
      let posts = 0;
      let settles = 0;
      const settle = () => {
        settles += 1;
        coordinator.settle(slot);
        registry.clear(slot);
      };
      const operation = async () => {
        if (cancelMutationIfSessionExpired(sessionGate, sessionToken, settle)) return;
        await lease.promise;
        if (cancelMutationIfSessionExpired(sessionGate, sessionToken, settle)) return;
        snapshotCreations += 1;
        coordinator.get(
          slot,
          `${slot}-intent`,
          () => `${slot}-key`,
          (key) => ({ key }),
        );
        posts += 1;
      };

      const pending = operation();
      expect(snapshotCreations).toBe(0);
      sessionGate.revoke();
      coordinator.clearAll();
      registry.clearAll();
      lease.resolve("lease-after-clear");
      await pending;

      expect(posts).toBe(0);
      expect(snapshotCreations).toBe(0);
      expect(settles).toBe(1);
      expect(coordinator.has(slot)).toBe(false);
      expect(registry.peek()).toBeNull();
    },
  );

  it("does not fetch or retain a File when its controlled read resolves after task 401", async () => {
    const coordinator = new MutationCoordinator();
    const registry = new MutationRetryRegistry();
    const sessionGate = new PrivateSessionGate();
    const sessionToken = sessionGate.capture();
    const fileRead = controlledPromise<ArrayBuffer>();
    const slot = "upload:A:product";
    const exactFile = { name: "same.png", arrayBuffer: () => fileRead.promise };
    let pendingFile: typeof exactFile | null = exactFile;
    let fetches = 0;
    let settles = 0;
    const settle = () => {
      settles += 1;
      coordinator.settle(slot);
      registry.clear(slot);
    };
    const operation = async () => {
      if (cancelMutationIfSessionExpired(sessionGate, sessionToken, settle)) return;
      expect(classifyUploadAttempt(coordinator, slot)).toBe("fresh");
      await exactFile.arrayBuffer();
      if (cancelMutationIfSessionExpired(sessionGate, sessionToken, settle)) return;
      coordinator.get(
        slot,
        "file-intent",
        () => "file-key",
        (key) => ({ key, file: exactFile }),
      );
      fetches += 1;
    };

    const pending = operation();
    expect(pendingFile).toBe(exactFile);
    expect(coordinator.has(slot)).toBe(false);
    sessionGate.revoke();
    coordinator.clearAll();
    registry.clearAll();
    pendingFile = null;
    fileRead.resolve(new ArrayBuffer(3));
    await pending;

    expect(fetches).toBe(0);
    expect(settles).toBe(1);
    expect(pendingFile).toBeNull();
    expect(coordinator.has(slot)).toBe(false);
    expect(registry.peek()).toBeNull();
  });

  it("drops a fresh File after local read rejection and allows a different File", async () => {
    const coordinator = new MutationCoordinator();
    const registry = new MutationRetryRegistry();
    const slot = "upload:A:product";
    const fileRead = controlledPromise<ArrayBuffer>();
    const fileA = { name: "a.png", arrayBuffer: () => fileRead.promise };
    const fingerprintA = mutationFingerprint({ intentId: "file-a", name: fileA.name });
    let pendingFile: typeof fileA | null = fileA;
    let fetches = 0;
    const operation = async () => {
      const attempt = classifyUploadAttempt(coordinator, slot);
      try {
        await fileA.arrayBuffer();
      } catch (reason) {
        if (attempt === "fresh") {
          coordinator.settle(slot);
          registry.clear(slot);
          pendingFile = null;
        }
        throw reason;
      }
      coordinator.get(
        slot,
        fingerprintA,
        () => "file-a-key",
        (key) => ({ key, file: fileA }),
      );
      fetches += 1;
    };

    const pending = operation().catch((reason: unknown) => reason);
    expect(coordinator.has(slot)).toBe(false);
    fileRead.reject(new Error("local File read failed"));
    await expect(pending).resolves.toMatchObject({ message: "local File read failed" });

    expect(fetches).toBe(0);
    expect(pendingFile).toBeNull();
    expect(coordinator.has(slot)).toBe(false);
    expect(coordinator.pendingSlot).toBeNull();
    expect(registry.peek()).toBeNull();
    const fileB = { name: "b.png" };
    const fingerprintB = mutationFingerprint({ intentId: "file-b", name: fileB.name });
    expect(() => coordinator.assertIntent(slot, fingerprintB)).not.toThrow();
    expect(classifyUploadAttempt(coordinator, slot)).toBe("fresh");
  });

  it("preserves the exact unknown retry when its original File read rejects", async () => {
    const coordinator = new MutationCoordinator();
    const registry = new MutationRetryRegistry();
    const slot = "upload:A:product";
    const fileRead = controlledPromise<ArrayBuffer>();
    const fileA = { name: "a.png", arrayBuffer: () => fileRead.promise };
    const fingerprintA = mutationFingerprint({ intentId: "file-a", name: fileA.name });
    const first = coordinator.get(
      slot,
      fingerprintA,
      () => "stable-file-key",
      (key) => ({ key, file: fileA }),
    );
    coordinator.markUnknown(slot);
    const retryAction = vi.fn(async () => undefined);
    registry.remember({ slot, label: "upload-product", action: retryAction });
    const retryDisplay = { slot, label: "upload-product" };
    let pendingFile: typeof fileA | null = fileA;
    let fetches = 0;
    const operation = async () => {
      const attempt = classifyUploadAttempt(coordinator, slot);
      const snapshot = coordinator.peek<typeof first.payload>(slot);
      expect(attempt).toBe("unknown_retry");
      try {
        await snapshot!.payload.file.arrayBuffer();
      } catch (reason) {
        if (attempt === "fresh") {
          coordinator.settle(slot);
          registry.clear(slot);
          pendingFile = null;
        }
        throw reason;
      }
      fetches += 1;
    };

    const pending = operation().catch((reason: unknown) => reason);
    fileRead.reject(new Error("retry File read failed"));
    await expect(pending).resolves.toMatchObject({ message: "retry File read failed" });

    expect(fetches).toBe(0);
    expect(pendingFile).toBe(fileA);
    expect(coordinator.pendingSlot).toBe(slot);
    expect(coordinator.peek<typeof first.payload>(slot)?.key).toBe(first.key);
    expect(coordinator.peek<typeof first.payload>(slot)?.payload.file).toBe(fileA);
    expect(coordinator.peek(slot)?.serialized).toBe(first.serialized);
    expect(registry.peek()).toMatchObject({ slot, action: retryAction });
    expect(retryDisplay).toEqual({ slot, label: "upload-product" });
    const fingerprintB = mutationFingerprint({ intentId: "file-b", name: "b.png" });
    expect(() => coordinator.assertIntent(slot, fingerprintB)).toThrow(MutationBlockedError);
  });

  it("retains a retry action after the ordinary pick button state disappears", async () => {
    const registry = new MutationRetryRegistry();
    const action = vi.fn(async () => undefined);
    registry.remember({ slot: "pick:A", label: "pick", action });
    const taskState = "picking";
    expect(taskState).toBe("picking");
    await registry.peek()?.action();
    expect(action).toHaveBeenCalledTimes(1);
    registry.clear("pick:A");
    expect(registry.peek()).toBeNull();
  });

  it("guards address and upload values by exact current order", () => {
    const addressA = { orderId: "A", value: "private A" };
    expect(belongsToOrder(addressA, "A")).toBe(true);
    expect(belongsToOrder(addressA, "B")).toBe(false);
    expect(shouldClearOrderScopedState("A", "B")).toBe(true);
    expect(shouldClearOrderScopedState("A", "A")).toBe(false);
  });

  it("rejects stale same-kind and different-order sensitive responses", () => {
    const controller = new SensitiveShippingController();
    const firstA = controller.begin("address", "A");
    const latestA = controller.begin("address", "A");
    expect(controller.isCurrent(firstA.token, "A")).toBe(false);
    expect(controller.isCurrent(latestA.token, "A")).toBe(true);
    expect(controller.isCurrent(latestA.token, "B")).toBe(false);
    const latestB = controller.begin("address", "B");
    expect(controller.isCurrent(latestA.token, "A")).toBe(false);
    expect(controller.isCurrent(latestB.token, "A")).toBe(false);
    expect(controller.isCurrent(latestB.token, "B")).toBe(true);
  });

  it("lets only the newest lease timer expire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T00:00:00Z"));
    const controller = new SensitiveShippingController();
    const expired = vi.fn();
    const first = controller.begin("lease", "A");
    controller.ownLeaseTimer(first.token, () => "A", "2026-08-30T00:00:02Z", expired);
    const latest = controller.begin("lease", "A");
    controller.ownLeaseTimer(latest.token, () => "A", "2026-08-30T00:00:03Z", expired);
    vi.advanceTimersByTime(2500);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(expired).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("queues picker File exactly once in the same hidden/visible turn", () => {
    const gate = new ReauthVisibilityGate();
    const queue = new PickerUploadQueue<{ orderId: string; intentId: string; file: string }>();
    let posts = 0;
    gate.hide();
    const pending = { orderId: "A", intentId: "file-a", file: "same-binary" };
    if (pickerChangeDecision(gate) === "queue") queue.queue(pending);
    expect(posts).toBe(0);

    gate.allowAfterValidAssignment();
    const first = queue.take("A");
    if (first) posts += 1;
    const duplicate = queue.take("A");
    if (duplicate) posts += 1;
    expect(first?.file).toBe("same-binary");
    expect(posts).toBe(1);
  });

  it("keeps a picker upload hidden with zero POST on network failure and clears on removal", () => {
    const gate = new ReauthVisibilityGate();
    const queue = new PickerUploadQueue<{ orderId: string; intentId: string }>();
    let posts = 0;
    gate.hide();
    queue.queue({ orderId: "A", intentId: "file-a" });
    // A failed reauthorization deliberately never calls allowAfterValidAssignment.
    if (pickerChangeDecision(gate) === "send") posts += 1;
    expect(posts).toBe(0);
    expect(gate.visible).toBe(false);
    queue.clear();
    expect(queue.peek()).toBeNull();
  });

  it.each(["upload:A:product", "policy:W"])(
    "blocks manual order selection during unknown %s without discarding its exact snapshot",
    (slot) => {
      const coordinator = new MutationCoordinator();
      const executionGate = new ShippingExecutionGate();
      const registry = new MutationRetryRegistry();
      const exactFile = { name: "same.png", bytes: new Uint8Array([1, 3, 5]) };
      const action = vi.fn(async () => undefined);
      const snapshot = coordinator.get(
        slot,
        "same-intent",
        () => "stable-key",
        (key) => ({ key, file: exactFile }),
      );
      coordinator.markUnknown(slot);
      registry.remember({ slot, label: "retry", action });

      expect(() => assertOrderSwitchAllowed(coordinator, executionGate)).toThrow(
        MutationBlockedError,
      );
      expect(snapshot.key).toBe("stable-key");
      expect(coordinator.pendingSlot).toBe(slot);
      expect(coordinator.peek<typeof snapshot.payload>(slot)?.key).toBe("stable-key");
      expect(coordinator.peek<typeof snapshot.payload>(slot)?.payload.file).toBe(exactFile);
      expect(registry.peek()?.action).toBe(action);
    },
  );

  it("allows manual order selection only after the unknown operation is explicitly settled", () => {
    const coordinator = new MutationCoordinator();
    const executionGate = new ShippingExecutionGate();
    coordinator.get(
      "pack:A",
      "same-intent",
      () => "stable-key",
      (key) => ({ key }),
    );
    coordinator.markUnknown("pack:A");
    expect(() => assertOrderSwitchAllowed(coordinator, executionGate)).toThrow(
      MutationBlockedError,
    );
    coordinator.settle("pack:A");
    expect(() => assertOrderSwitchAllowed(coordinator, executionGate)).not.toThrow();
  });

  it("returns to normal old-order clearing after an explicit outcome settles the unknown slot", () => {
    const coordinator = new MutationCoordinator();
    const registry = new MutationRetryRegistry();
    const action = vi.fn(async () => undefined);
    coordinator.get(
      "upload:A:product",
      "same-intent",
      () => "stable-key",
      (key) => ({ key, file: "same-file" }),
    );
    coordinator.markUnknown("upload:A:product");
    registry.remember({ slot: "upload:A:product", label: "upload", action });

    coordinator.settle("upload:A:product");
    registry.clear("upload:A:product");
    const transition = decideShippingTaskTransition("A", [], coordinator.pendingSlot);
    expect(transition).toMatchObject({
      preserveSlot: null,
      protectedOrderId: null,
      clearOrderId: "A",
      nextOrderId: null,
    });
    if (transition.clearOrderId) coordinator.clearOrder(transition.clearOrderId);
    expect(coordinator.pendingSlot).toBeNull();
    expect(coordinator.has("upload:A:product")).toBe(false);
    expect(registry.peek()).toBeNull();
  });

  it("keeps the exact workspace policy unknown when the latest task result is empty", () => {
    const coordinator = new MutationCoordinator();
    const registry = new MutationRetryRegistry();
    const requests = new ShippingTaskRequestGate();
    const action = vi.fn(async () => undefined);
    const policy = coordinator.get(
      "policy:W",
      "policy-intent",
      () => "policy-key",
      (key) => ({ key, threshold: 5000 }),
    );
    coordinator.get(
      "pack:A",
      "pack-intent",
      () => "pack-key",
      (key) => ({ key }),
    );
    coordinator.markUnknown("policy:W");
    registry.remember({ slot: "policy:W", label: "policy", action });

    const taskZero = requests.begin();
    const latestTasks: string[] = [];
    const transition = decideShippingTaskTransition("A", latestTasks, coordinator.pendingSlot);
    if (requests.isLatest(taskZero) && transition.clearOrderId) {
      coordinator.clearOrder(transition.clearOrderId);
      registry.clearOrder(transition.clearOrderId);
    }

    expect(transition).toMatchObject({
      nextOrderId: null,
      protectedOrderId: null,
      preserveSlot: "policy:W",
      clearOrderId: "A",
    });
    expect(coordinator.pendingSlot).toBe("policy:W");
    expect(coordinator.peek("policy:W")?.key).toBe("policy-key");
    expect(coordinator.peek("policy:W")?.serialized).toBe(policy.serialized);
    expect(coordinator.peek<{ key: string; threshold: number }>("policy:W")?.payload).toEqual({
      key: "policy-key",
      threshold: 5000,
    });
    expect(coordinator.has("pack:A")).toBe(false);
    expect(registry.peek()).toMatchObject({ slot: "policy:W", action });
  });

  it("defers a picker File behind policy execution and drains that exact File once", () => {
    const reauthGate = new ReauthVisibilityGate();
    const executionGate = new ShippingExecutionGate();
    const queue = new PickerUploadQueue<{
      orderId: string;
      intentId: string;
      operation: string;
      file: { name: string };
    }>();
    const policyToken = authorizeAndAcquireExecution(
      executionGate,
      "policy:W",
      hiddenAuthorization(),
    );
    const exactFile = { name: "same.png" };
    const pending = {
      orderId: "A",
      intentId: "file-a",
      operation: "upload:A:product",
      file: exactFile,
    };
    if (pickerExecutionDecision(reauthGate, executionGate, false) === "queue") {
      queue.queue(pending);
    }

    expect(
      takeQueuedUploadForExecution(queue, validAuthorization(), executionGate, false, null),
    ).toBeNull();
    expect(queue.peek()?.file).toBe(exactFile);

    executionGate.release(policyToken);
    const first = takeQueuedUploadForExecution(
      queue,
      validAuthorization(),
      executionGate,
      false,
      null,
    );
    const duplicate = takeQueuedUploadForExecution(
      queue,
      validAuthorization(),
      executionGate,
      false,
      null,
    );
    expect(first?.file).toBe(exactFile);
    expect(duplicate).toBeNull();
  });

  it("rejects a same-turn double mutation before the second action can POST", () => {
    const executionGate = new ShippingExecutionGate();
    let posts = 0;
    const click = () => {
      const token = authorizeAndAcquireExecution(executionGate, "pack:A", validAuthorization());
      posts += 1;
      return token;
    };
    const first = click();
    expect(() => click()).toThrow(MutationBlockedError);
    expect(posts).toBe(1);
    executionGate.release(first);
  });

  it.each([
    ["pick:A", 403],
    ["pack:A", 403],
    ["ship:A", 403],
    ["policy:W", 401],
  ])(
    "fully clears the session once when 409 recovery for %s returns %s",
    async (slot, recoveryStatus) => {
      const coordinator = new MutationCoordinator();
      const registry = new MutationRetryRegistry();
      const otherSlot = slot === "policy:W" ? "pack:A" : "policy:W";
      coordinator.get(
        slot,
        "target-intent",
        () => "target-key",
        (key) => ({ key }),
      );
      coordinator.get(
        otherSlot,
        "other-intent",
        () => "other-key",
        (key) => ({ key }),
      );
      registry.remember({ slot, label: "retry", action: async () => undefined });
      let fullClears = 0;
      let targetSettledBeforeClear = false;
      let privateState: Record<string, unknown> = {
        tasks: ["A"],
        policy: { mode: "high_value_only" },
        policyMode: "high_value_only",
        thresholdInput: "5000",
        ownerPanelVisible: true,
        address: "private",
        preflight: "private",
        input: "private",
        lease: "private",
        file: "private",
        retryDisplay: slot,
      };
      const clearSession = () => {
        fullClears += 1;
        targetSettledBeforeClear = !coordinator.has(slot);
        coordinator.clearAll();
        registry.clearAll();
        privateState = {};
      };

      try {
        await settleBeforeConflictRecovery(coordinator, slot, async () => {
          throw new TestStatusError(recoveryStatus);
        });
      } catch (reason) {
        expect(handleSessionAuthorizationFailure(reason, clearSession)).toBe(true);
      }

      expect(targetSettledBeforeClear).toBe(true);
      expect(fullClears).toBe(1);
      expect(privateState).toEqual({});
      expect(coordinator.pendingSlot).toBeNull();
      expect(coordinator.has(slot)).toBe(false);
      expect(coordinator.has(otherSlot)).toBe(false);
      expect(registry.peek()).toBeNull();
    },
  );

  it("discards a late policy 200 after the initial task request returns 401", async () => {
    const sessionGate = new PrivateSessionGate();
    const taskGate = new ShippingTaskRequestGate();
    const policyGate = new ShippingPolicyRequestGate();
    const taskRequest = controlledPromise<string[]>();
    const policyRequest = controlledPromise<{ mode: string; threshold: number }>();
    let tasks = ["server-rendered-order"];
    let policy: { mode: string; threshold: number } | null = {
      mode: "high_value_only",
      threshold: 5000,
    };
    let thresholdInput = "5000";
    let ownerPanelVisible = true;
    let fullClears = 0;
    let taskApplies = 0;
    let policyApplies = 0;
    const clearSession = () => {
      fullClears += 1;
      sessionGate.revoke();
      taskGate.invalidate();
      policyGate.invalidate();
      tasks = [];
      policy = null;
      thresholdInput = "";
      ownerPanelVisible = false;
    };
    const taskSession = sessionGate.capture();
    const taskToken = taskGate.begin();
    const policySession = sessionGate.capture();
    const policyToken = policyGate.begin();
    const handleInitialFailure = (reason: unknown) => {
      handleSessionAuthorizationFailure(reason, clearSession);
    };
    const observeTask = observeInitialPrivateRequest(
      taskRequest.promise.then((result) => {
        if (sessionGate.isCurrent(taskSession) && taskGate.isLatest(taskToken)) {
          tasks = result;
          taskApplies += 1;
        }
      }),
      handleInitialFailure,
    );
    const observePolicy = observeInitialPrivateRequest(
      policyRequest.promise.then((result) => {
        if (sessionGate.isCurrent(policySession) && policyGate.isLatest(policyToken)) {
          policy = result;
          thresholdInput = String(result.threshold);
          policyApplies += 1;
        }
      }),
      handleInitialFailure,
    );

    taskRequest.reject(new TestStatusError(401));
    await observeTask;
    policyRequest.resolve({ mode: "all", threshold: 9000 });
    await observePolicy;

    expect(fullClears).toBe(1);
    expect(tasks).toEqual([]);
    expect(policy).toBeNull();
    expect(thresholdInput).toBe("");
    expect(ownerPanelVisible).toBe(false);
    expect(taskApplies).toBe(0);
    expect(policyApplies).toBe(0);
    expect(sessionGate.authorized).toBe(false);
  });

  it("discards a late task 200 after the initial policy request returns 403", async () => {
    const sessionGate = new PrivateSessionGate();
    const taskGate = new ShippingTaskRequestGate();
    const policyGate = new ShippingPolicyRequestGate();
    const taskRequest = controlledPromise<string[]>();
    const policyRequest = controlledPromise<{ mode: string }>();
    let tasks = ["server-rendered-order"];
    let policy: { mode: string } | null = { mode: "high_value_only" };
    let ownerPanelVisible = true;
    let fullClears = 0;
    let taskApplies = 0;
    let policyApplies = 0;
    const clearSession = () => {
      fullClears += 1;
      sessionGate.revoke();
      taskGate.invalidate();
      policyGate.invalidate();
      tasks = [];
      policy = null;
      ownerPanelVisible = false;
    };
    const taskSession = sessionGate.capture();
    const taskToken = taskGate.begin();
    const policySession = sessionGate.capture();
    const policyToken = policyGate.begin();
    const handleInitialFailure = (reason: unknown) => {
      handleSessionAuthorizationFailure(reason, clearSession);
    };
    const observeTask = observeInitialPrivateRequest(
      taskRequest.promise.then((result) => {
        if (sessionGate.isCurrent(taskSession) && taskGate.isLatest(taskToken)) {
          tasks = result;
          taskApplies += 1;
        }
      }),
      handleInitialFailure,
    );
    const observePolicy = observeInitialPrivateRequest(
      policyRequest.promise.then((result) => {
        if (sessionGate.isCurrent(policySession) && policyGate.isLatest(policyToken)) {
          policy = result;
          policyApplies += 1;
        }
      }),
      handleInitialFailure,
    );

    policyRequest.reject(new TestStatusError(403));
    await observePolicy;
    taskRequest.resolve(["late-order"]);
    await observeTask;

    expect(fullClears).toBe(1);
    expect(tasks).toEqual([]);
    expect(policy).toBeNull();
    expect(ownerPanelVisible).toBe(false);
    expect(taskApplies).toBe(0);
    expect(policyApplies).toBe(0);
    expect(sessionGate.authorized).toBe(false);
  });

  it("applies normal parallel task and policy responses under the same private session", async () => {
    const sessionGate = new PrivateSessionGate();
    const taskGate = new ShippingTaskRequestGate();
    const policyGate = new ShippingPolicyRequestGate();
    const taskRequest = controlledPromise<string[]>();
    const policyRequest = controlledPromise<{ mode: string; threshold: number }>();
    let tasks: string[] = [];
    let policy: { mode: string; threshold: number } | null = null;
    let taskApplies = 0;
    let policyApplies = 0;
    const taskSession = sessionGate.capture();
    const taskToken = taskGate.begin();
    const policySession = sessionGate.capture();
    const policyToken = policyGate.begin();
    const unexpectedFailure = vi.fn();
    const observeTask = observeInitialPrivateRequest(
      taskRequest.promise.then((result) => {
        if (sessionGate.isCurrent(taskSession) && taskGate.isLatest(taskToken)) {
          tasks = result;
          taskApplies += 1;
        }
      }),
      unexpectedFailure,
    );
    const observePolicy = observeInitialPrivateRequest(
      policyRequest.promise.then((result) => {
        if (sessionGate.isCurrent(policySession) && policyGate.isLatest(policyToken)) {
          policy = result;
          policyApplies += 1;
        }
      }),
      unexpectedFailure,
    );

    policyRequest.resolve({ mode: "all", threshold: 9000 });
    taskRequest.resolve(["A"]);
    await Promise.all([observeTask, observePolicy]);

    expect(tasks).toEqual(["A"]);
    expect(policy).toEqual({ mode: "all", threshold: 9000 });
    expect(taskApplies).toBe(1);
    expect(policyApplies).toBe(1);
    expect(unexpectedFailure).not.toHaveBeenCalled();
    expect(sessionGate.authorized).toBe(true);
  });

  it.each([
    ["task 500 then policy 403", "task", 500, "policy", 403, 1],
    ["policy 500 then task 401", "policy", 500, "task", 401, 1],
    ["task 401 then policy 403", "task", 401, "policy", 403, 0],
  ] as const)(
    "observes initial %s independently and performs the full session clear exactly once",
    async (_label, firstKind, firstStatus, secondKind, secondStatus, expectedErrors) => {
      const sessionGate = new PrivateSessionGate();
      const taskGate = new ShippingTaskRequestGate();
      const policyGate = new ShippingPolicyRequestGate();
      const taskRequest = controlledPromise<void>();
      const policyRequest = controlledPromise<void>();
      const displayedErrors: number[] = [];
      let fullClears = 0;
      const clearSession = () => {
        if (!sessionGate.revoke()) return;
        fullClears += 1;
        taskGate.invalidate();
        policyGate.invalidate();
      };
      const handleInitialFailure = (reason: unknown) => {
        if (handleSessionAuthorizationFailure(reason, clearSession)) return;
        displayedErrors.push(reason instanceof TestStatusError ? reason.status : 0);
      };
      const observed = {
        task: observeInitialPrivateRequest(taskRequest.promise, handleInitialFailure),
        policy: observeInitialPrivateRequest(policyRequest.promise, handleInitialFailure),
      };
      const requests = { task: taskRequest, policy: policyRequest };

      requests[firstKind].reject(new TestStatusError(firstStatus));
      await observed[firstKind];
      requests[secondKind].reject(new TestStatusError(secondStatus));
      await observed[secondKind];

      expect(displayedErrors).toHaveLength(expectedErrors);
      if (expectedErrors === 1) expect(displayedErrors).toEqual([500]);
      expect(fullClears).toBe(1);
      expect(sessionGate.authorized).toBe(false);
    },
  );

  it("keeps the target 409 slot settled without a session full-clear when recovery returns 500", async () => {
    const coordinator = new MutationCoordinator();
    const registry = new MutationRetryRegistry();
    coordinator.get(
      "pack:A",
      "pack-intent",
      () => "pack-key",
      (key) => ({ key }),
    );
    coordinator.get(
      "policy:W",
      "policy-intent",
      () => "policy-key",
      (key) => ({ key }),
    );
    registry.remember({ slot: "policy:W", label: "policy", action: async () => undefined });
    let fullClears = 0;
    let recoveryError: unknown;
    try {
      await settleBeforeConflictRecovery(coordinator, "pack:A", async () => {
        throw new TestStatusError(500);
      });
    } catch (reason) {
      recoveryError = reason;
      handleSessionAuthorizationFailure(reason, () => {
        fullClears += 1;
        coordinator.clearAll();
        registry.clearAll();
      });
    }

    expect(isSessionAuthorizationFailure(recoveryError)).toBe(false);
    expect(fullClears).toBe(0);
    expect(coordinator.has("pack:A")).toBe(false);
    expect(coordinator.peek("policy:W")?.key).toBe("policy-key");
    expect(registry.peek()?.slot).toBe("policy:W");
  });

  it("uses explicit conflict and snapshot-discard decisions", () => {
    expect(isSessionAuthorizationFailure(new TestStatusError(401))).toBe(true);
    expect(isSessionAuthorizationFailure(new TestStatusError(403))).toBe(true);
    expect(isSessionAuthorizationFailure(new TestStatusError(500))).toBe(false);
    expect(recoveryDecision(409, "policy")).toBe("policy");
    expect(recoveryDecision(409, "order")).toBe("order");
    expect(recoveryDecision(401, "order")).toBe("clear");
    expect(shouldDiscardSnapshot(undefined)).toBe(false);
    expect(shouldDiscardSnapshot(500)).toBe(false);
    expect(shouldDiscardSnapshot(400)).toBe(true);
    expect(shouldDiscardSnapshot(409)).toBe(true);
    expect(shouldDiscardSnapshot(413)).toBe(true);
  });
});

function validAuthorization(): MutationAuthorization {
  return {
    reauthVisible: true,
    currentOrderId: "A",
    taskOrderId: "A",
    assignmentExpiresAt: "2099-08-30T00:00:00.000Z",
    now: Date.parse("2026-08-30T00:00:00.000Z"),
  };
}

function hiddenAuthorization(): MutationAuthorization {
  return { ...validAuthorization(), reauthVisible: false };
}

class TestStatusError extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

function controlledPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function streamRequest(
  contentType: string,
  chunks: Uint8Array[],
): Pick<Request, "body" | "headers"> {
  return {
    headers: new Headers({ "content-type": contentType }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  } as Pick<Request, "body" | "headers">;
}
