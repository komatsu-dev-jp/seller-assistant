"use client";

import type {
  CreateOrderRequest,
  OrderRegistrationResponse,
  OrderOperationResponse,
  OrderShippingMethodSelectionResponse,
  OrderShippingReadinessResponse,
  PackOrderRequest,
  P0ItemResponse,
  SaveShippingMethodRequest,
  ShipOrderRequest,
  ShippingMethodCatalogResponse,
  ShippingMethodOptionResponse,
  ShippingPhotoAssetResponse,
  ShippingPhotoPolicyMode,
  ShippingPhotoPolicyResponse,
  ShippingPhotoPreflightResponse,
  ShippingTaskResponse,
} from "@resale/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  mutationFingerprint,
  MutationCoordinator,
  MutationBlockedError,
  MutationRetryRegistry,
  observeInitialPrivateRequest,
  parseMutationScope,
  PickerUploadQueue,
  pickerExecutionDecision,
  PrivateSessionGate,
  ReauthVisibilityGate,
  ShippingExecutionGate,
  ShippingPolicyRequestGate,
  ShippingTaskRequestGate,
  SensitiveShippingController,
  saleOccurredAtIso,
  scheduleExpiryRefresh,
  settleBeforeConflictRecovery,
  shippingPhotoChoiceAction,
  shouldDiscardSnapshot,
  shouldDeferTaskResult,
  takeQueuedUploadForExecution,
  visibleAssignedLocationPhotoUrl,
  type AssignedLocationPhotoDisplay,
  type MutationAuthorization,
  type PrivateSessionToken,
  type ShippingExecutionToken,
  type ShippingRole,
  type ShippingTaskRequestToken,
  type ShippingTaskTransitionDecision,
} from "../lib/shipping-live-safety";
import { shippingApprovedScreen, type ShippingApprovedStage } from "../lib/shipping-approved-stage";
import {
  ShippingApprovedLiveLayout,
  type ShippingField,
  type ShippingPhotoState,
} from "./shipping-approved-live-layout-v3";
import liveStyles from "./shipping-approved-live-layout.module.css";
import { LogoutButton } from "./logout-button";

type PhotoRole = "product" | "packed_package";
type PendingUpload = {
  file: File;
  role: PhotoRole;
  operation: string;
  orderId: string;
  intentId: string;
  fingerprint: string;
};
type UploadSnapshotPayload = { orderId: string; file: File; query: string };
type AddressLease = { orderId: string; leaseId: string; expiresAt: string };
type AddressLeaseResponse = { leaseId: string; expiresAt: string };
type ScopedAddress = { orderId: string; value: string };
type RetryDisplay = { slot: string; label: string };
type CompletedShipmentSnapshot = {
  orderId: string;
  orderNumber: string;
  methodName: string | null;
  feeMinor: number | null;
  shippedAt: string;
  assignmentLabel: string;
};
type ShippingCatalogDraft = {
  methodId: string | null;
  expectedRevision: number | null;
  salesChannelKey: string;
  salesChannelName: string;
  methodName: string;
  feeYen: string;
  deliveryEstimate: string;
  officialCheckedOn: string;
  officialReferenceNote: string;
  trackingAvailable: boolean;
  active: boolean;
};

function emptyShippingCatalogDraft(
  defaultSalesChannelKey = "",
  defaultSalesChannelName = "",
): ShippingCatalogDraft {
  return {
    methodId: null,
    expectedRevision: null,
    salesChannelKey: defaultSalesChannelKey,
    salesChannelName: defaultSalesChannelName,
    methodName: "",
    feeYen: "",
    deliveryEstimate: "",
    officialCheckedOn: "",
    officialReferenceNote: "",
    trackingAvailable: true,
    active: true,
  };
}

function shippingCatalogDraftFromEntry(entry: ShippingMethodCatalogResponse): ShippingCatalogDraft {
  return {
    methodId: entry.methodId,
    expectedRevision: entry.revision,
    salesChannelKey: entry.salesChannelKey,
    salesChannelName: entry.salesChannelName,
    methodName: entry.methodName,
    feeYen: String(entry.feeMinor),
    deliveryEstimate: entry.deliveryEstimate ?? "",
    officialCheckedOn: entry.officialCheckedOn,
    officialReferenceNote: entry.officialReferenceNote ?? "",
    trackingAvailable: entry.trackingAvailable,
    active: entry.active,
  };
}

function shippingPolicyModeForReadOnly(
  preflight: ShippingPhotoPreflightResponse | null,
): ShippingPhotoPolicyMode | undefined {
  if (preflight?.decisionReason === "policy_all") return "all";
  if (preflight?.decisionReason === "policy_disabled") return "disabled";
  if (
    preflight?.decisionReason === "threshold_met" ||
    preflight?.decisionReason === "threshold_below" ||
    preflight?.decisionReason === "sale_amount_missing"
  ) {
    return "high_value_only";
  }
  return undefined;
}

export function ShippingWorkspace({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: ShippingRole;
}) {
  const canManage = canRecordShippingSale(role);
  const isOwner = role === "owner";
  const [tasks, setTasks] = useState<ShippingTaskResponse[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(canManage);
  const [orderCandidates, setOrderCandidates] = useState<P0ItemResponse[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [selectedInventoryUnitId, setSelectedInventoryUnitId] = useState("");
  const [newOrderAddressMode, setNewOrderAddressMode] = useState<
    "" | CreateOrderRequest["addressMode"]
  >("");
  const [newOrderShippingAddress, setNewOrderShippingAddress] = useState("");
  const [newOrderSaleAmountInput, setNewOrderSaleAmountInput] = useState("");
  const [newOrderOccurredAt, setNewOrderOccurredAt] = useState(() => new Date().toISOString());
  const [policy, setPolicy] = useState<ShippingPhotoPolicyResponse | null>(null);
  const [policyMode, setPolicyMode] = useState<ShippingPhotoPolicyMode>("high_value_only");
  const [thresholdInput, setThresholdInput] = useState("");
  const [preflight, setPreflight] = useState<ShippingPhotoPreflightResponse | null>(null);
  const [preflightError, setPreflightError] = useState("");
  const [registration, setRegistration] = useState<OrderRegistrationResponse | null>(null);
  const [registrationReviewedOrderId, setRegistrationReviewedOrderId] = useState<string | null>(
    null,
  );
  const [salesChannelKey, setSalesChannelKey] = useState("");
  const [salesChannelName, setSalesChannelName] = useState("");
  const [transactionIdInput, setTransactionIdInput] = useState("");
  const [buyerDisplayNameInput, setBuyerDisplayNameInput] = useState("");
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodOptionResponse[]>([]);
  const [shippingCatalog, setShippingCatalog] = useState<ShippingMethodCatalogResponse[]>([]);
  const [shippingCatalogDraft, setShippingCatalogDraft] = useState<ShippingCatalogDraft>(() =>
    emptyShippingCatalogDraft(),
  );
  const [shippingCatalogOpen, setShippingCatalogOpen] = useState(false);
  const [shippingCatalogLoading, setShippingCatalogLoading] = useState(false);
  const [shippingCatalogError, setShippingCatalogError] = useState("");
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState("");
  const [readiness, setReadiness] = useState<OrderShippingReadinessResponse | null>(null);
  const [shippingContextOrderId, setShippingContextOrderId] = useState<string | null>(null);
  const [shippingContextError, setShippingContextError] = useState("");
  const [shippingOccurredAtInput, setShippingOccurredAtInput] = useState("");
  const [completedShipment, setCompletedShipment] = useState<CompletedShipmentSnapshot | null>(
    null,
  );
  const [approvedViewStage, setApprovedViewStage] = useState<ShippingApprovedStage | null>(null);
  const [inventoryInput, setInventoryInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [inventoryConfirmedAt, setInventoryConfirmedAt] = useState("");
  const [locationConfirmedAt, setLocationConfirmedAt] = useState("");
  const [locationPhotoDisplay, setLocationPhotoDisplay] =
    useState<AssignedLocationPhotoDisplay | null>(null);
  const [lease, setLease] = useState<AddressLease | null>(null);
  const [address, setAddress] = useState<ScopedAddress | null>(null);
  const [saleAmountInput, setSaleAmountInput] = useState("");
  const [saleMeaning, setSaleMeaning] = useState("");
  const [saleOccurredAt, setSaleOccurredAt] = useState("");
  const [saleConfirmed, setSaleConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [retryDisplay, setRetryDisplay] = useState<RetryDisplay | null>(null);
  const [reauthVisible, setReauthVisible] = useState(true);
  const [sessionAuthorized, setSessionAuthorized] = useState(true);
  const [executionRevision, setExecutionRevision] = useState(0);
  const mutations = useRef(new MutationCoordinator());
  const retryRegistry = useRef(new MutationRetryRegistry());
  const executionGate = useRef(new ShippingExecutionGate());
  const preflightAbort = useRef<AbortController | null>(null);
  const preflightGeneration = useRef(0);
  const shippingContextAbort = useRef<AbortController | null>(null);
  const shippingContextGeneration = useRef(0);
  const taskRequestGate = useRef(new ShippingTaskRequestGate());
  const policyRequestGate = useRef(new ShippingPolicyRequestGate());
  const privateSessionGate = useRef(new PrivateSessionGate());
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const sensitive = useRef(new SensitiveShippingController());
  const reauthGate = useRef(new ReauthVisibilityGate());
  const pickerActive = useRef(false);
  const pickerNeedsReauth = useRef(false);
  const queuedUpload = useRef(new PickerUploadQueue<PendingUpload>());
  const deferredTaskResult = useRef<{
    token: ShippingTaskRequestToken;
    result: ShippingTaskResponse[];
  } | null>(null);
  const revalidateRef = useRef<() => void>(() => undefined);
  const currentOrderId = useRef<string | null>(null);
  const creatingOrderRef = useRef(canManage);
  const pendingCreatedOrderId = useRef<string | null>(null);
  const locationPhotoAbort = useRef<AbortController | null>(null);
  const locationPhotoGeneration = useRef(0);
  const locationPhotoObjectUrl = useRef<string | null>(null);

  const task = creatingOrder
    ? null
    : selectedOrderId
      ? (tasks.find((entry) => entry.orderId === selectedOrderId) ?? null)
      : (tasks[0] ?? null);
  const activePreflight = preflight?.orderId === task?.orderId ? preflight : null;
  const activePendingUpload = belongsToOrder(pendingUpload, task?.orderId ?? null)
    ? pendingUpload
    : null;
  const visibleAddress = belongsToOrder(address, task?.orderId ?? null) ? address?.value : null;
  const renderAuthorization: MutationAuthorization = {
    reauthVisible,
    currentOrderId: currentOrderId.current,
    taskOrderId: task?.orderId ?? null,
    assignmentExpiresAt: task?.assignmentExpiresAt ?? null,
    managerAccess: canManage,
  };
  const retryAuthorized = retryDisplay
    ? isMutationAuthorized(retryDisplay.slot, renderAuthorization)
    : false;
  const currentConfirmed = useMemo(
    () => hasCurrentConfirmation(activePreflight),
    [activePreflight],
  );
  const photoChoiceAction = shippingPhotoChoiceAction(
    policy?.mode ?? null,
    activePreflight?.saleAmountStatus ?? null,
    activePreflight?.state ?? null,
  );
  const activeRegistration = shippingContextOrderId === task?.orderId ? registration : null;
  const activeReadiness = shippingContextOrderId === task?.orderId ? readiness : null;
  const activeShippingMethods = shippingContextOrderId === task?.orderId ? shippingMethods : [];
  const activeCompletedShipment =
    completedShipment?.orderId === task?.orderId ? completedShipment : null;
  const p14ShippingRequired = activeReadiness?.registrationRevision != null;
  const registrationReviewed =
    role === "shipping" ||
    (shippingContextOrderId === task?.orderId && activeRegistration === null) ||
    registrationReviewedOrderId === task?.orderId;
  const approvedScreen = shippingApprovedScreen({
    taskState: task?.state ?? null,
    registrationReviewed,
    preflightState: activePreflight?.state ?? null,
    packingHumanConfirmed: activePreflight?.packingHumanConfirmed === true,
    shippingMethodSelected:
      !p14ShippingRequired ||
      (activeReadiness?.selectedMethod != null &&
        !activeReadiness.blockingIssues.includes("shipping_method")),
    shippingReviewConfirmed:
      !p14ShippingRequired || activeReadiness?.humanConfirmation.state === "confirmed",
    shipmentCompleted: activeCompletedShipment !== null,
  });
  const displayedApprovedStage = approvedViewStage ?? approvedScreen.stage;

  const releaseLocationPhotoObjectUrl = useCallback(() => {
    if (!locationPhotoObjectUrl.current) return;
    URL.revokeObjectURL(locationPhotoObjectUrl.current);
    locationPhotoObjectUrl.current = null;
  }, []);

  const clearLocationPhotoDisplay = useCallback(() => {
    locationPhotoGeneration.current += 1;
    locationPhotoAbort.current?.abort();
    locationPhotoAbort.current = null;
    releaseLocationPhotoObjectUrl();
    setLocationPhotoDisplay(null);
  }, [releaseLocationPhotoObjectUrl]);

  const clearLease = useCallback(() => {
    setLease(null);
    setAddress(null);
  }, []);

  const clearShippingContextState = useCallback(() => {
    shippingContextAbort.current?.abort();
    shippingContextAbort.current = null;
    shippingContextGeneration.current += 1;
    setRegistration(null);
    setRegistrationReviewedOrderId(null);
    setSalesChannelKey("");
    setSalesChannelName("");
    setTransactionIdInput("");
    setBuyerDisplayNameInput("");
    setShippingMethods([]);
    setSelectedShippingMethodId("");
    setReadiness(null);
    setShippingContextOrderId(null);
    setShippingContextError("");
    setShippingOccurredAtInput("");
    setApprovedViewStage(null);
  }, []);

  const clearAllMutations = useCallback(() => {
    mutations.current.clearAll();
    retryRegistry.current.clearAll();
    setRetryDisplay(null);
  }, []);

  const settleOperation = useCallback((slot: string) => {
    mutations.current.settle(slot);
    retryRegistry.current.clear(slot);
    setRetryDisplay((current) => (current?.slot === slot ? null : current));
  }, []);

  const clearSessionState = useCallback(() => {
    if (!privateSessionGate.current.revoke()) return;
    sensitive.current.invalidate();
    taskRequestGate.current.invalidate();
    policyRequestGate.current.invalidate();
    preflightAbort.current?.abort();
    preflightAbort.current = null;
    preflightGeneration.current += 1;
    deferredTaskResult.current = null;
    clearAllMutations();
    setSessionAuthorized(false);
    setError("");
    setNotice("");
    setPolicy(null);
    setPolicyMode("high_value_only");
    setThresholdInput("");
    setShippingCatalog([]);
    setShippingCatalogDraft(emptyShippingCatalogDraft());
    setShippingCatalogOpen(false);
    setShippingCatalogLoading(false);
    setShippingCatalogError("");
    currentOrderId.current = null;
    setTasks([]);
    setSelectedOrderId(null);
    creatingOrderRef.current = canManage;
    pendingCreatedOrderId.current = null;
    setCreatingOrder(canManage);
    setOrderCandidates([]);
    setSelectedSkuId("");
    setSelectedInventoryUnitId("");
    setNewOrderAddressMode("");
    setNewOrderShippingAddress("");
    setNewOrderSaleAmountInput("");
    setNewOrderOccurredAt(new Date().toISOString());
    setPreflight(null);
    setPreflightError("");
    setPendingUpload(null);
    queuedUpload.current.clear();
    setInventoryInput("");
    setLocationInput("");
    setInventoryConfirmedAt("");
    setLocationConfirmedAt("");
    setSaleAmountInput("");
    setSaleMeaning("");
    setSaleOccurredAt("");
    setSaleConfirmed(false);
    clearLocationPhotoDisplay();
    clearShippingContextState();
    setCompletedShipment(null);
    setReauthVisible(reauthGate.current.hide());
    clearLease();
  }, [
    canManage,
    clearAllMutations,
    clearLease,
    clearLocationPhotoDisplay,
    clearShippingContextState,
  ]);

  const clearIfSessionAuthorizationFailed = useCallback(
    (reason: unknown) => handleSessionAuthorizationFailure(reason, clearSessionState),
    [clearSessionState],
  );

  const clearOrderScopeForSwitch = useCallback(
    (oldOrderId: string | null) => {
      sensitive.current.invalidate();
      preflightAbort.current?.abort();
      preflightAbort.current = null;
      preflightGeneration.current += 1;
      if (oldOrderId) {
        mutations.current.clearOrder(oldOrderId);
        retryRegistry.current.clearOrder(oldOrderId);
        setRetryDisplay((current) => {
          if (!current) return current;
          const scope = parseMutationScope(current.slot);
          return scope?.scope === "order" && scope.orderId === oldOrderId ? null : current;
        });
      }
      setPreflight(null);
      setPreflightError("");
      setPendingUpload(null);
      queuedUpload.current.clear();
      setInventoryInput("");
      setLocationInput("");
      setInventoryConfirmedAt("");
      setLocationConfirmedAt("");
      setSaleAmountInput("");
      setSaleMeaning("");
      setSaleOccurredAt("");
      setSaleConfirmed(false);
      clearLocationPhotoDisplay();
      clearShippingContextState();
      setCompletedShipment(null);
      clearLease();
    },
    [clearLease, clearLocationPhotoDisplay, clearShippingContextState],
  );

  const clearPrivateForAutomaticTransition = useCallback(
    (decision: ShippingTaskTransitionDecision) => {
      sensitive.current.invalidate();
      preflightAbort.current?.abort();
      preflightAbort.current = null;
      preflightGeneration.current += 1;
      if (decision.clearOrderId) {
        mutations.current.clearOrder(decision.clearOrderId);
        retryRegistry.current.clearOrder(decision.clearOrderId);
      }
      setRetryDisplay((current) => (current?.slot === decision.preserveSlot ? current : null));
      setPreflight(null);
      setPreflightError("");
      setPendingUpload((current) =>
        current?.operation === decision.preserveSlot ? current : null,
      );
      queuedUpload.current.clear();
      setInventoryInput("");
      setLocationInput("");
      setInventoryConfirmedAt("");
      setLocationConfirmedAt("");
      setSaleAmountInput("");
      setSaleMeaning("");
      setSaleOccurredAt("");
      setSaleConfirmed(false);
      clearLocationPhotoDisplay();
      clearShippingContextState();
      clearLease();
    },
    [clearLease, clearLocationPhotoDisplay, clearShippingContextState],
  );

  const operationBody = useCallback(
    <T,>(operation: string, fingerprint: string, create: (key: string) => T) => {
      const snapshot = mutations.current.get(
        operation,
        fingerprint,
        () => crypto.randomUUID(),
        create,
      );
      return snapshot.serialized;
    },
    [],
  );

  const loadPolicy = useCallback(async () => {
    if (!isOwner || !privateSessionGate.current.authorized) return;
    const sessionToken = privateSessionGate.current.capture();
    const requestToken = policyRequestGate.current.begin();
    const result = await requestOptionalJson<ShippingPhotoPolicyResponse>(
      `/v1/workspaces/${workspaceId}/shipping-photo-policy`,
    );
    if (
      !privateSessionGate.current.isCurrent(sessionToken) ||
      !policyRequestGate.current.isLatest(requestToken)
    )
      return;
    setPolicy(result);
    if (result) {
      setPolicyMode(result.mode);
      setThresholdInput(
        result.highValueThresholdMinor ? String(result.highValueThresholdMinor) : "",
      );
    } else {
      // 初期表示だけ。保存されるまでDBにはpolicyが存在しない。
      setPolicyMode("high_value_only");
      setThresholdInput("");
    }
  }, [isOwner, workspaceId]);

  const loadShippingCatalog = useCallback(async () => {
    if (!isOwner || !privateSessionGate.current.authorized) return;
    const sessionToken = privateSessionGate.current.capture();
    setShippingCatalogLoading(true);
    setShippingCatalogError("");
    try {
      const result = await requestJson<ShippingMethodCatalogResponse[]>(
        `/v1/workspaces/${workspaceId}/shipping-methods`,
      );
      if (!privateSessionGate.current.isCurrent(sessionToken)) return;
      setShippingCatalog(result);
    } catch (reason) {
      if (clearIfSessionAuthorizationFailed(reason)) {
        void refreshRef
          .current()
          .catch((refreshReason: unknown) => setError(errorMessage(refreshReason)));
        return;
      }
      if (privateSessionGate.current.isCurrent(sessionToken)) {
        setShippingCatalogError(errorMessage(reason));
      }
    } finally {
      if (privateSessionGate.current.isCurrent(sessionToken)) setShippingCatalogLoading(false);
    }
  }, [clearIfSessionAuthorizationFailed, isOwner, workspaceId]);

  const loadPreflight = useCallback(
    async (orderId: string | null) => {
      preflightAbort.current?.abort();
      const generation = ++preflightGeneration.current;
      setPreflight(null);
      setPreflightError("");
      if (!orderId) {
        return;
      }
      const controller = new AbortController();
      preflightAbort.current = controller;
      try {
        const result = await requestJson<ShippingPhotoPreflightResponse>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photo-preflight`,
          { signal: controller.signal },
        );
        if (generation !== preflightGeneration.current || result.orderId !== orderId) return;
        setPreflight(result);
      } catch (reason) {
        if (controller.signal.aborted || generation !== preflightGeneration.current) return;
        if (clearIfSessionAuthorizationFailed(reason)) {
          void refreshRef
            .current()
            .catch((refreshReason: unknown) => setError(errorMessage(refreshReason)));
          return;
        }
        setPreflight(null);
        setPreflightError(errorMessage(reason));
      }
    },
    [clearIfSessionAuthorizationFailed, workspaceId],
  );

  const loadShippingContext = useCallback(
    async (orderId: string | null) => {
      shippingContextAbort.current?.abort();
      const generation = ++shippingContextGeneration.current;
      setShippingContextError("");
      if (!orderId || !privateSessionGate.current.authorized) return;
      const sessionToken = privateSessionGate.current.capture();
      const controller = new AbortController();
      shippingContextAbort.current = controller;
      try {
        const [methods, nextReadiness] = await Promise.all([
          requestJson<ShippingMethodOptionResponse[]>(
            `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-method-options`,
            { signal: controller.signal },
          ),
          requestJson<OrderShippingReadinessResponse>(
            `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-readiness`,
            { signal: controller.signal },
          ),
        ]);
        const nextRegistration =
          canManage && nextReadiness.registrationRevision !== null
            ? await requestJson<OrderRegistrationResponse>(
                `/v1/workspaces/${workspaceId}/orders/${orderId}/registration`,
                { signal: controller.signal },
              )
            : null;
        if (
          controller.signal.aborted ||
          generation !== shippingContextGeneration.current ||
          !privateSessionGate.current.isCurrent(sessionToken) ||
          currentOrderId.current !== orderId
        ) {
          return;
        }
        setRegistration(nextRegistration);
        setSalesChannelKey(
          nextRegistration?.salesChannelKey ?? nextReadiness.salesChannel?.key ?? "",
        );
        setSalesChannelName(
          nextRegistration?.salesChannelName ?? nextReadiness.salesChannel?.name ?? "",
        );
        setTransactionIdInput(nextRegistration?.channelTransactionId ?? "");
        setBuyerDisplayNameInput(canManage ? (nextRegistration?.buyerDisplayName ?? "") : "");
        setShippingMethods(methods);
        setReadiness(nextReadiness);
        setSelectedShippingMethodId(
          nextReadiness.selectedMethod?.method.methodId ?? methods[0]?.methodId ?? "",
        );
        setShippingContextOrderId(orderId);
      } catch (reason) {
        if (controller.signal.aborted || generation !== shippingContextGeneration.current) return;
        if (clearIfSessionAuthorizationFailed(reason)) {
          void refreshRef
            .current()
            .catch((refreshReason: unknown) => setError(errorMessage(refreshReason)));
          return;
        }
        setShippingContextError(errorMessage(reason));
      }
    },
    [canManage, clearIfSessionAuthorizationFailed, workspaceId],
  );

  const reloadCurrentPrivateContext = useCallback(async () => {
    const orderId = currentOrderId.current;
    if (!orderId || !reauthGate.current.visible) return;
    await Promise.all([loadPreflight(orderId), loadShippingContext(orderId)]);
  }, [loadPreflight, loadShippingContext]);

  const hideAssignmentForRevalidation = useCallback(() => {
    // Invalidate every older task GET before hiding. The current mutation
    // snapshot/File remains owned by run until an explicit result is known.
    taskRequestGate.current.invalidate();
    sensitive.current.invalidate();
    preflightAbort.current?.abort();
    preflightAbort.current = null;
    preflightGeneration.current += 1;
    setReauthVisible(reauthGate.current.hide());
    setPreflight(null);
    setPreflightError("");
    clearLocationPhotoDisplay();
    clearShippingContextState();
    clearLease();
  }, [clearLease, clearLocationPhotoDisplay, clearShippingContextState]);

  const applyTaskResult = useCallback(
    (result: ShippingTaskResponse[], token: ShippingTaskRequestToken) => {
      if (!taskRequestGate.current.isLatest(token)) return;
      const validTasks = result.filter(
        (entry) =>
          (canManage && entry.assignmentExpiresAt === null) ||
          (entry.assignmentExpiresAt !== null && isFutureIso(entry.assignmentExpiresAt)),
      );
      if (canManage && creatingOrderRef.current) {
        setTasks(validTasks);
        setReauthVisible(reauthGate.current.allowAfterValidAssignment());
        return;
      }
      const previous = currentOrderId.current;
      const transition = decideShippingTaskTransition(
        previous,
        validTasks.map((entry) => entry.orderId),
        mutations.current.pendingSlot,
      );
      const { nextOrderId } = transition;
      if (
        shouldDeferTaskResult(
          executionGate.current.busy,
          reauthGate.current.visible,
          previous,
          nextOrderId,
        )
      ) {
        // Do not clear the snapshot or File owned by the active operation. Hide
        // the old order now, then apply the server-confirmed switch after release.
        deferredTaskResult.current = { token, result };
        setReauthVisible(reauthGate.current.hide());
        return;
      }
      deferredTaskResult.current = null;
      if (transition.orderChanged) clearPrivateForAutomaticTransition(transition);
      currentOrderId.current = nextOrderId;
      setSelectedOrderId(nextOrderId);
      setTasks(validTasks);
      if (pendingCreatedOrderId.current === nextOrderId) pendingCreatedOrderId.current = null;
      setReauthVisible(
        nextOrderId ? reauthGate.current.allowAfterValidAssignment() : reauthGate.current.hide(),
      );
    },
    [canManage, clearPrivateForAutomaticTransition],
  );

  useEffect(() => {
    if (executionGate.current.busy) return;
    const deferred = deferredTaskResult.current;
    if (!deferred) return;
    if (!taskRequestGate.current.isLatest(deferred.token)) {
      deferredTaskResult.current = null;
      return;
    }
    deferredTaskResult.current = null;
    applyTaskResult(deferred.result, deferred.token);
  }, [applyTaskResult, executionRevision]);

  const refresh = useCallback(
    async (options?: { signal?: AbortSignal; isCurrent?: () => boolean }) => {
      if (!privateSessionGate.current.authorized) return;
      const sessionToken = privateSessionGate.current.capture();
      const token = taskRequestGate.current.begin();
      const [result, candidates] = await Promise.all([
        requestJson<ShippingTaskResponse[]>(`/v1/workspaces/${workspaceId}/shipping-tasks`, {
          signal: options?.signal ?? null,
        }),
        canManage
          ? requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`, {
              signal: options?.signal ?? null,
            })
          : Promise.resolve(null),
      ]);
      if (
        !privateSessionGate.current.isCurrent(sessionToken) ||
        !taskRequestGate.current.isLatest(token) ||
        options?.isCurrent?.() === false
      )
        return;
      if (candidates) {
        setOrderCandidates(
          candidates.filter(
            (entry) =>
              entry.orderId === null &&
              entry.inventoryStatus === "available" &&
              entry.workflowState === "listing_confirmed",
          ),
        );
      }
      applyTaskResult(result, token);
    },
    [applyTaskResult, canManage, workspaceId],
  );

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    setLoading(true);
    const handleInitialFailure = (reason: unknown) => {
      if (clearIfSessionAuthorizationFailed(reason)) return;
      setError(errorMessage(reason));
    };
    const taskRequest = observeInitialPrivateRequest(refresh(), handleInitialFailure);
    const policyRequest = observeInitialPrivateRequest(loadPolicy(), handleInitialFailure);
    void Promise.all([taskRequest, policyRequest]).finally(() => setLoading(false));
  }, [clearIfSessionAuthorizationFailed, loadPolicy, refresh]);

  useEffect(() => {
    const orderId = task?.orderId ?? null;
    if (
      !creatingOrder &&
      task === null &&
      selectedOrderId !== null &&
      pendingCreatedOrderId.current === selectedOrderId
    ) {
      return;
    }
    if (currentOrderId.current !== orderId) {
      const transition = decideShippingTaskTransition(
        currentOrderId.current,
        orderId ? [orderId] : [],
        mutations.current.pendingSlot,
      );
      if (transition.orderChanged) clearPrivateForAutomaticTransition(transition);
      currentOrderId.current = orderId;
    }
    sensitive.current.invalidate();
    void loadPreflight(orderId);
    void loadShippingContext(orderId);
    setInventoryInput("");
    setLocationInput("");
    setInventoryConfirmedAt("");
    setLocationConfirmedAt("");
    clearLease();
    setSaleAmountInput("");
    setSaleMeaning("");
    setSaleOccurredAt("");
    setSaleConfirmed(false);
    setPendingUpload((current) =>
      current?.operation === mutations.current.pendingSlot ? current : null,
    );
    queuedUpload.current.clear();
  }, [
    clearLease,
    clearPrivateForAutomaticTransition,
    loadPreflight,
    loadShippingContext,
    task?.orderId,
    creatingOrder,
    selectedOrderId,
  ]);

  useEffect(() => {
    clearLocationPhotoDisplay();
    const orderId = task?.orderId;
    const sourceUrl = task?.locationPhotoUrl;
    if (!orderId || !sourceUrl || !sessionAuthorized || !reauthVisible) return;

    const controller = new AbortController();
    const generation = locationPhotoGeneration.current;
    const sessionToken = privateSessionGate.current.capture();
    locationPhotoAbort.current = controller;
    void fetchNoStore(sourceUrl, {
      signal: controller.signal,
      headers: { accept: "image/jpeg,image/png" },
    })
      .then(async (response) => {
        const mimeType = response.headers.get("content-type")?.split(";", 1)[0];
        if (!response.ok || (mimeType !== "image/jpeg" && mimeType !== "image/png")) return null;
        const blob = await response.blob();
        return blob.size > 0 ? blob : null;
      })
      .then((blob) => {
        if (
          !blob ||
          controller.signal.aborted ||
          generation !== locationPhotoGeneration.current ||
          !privateSessionGate.current.isCurrent(sessionToken) ||
          !reauthGate.current.visible ||
          currentOrderId.current !== orderId
        ) {
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        if (
          controller.signal.aborted ||
          generation !== locationPhotoGeneration.current ||
          !privateSessionGate.current.isCurrent(sessionToken) ||
          !reauthGate.current.visible ||
          currentOrderId.current !== orderId
        ) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        releaseLocationPhotoObjectUrl();
        locationPhotoObjectUrl.current = objectUrl;
        setLocationPhotoDisplay({ orderId, sourceUrl, objectUrl });
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      if (locationPhotoAbort.current === controller) {
        locationPhotoAbort.current = null;
        locationPhotoGeneration.current += 1;
        releaseLocationPhotoObjectUrl();
      }
    };
  }, [
    clearLocationPhotoDisplay,
    reauthVisible,
    releaseLocationPhotoObjectUrl,
    sessionAuthorized,
    task?.locationPhotoUrl,
    task?.orderId,
  ]);

  useEffect(() => {
    if (!task) return;
    const refreshAfterAssignmentExpiry = () => {
      hideAssignmentForRevalidation();
      void refresh()
        .then(reloadCurrentPrivateContext)
        .catch((reason: unknown) => {
          if (clearIfSessionAuthorizationFailed(reason)) return;
          setError(errorMessage(reason));
        });
    };
    const timer = task.assignmentExpiresAt
      ? scheduleExpiryRefresh(task.assignmentExpiresAt, refreshAfterAssignmentExpiry)
      : null;
    const revalidate = () => {
      // Hide private DOM before revalidation. A native picker retains only its
      // File/snapshot refs, never visible order or photo content.
      hideAssignmentForRevalidation();
      if (pickerActive.current) {
        pickerNeedsReauth.current = true;
        return;
      }
      const started = sensitive.current.begin("revalidation", task.orderId);
      void refresh({
        signal: started.signal,
        isCurrent: () => sensitive.current.isCurrent(started.token, currentOrderId.current),
      })
        .then(reloadCurrentPrivateContext)
        .catch((reason: unknown) => {
          if (
            started.signal.aborted ||
            !sensitive.current.isCurrent(started.token, currentOrderId.current)
          )
            return;
          if (clearIfSessionAuthorizationFailed(reason)) return;
          setError(errorMessage(reason));
        });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    revalidateRef.current = revalidate;
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    clearIfSessionAuthorizationFailed,
    hideAssignmentForRevalidation,
    reloadCurrentPrivateContext,
    refresh,
    task?.assignmentExpiresAt,
    task?.orderId,
  ]);

  useEffect(() => () => clearLease(), [clearLease]);

  useEffect(() => {
    const queued = takeQueuedUploadForExecution(
      queuedUpload.current,
      {
        reauthVisible: reauthGate.current.visible,
        currentOrderId: currentOrderId.current,
        taskOrderId: task?.orderId ?? null,
        assignmentExpiresAt: task?.assignmentExpiresAt ?? null,
        managerAccess: canManage,
      },
      executionGate.current,
      busy !== null,
      mutations.current.pendingSlot,
    );
    if (!queued) return;
    void run(`upload-${queued.role}`, () => uploadPhoto(queued), queued.operation);
  }, [busy, canManage, executionRevision, reauthVisible, task?.assignmentExpiresAt, task?.orderId]);

  async function recoverConflict(slot: string) {
    if (slot === `policy:${workspaceId}`) {
      await loadPolicy();
      return;
    }
    if (slot === `catalog:${workspaceId}`) {
      await loadShippingCatalog();
      return;
    }
    const [kind, orderId] = slot.split(":");
    if (!orderId) return;
    if (kind === "create") {
      await refresh();
      return;
    }
    if (kind && ["pick", "pack", "ship"].includes(kind)) await refresh();
    if (currentOrderId.current === orderId) {
      await Promise.all([loadPreflight(orderId), loadShippingContext(orderId)]);
    }
  }

  function liveAuthorization(): MutationAuthorization {
    return {
      reauthVisible: reauthGate.current.visible,
      currentOrderId: currentOrderId.current,
      taskOrderId: task?.orderId ?? null,
      assignmentExpiresAt: task?.assignmentExpiresAt ?? null,
      managerAccess: canManage,
    };
  }

  async function run(
    label: string,
    action: () => Promise<void>,
    slot?: string,
    authorizationSlot = slot,
  ) {
    let executionToken: ShippingExecutionToken | null = null;
    setError("");
    setNotice("");
    try {
      // This synchronous gate runs before an action may issue a POST.
      if (authorizationSlot) mutations.current.assertRunnable(slot);
      executionToken = authorizeAndAcquireExecution(
        executionGate.current,
        authorizationSlot,
        liveAuthorization(),
      );
      setBusy(label);
      await action();
    } catch (reason) {
      if (clearIfSessionAuthorizationFailed(reason)) {
        try {
          await refresh();
        } catch (refreshReason) {
          setError(errorMessage(refreshReason));
        }
      } else if (reason instanceof RequestError && reason.status === 409 && slot) {
        retryRegistry.current.clear(slot);
        setRetryDisplay((current) => (current?.slot === slot ? null : current));
        try {
          await settleBeforeConflictRecovery(mutations.current, slot, () => recoverConflict(slot));
        } catch (recoveryReason) {
          if (clearIfSessionAuthorizationFailed(recoveryReason)) {
            setError(errorMessage(recoveryReason));
            return;
          }
          setError(`サーバーの最新状態を確認できませんでした。${errorMessage(recoveryReason)}`);
          return;
        }
        setError(
          "画面の情報が更新されていました。最新の内容を確認して、もう一度操作してください。",
        );
        return;
      } else if (reason instanceof RequestError && shouldDiscardSnapshot(reason.status)) {
        if (slot) settleOperation(slot);
      } else if (
        slot &&
        mutations.current.has(slot) &&
        (reason instanceof UnknownRequestError ||
          (reason instanceof RequestError && reason.status >= 500))
      ) {
        mutations.current.markUnknown(slot);
        retryRegistry.current.remember({ slot, label, action });
        setRetryDisplay({ slot, label });
        setNotice("通信結果を確認中です。同じ操作だけ再試行できます。");
      }
      setError(errorMessage(reason));
    } finally {
      if (executionToken) {
        executionGate.current.release(executionToken);
        setBusy(null);
        setExecutionRevision((current) => current + 1);
      }
    }
  }

  async function requireLease(): Promise<string | null> {
    mutations.current.assertRunnable();
    if (!task || task.orderId !== currentOrderId.current)
      throw new Error("担当注文を確認できません。");
    if (task.addressMode === "anonymous") {
      clearLease();
      return null;
    }
    const orderId = task.orderId;
    if (belongsToOrder(lease, orderId) && lease && isFutureIso(lease.expiresAt))
      return lease.leaseId;
    clearLease();
    const started = sensitive.current.begin("lease", orderId);
    const serverLease = await requestJson<AddressLeaseResponse>(
      `/v1/workspaces/${workspaceId}/orders/${orderId}/address-leases`,
      {
        method: "POST",
        body: JSON.stringify({ purpose: "shipping_label", humanConfirmed: true }),
        signal: started.signal,
      },
    );
    if (!sensitive.current.isCurrent(started.token, currentOrderId.current))
      throw new Error("注文が切り替わりました。もう一度確認してください。");
    const nextLease = {
      orderId,
      leaseId: serverLease.leaseId,
      expiresAt: serverLease.expiresAt,
    };
    setLease(nextLease);
    sensitive.current.ownLeaseTimer(
      started.token,
      () => currentOrderId.current,
      nextLease.expiresAt,
      clearLease,
    );
    return nextLease.leaseId;
  }

  async function refreshOrder(orderId: string) {
    await refresh();
    if (currentOrderId.current === orderId) {
      await Promise.all([loadPreflight(orderId), loadShippingContext(orderId)]);
    }
  }

  function selectOrder(orderId: string) {
    if (!creatingOrderRef.current && orderId === currentOrderId.current) return;
    try {
      assertOrderSwitchAllowed(mutations.current, executionGate.current);
    } catch (reason) {
      setError(errorMessage(reason));
      return;
    }
    taskRequestGate.current.invalidate();
    const previous = currentOrderId.current;
    clearOrderScopeForSwitch(previous);
    creatingOrderRef.current = false;
    pendingCreatedOrderId.current = null;
    setCreatingOrder(false);
    currentOrderId.current = orderId;
    setSelectedOrderId(orderId);
  }

  function startNewOrder() {
    if (!canManage) return;
    try {
      assertOrderSwitchAllowed(mutations.current, executionGate.current);
    } catch (reason) {
      setError(errorMessage(reason));
      return;
    }
    const previous = currentOrderId.current;
    clearOrderScopeForSwitch(previous);
    creatingOrderRef.current = true;
    pendingCreatedOrderId.current = null;
    currentOrderId.current = null;
    setSelectedOrderId(null);
    setCreatingOrder(true);
    setSelectedSkuId("");
    setSelectedInventoryUnitId("");
    setNewOrderAddressMode("");
    setNewOrderShippingAddress("");
    setNewOrderSaleAmountInput("");
    setNewOrderOccurredAt(new Date().toISOString());
    setReauthVisible(reauthGate.current.allowAfterValidAssignment());
    setError("");
    setNotice("商品と住所の扱いを選び、人が確認して注文を登録します。");
  }

  async function completePrivateMutationBeforeFollowUp<T>(
    sessionToken: PrivateSessionToken,
    send: () => Promise<T>,
    settle: () => void,
    followUp: (result: T) => void | Promise<void>,
  ) {
    return completeMutationBeforeFollowUp(send, settle, followUp, () =>
      privateSessionGate.current.isCurrent(sessionToken),
    );
  }

  async function savePolicy() {
    const sessionToken = privateSessionGate.current.capture();
    const threshold = policyMode === "high_value_only" ? Number(thresholdInput) : null;
    if (
      policyMode === "high_value_only" &&
      (threshold === null || !Number.isInteger(threshold) || threshold <= 0)
    ) {
      throw new Error("高額の目安は、1円以上の整数で入力してください。");
    }
    const operation = `policy:${workspaceId}`;
    const intent = {
      mode: policyMode,
      highValueThresholdMinor: threshold,
      expectedRevision: policy?.revision ?? null,
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<ShippingPhotoPolicyResponse>(
          `/v1/workspaces/${workspaceId}/shipping-photo-policy`,
          {
            method: "PUT",
            body: operationBody(operation, fingerprint, (key) => ({
              ...intent,
              idempotencyKey: key,
              humanConfirmed: true,
            })),
          },
        ),
      () => settleOperation(operation),
      async (saved) => {
        setPolicy(saved);
        setNotice("発送前写真の設定を保存しました。");
        await loadPreflight(currentOrderId.current);
      },
    );
  }

  function openShippingCatalog() {
    setError("");
    setShippingCatalogError("");
    setShippingCatalogOpen(true);
    if (!shippingCatalogDraft.methodId && !shippingCatalogDraft.methodName) {
      setShippingCatalogDraft(
        emptyShippingCatalogDraft(
          salesChannelKey || activeReadiness?.salesChannel?.key || "",
          salesChannelName || activeReadiness?.salesChannel?.name || "",
        ),
      );
    }
    if (isOwner) void loadShippingCatalog();
  }

  function startNewShippingCatalogEntry() {
    setShippingCatalogDraft(
      emptyShippingCatalogDraft(
        salesChannelKey || activeReadiness?.salesChannel?.key || "",
        salesChannelName || activeReadiness?.salesChannel?.name || "",
      ),
    );
    setShippingCatalogError("");
  }

  async function saveShippingCatalogEntry() {
    const sessionToken = privateSessionGate.current.capture();
    if (!isOwner) throw new Error("送料一覧を変更できるのは管理者だけです。");
    const feeMinor = Number(shippingCatalogDraft.feeYen);
    if (!Number.isInteger(feeMinor) || feeMinor < 0) {
      throw new Error("送料は0円以上の整数で入力してください。");
    }
    const salesChannelKeyValue = shippingCatalogDraft.salesChannelKey.trim();
    const salesChannelNameValue = shippingCatalogDraft.salesChannelName.trim();
    const methodNameValue = shippingCatalogDraft.methodName.trim();
    const officialCheckedOnValue = shippingCatalogDraft.officialCheckedOn.trim();
    const officialReferenceNoteValue = shippingCatalogDraft.officialReferenceNote.trim();
    if (
      !salesChannelKeyValue ||
      !salesChannelNameValue ||
      !methodNameValue ||
      !officialCheckedOnValue ||
      !officialReferenceNoteValue
    ) {
      throw new Error("販売先、配送方法、公式確認日、確認メモを入力してください。");
    }
    const operation = `catalog:${workspaceId}`;
    const intent = {
      methodId: shippingCatalogDraft.methodId,
      expectedRevision: shippingCatalogDraft.expectedRevision,
      salesChannelKey: salesChannelKeyValue,
      salesChannelName: salesChannelNameValue,
      methodName: methodNameValue,
      trackingAvailable: shippingCatalogDraft.trackingAvailable,
      feeMinor,
      deliveryEstimate: nullableText(shippingCatalogDraft.deliveryEstimate),
      officialCheckedOn: officialCheckedOnValue,
      officialReferenceUrl: null,
      officialReferenceNote: officialReferenceNoteValue,
      active: shippingCatalogDraft.active,
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<ShippingMethodCatalogResponse>(
          `/v1/workspaces/${workspaceId}/shipping-methods`,
          {
            method: "POST",
            body: operationBody(
              operation,
              fingerprint,
              (key) =>
                ({
                  ...intent,
                  idempotencyKey: key,
                  humanConfirmed: true,
                }) satisfies SaveShippingMethodRequest,
            ),
          },
        ),
      () => settleOperation(operation),
      async (saved) => {
        setShippingCatalog((current) => [
          saved,
          ...current.filter((entry) => entry.methodId !== saved.methodId),
        ]);
        setShippingCatalogDraft(shippingCatalogDraftFromEntry(saved));
        setShippingCatalogError("");
        setNotice("送料一覧を人が確認して保存しました。");
        if (currentOrderId.current) await loadShippingContext(currentOrderId.current);
      },
    );
  }

  async function evaluatePreflight() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task) return;
    const orderId = task.orderId;
    const operation = `preflight:${orderId}`;
    const intent = {
      orderId,
      expectedDecisionRevision: activePreflight?.decisionRevision ?? null,
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<ShippingPhotoPreflightResponse>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photo-preflight`,
          {
            method: "POST",
            body: operationBody(operation, fingerprint, (key) => ({
              expectedDecisionRevision: intent.expectedDecisionRevision,
              idempotencyKey: key,
              humanConfirmed: true,
            })),
          },
        ),
      () => settleOperation(operation),
      async () => {
        if (currentOrderId.current === orderId) await loadPreflight(orderId);
      },
    );
  }

  async function choosePhotos(choice: "use_photos" | "skip_photos") {
    const sessionToken = privateSessionGate.current.capture();
    if (!task) return;
    const orderId = task.orderId;
    const operation = `override:${orderId}`;
    const intent = {
      orderId,
      choice,
      expectedDecisionRevision: activePreflight?.decisionRevision ?? null,
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<ShippingPhotoPreflightResponse>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photo-override`,
          {
            method: "POST",
            body: operationBody(operation, fingerprint, (key) => ({
              choice: intent.choice,
              expectedDecisionRevision: intent.expectedDecisionRevision,
              idempotencyKey: key,
              humanConfirmed: true,
            })),
          },
        ),
      () => settleOperation(operation),
      async () => {
        if (currentOrderId.current === orderId) await loadPreflight(orderId);
      },
    );
  }

  async function uploadPhoto(pending: PendingUpload) {
    const sessionToken = privateSessionGate.current.capture();
    if (!task) return;
    if (!["image/jpeg", "image/png"].includes(pending.file.type)) {
      throw new Error("JPEGまたはPNGの写真を選んでください。");
    }
    if (pending.file.size === 0 || pending.file.size > 25 * 1024 * 1024) {
      throw new Error("写真は25MB以下を選んでください。");
    }
    if (pending.orderId !== currentOrderId.current) throw new MutationBlockedError();
    if (
      cancelMutationIfSessionExpired(privateSessionGate.current, sessionToken, () =>
        settleOperation(pending.operation),
      )
    )
      return;
    mutations.current.assertIntent(pending.operation, pending.fingerprint);
    const uploadAttempt = classifyUploadAttempt(mutations.current, pending.operation);
    const existingSnapshot = mutations.current.peek<UploadSnapshotPayload>(pending.operation);
    if (uploadAttempt === "unknown_retry" && !existingSnapshot) {
      throw new Error("通信結果が不明な写真の再送情報を確認できません。");
    }
    const uploadFile =
      uploadAttempt === "unknown_retry" ? existingSnapshot!.payload.file : pending.file;
    let body: ArrayBuffer;
    try {
      body = await uploadFile.arrayBuffer();
    } catch (reason) {
      if (uploadAttempt === "fresh") {
        settleOperation(pending.operation);
        setPendingUpload((current) => (current?.intentId === pending.intentId ? null : current));
      }
      throw reason;
    }
    if (
      cancelMutationIfSessionExpired(privateSessionGate.current, sessionToken, () =>
        settleOperation(pending.operation),
      )
    )
      return;
    const snapshot =
      uploadAttempt === "unknown_retry"
        ? existingSnapshot!
        : mutations.current.get<UploadSnapshotPayload>(
            pending.operation,
            pending.fingerprint,
            () => crypto.randomUUID(),
            (key) => ({
              orderId: pending.orderId,
              file: pending.file,
              query: new URLSearchParams({
                role: pending.role,
                idempotencyKey: key,
                humanConfirmed: "true",
              }).toString(),
            }),
          );
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestBinary<ShippingPhotoAssetResponse>(
          `/v1/workspaces/${workspaceId}/orders/${snapshot.payload.orderId}/shipping-photos?${snapshot.payload.query}`,
          snapshot.payload.file.type,
          body,
        ),
      () => settleOperation(pending.operation),
      async () => {
        setPendingUpload((current) => (current?.intentId === pending.intentId ? null : current));
        setNotice(
          `${roleLabel(pending.role)}を保存しました。写真を追加した後は、もう一度すべて確認してください。`,
        );
        if (currentOrderId.current === pending.orderId) await loadPreflight(pending.orderId);
      },
    );
  }

  async function confirmPhotos() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task || !activePreflight) return;
    const orderId = task.orderId;
    const operation = `confirm:${orderId}`;
    const assetIds = activePreflight.assets.map((asset) => asset.assetId);
    const fingerprint = mutationFingerprint({ orderId, assetIds });
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photo-confirmations`,
          {
            method: "POST",
            body: operationBody(operation, fingerprint, (key) => ({
              assetIds,
              idempotencyKey: key,
              humanConfirmed: true,
            })),
          },
        ),
      () => settleOperation(operation),
      async () => {
        setNotice("選んだすべての写真を確認済みにしました。");
        if (currentOrderId.current === orderId) await loadPreflight(orderId);
      },
    );
  }

  async function recordSaleAmount() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task) return;
    const amount = Number(saleAmountInput);
    const occurredAt = saleOccurredAtIso(saleOccurredAt);
    if (!Number.isInteger(amount) || amount <= 0 || !saleMeaning.trim() || !occurredAt) {
      throw new Error("販売額、確認した内容、販売日時をすべて入力してください。");
    }
    if (!saleConfirmed) {
      throw new Error("入力内容を人が確認したことをチェックしてください。");
    }
    const orderId = task.orderId;
    const operation = `sale:${orderId}`;
    const intent = {
      orderId,
      saleAmountMinor: amount,
      taxBasis: "unknown" as const,
      sourceMeaning: saleMeaning.trim(),
      occurredAt,
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson(`/v1/workspaces/${workspaceId}/orders/${orderId}/sale-amount`, {
          method: "POST",
          body: operationBody(operation, fingerprint, (key) => ({
            saleAmountMinor: intent.saleAmountMinor,
            taxBasis: intent.taxBasis,
            sourceMeaning: intent.sourceMeaning,
            occurredAt: intent.occurredAt,
            idempotencyKey: key,
            humanConfirmed: true,
          })),
        }),
      () => settleOperation(operation),
      async () => {
        setSaleAmountInput("");
        setSaleMeaning("");
        setSaleOccurredAt("");
        setSaleConfirmed(false);
        setNotice("人が確認した販売額を記録しました。写真の要否をもう一度確認します。");
        if (currentOrderId.current === orderId) await loadPreflight(orderId);
      },
    );
  }

  async function saveOrderRegistration() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task || !canManage || !activeRegistration) return;
    if (!salesChannelKey.trim() || !salesChannelName.trim()) {
      throw new Error("販売先を選んでください。");
    }
    const orderId = task.orderId;
    const operation = `registration:${orderId}`;
    const intent = {
      orderId,
      salesChannelKey: salesChannelKey.trim(),
      salesChannelName: salesChannelName.trim(),
      channelTransactionId: nullableText(transactionIdInput),
      buyerDisplayName: nullableText(buyerDisplayNameInput),
      expectedRevision: activeRegistration.revision,
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<OrderRegistrationResponse>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/registration`,
          {
            method: "PATCH",
            body: operationBody(operation, fingerprint, (key) => ({
              salesChannelKey: intent.salesChannelKey,
              salesChannelName: intent.salesChannelName,
              channelTransactionId: intent.channelTransactionId,
              buyerDisplayName: intent.buyerDisplayName,
              expectedRevision: intent.expectedRevision,
              idempotencyKey: key,
              humanConfirmed: true,
            })),
          },
        ),
      () => settleOperation(operation),
      async (saved) => {
        if (currentOrderId.current !== orderId) return;
        setRegistration(saved);
        setRegistrationReviewedOrderId(orderId);
        setApprovedViewStage(null);
        setNotice("注文情報を人が確認して保存しました。");
        await loadShippingContext(orderId);
      },
    );
  }

  async function createOrder() {
    const sessionToken = privateSessionGate.current.capture();
    if (!canManage || !creatingOrderRef.current) {
      throw new Error("注文を登録できるのは管理者だけです。");
    }
    const candidate = orderCandidates.find(
      (entry) => entry.skuId === selectedSkuId && entry.inventoryUnitId === selectedInventoryUnitId,
    );
    if (!candidate) throw new Error("未割当の商品と在庫を選んでください。");
    if (!salesChannelKey.trim() || !salesChannelName.trim()) {
      throw new Error("販売先を選んでください。");
    }
    if (!newOrderAddressMode) throw new Error("住所の扱いを選んでください。");
    const shippingAddress =
      newOrderAddressMode === "stored" ? nullableText(newOrderShippingAddress) : null;
    if (newOrderAddressMode === "stored" && !shippingAddress) {
      throw new Error("住所を保存する注文では、配送先を入力してください。");
    }
    const saleAmountMinor = newOrderSaleAmountInput ? Number(newOrderSaleAmountInput) : null;
    if (saleAmountMinor !== null && (!Number.isInteger(saleAmountMinor) || saleAmountMinor <= 0)) {
      throw new Error("販売金額は1円以上の整数で入力するか、未入力にしてください。");
    }
    const operation = `create:${candidate.inventoryUnitId}`;
    const intent = {
      salesChannelKey: salesChannelKey.trim(),
      salesChannelName: salesChannelName.trim(),
      channelTransactionId: nullableText(transactionIdInput),
      buyerDisplayName: nullableText(buyerDisplayNameInput),
      skuId: candidate.skuId,
      inventoryUnitId: candidate.inventoryUnitId,
      saleAmountMinor,
      costAmountMinor: candidate.allocatedCostMinor,
      sellingFeeMinor: null,
      shippingCostMinor: null,
      packagingCostMinor: null,
      taxBasis: "unknown" as const,
      sourceMeaning: "注文登録画面で本人が確認",
      occurredAt: newOrderOccurredAt,
      addressMode: newOrderAddressMode,
      shippingAddress,
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<OrderOperationResponse>(`/v1/workspaces/${workspaceId}/orders`, {
          method: "POST",
          body: operationBody(
            operation,
            fingerprint,
            (key) =>
              ({
                ...intent,
                idempotencyKey: key,
                humanConfirmed: true,
              }) satisfies CreateOrderRequest,
          ),
        }),
      () => settleOperation(operation),
      async (created) => {
        pendingCreatedOrderId.current = created.orderId;
        creatingOrderRef.current = false;
        currentOrderId.current = created.orderId;
        setRegistrationReviewedOrderId(created.orderId);
        setSelectedOrderId(created.orderId);
        setCreatingOrder(false);
        setNotice(`${created.orderNumber} を登録し、作業対象として選択しました。`);
        await refresh();
      },
    );
  }

  async function selectOrderShippingMethod() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task || !activeReadiness || !selectedShippingMethodId) {
      throw new Error("配送方法を選んでください。");
    }
    const selected = activeShippingMethods.find(
      (method) => method.methodId === selectedShippingMethodId,
    );
    if (!selected) throw new Error("現在利用できる配送方法を選んでください。");
    const orderId = task.orderId;
    const operation = `shipping-method:${orderId}`;
    const intent = {
      orderId,
      methodId: selected.methodId,
      expectedSelectionRevision: activeReadiness.selectedMethod?.revision ?? null,
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<OrderShippingMethodSelectionResponse>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-method-selections`,
          {
            method: "POST",
            body: operationBody(operation, fingerprint, (key) => ({
              methodId: intent.methodId,
              expectedSelectionRevision: intent.expectedSelectionRevision,
              idempotencyKey: key,
              humanConfirmed: true,
            })),
          },
        ),
      () => settleOperation(operation),
      async () => {
        if (currentOrderId.current !== orderId) return;
        setApprovedViewStage(null);
        setNotice("配送方法と料金を人が確認して選びました。");
        await loadShippingContext(orderId);
      },
    );
  }

  async function confirmOrderShippingReadiness() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task || !activeReadiness) return;
    if (activeReadiness.registrationRevision === null || !activeReadiness.selectedMethod) {
      throw new Error("注文情報と配送方法を先に確認してください。");
    }
    if (activeReadiness.blockingIssues.length > 0) {
      throw new Error("画面に表示された未確認項目を先に解消してください。");
    }
    const orderId = task.orderId;
    const operation = `shipping-readiness:${orderId}`;
    const intent = {
      orderId,
      expectedRegistrationRevision: activeReadiness.registrationRevision,
      expectedSelectionRevision: activeReadiness.selectedMethod.revision,
      acknowledgedMissingInformation: [...activeReadiness.missingInformation],
    };
    const fingerprint = mutationFingerprint(intent);
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<OrderShippingReadinessResponse>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-readiness-confirmations`,
          {
            method: "POST",
            body: operationBody(operation, fingerprint, (key) => ({
              expectedRegistrationRevision: intent.expectedRegistrationRevision,
              expectedSelectionRevision: intent.expectedSelectionRevision,
              acknowledgedMissingInformation: intent.acknowledgedMissingInformation,
              idempotencyKey: key,
              humanConfirmed: true,
            })),
          },
        ),
      () => settleOperation(operation),
      (confirmed) => {
        if (currentOrderId.current !== orderId) return;
        setReadiness(confirmed);
        setNotice("不足している任意情報を確認し、発送前確認を記録しました。");
      },
    );
  }

  async function revealAddress() {
    if (!task) return;
    if (task.addressMode === "anonymous") {
      throw new Error("匿名注文には表示する住所がありません。");
    }
    const orderId = task.orderId;
    await run(
      "address",
      async () => {
        mutations.current.assertRunnable();
        if (orderId !== currentOrderId.current) throw new MutationBlockedError();
        const activeLease = await requireLease();
        const started = sensitive.current.begin("address", orderId);
        const result = await requestJson<{ shippingAddress: string; expiresAt: string }>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/address?leaseId=${activeLease}`,
          { signal: started.signal },
        );
        if (!sensitive.current.isCurrent(started.token, currentOrderId.current)) return;
        if (!isFutureIso(result.expiresAt)) {
          clearLease();
          throw new Error("発送先の表示期限が切れました。もう一度表示してください。");
        }
        setAddress({ orderId, value: result.shippingAddress });
      },
      undefined,
      `address:${orderId}`,
    );
  }

  async function pick() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task) return;
    if (
      inventoryInput !== task.inventoryNumber ||
      locationInput !== task.locationCode ||
      !inventoryConfirmedAt ||
      !locationConfirmedAt
    ) {
      throw new Error("割当商品の在庫番号と場所コードを、それぞれ手入力して照合してください。");
    }
    const orderId = task.orderId;
    const operation = `pick:${orderId}`;
    const intent = {
      orderId,
      inventoryNumber: inventoryInput,
      locationCode: locationInput,
      inventoryLabelVersion: task.inventoryLabelVersion,
      locationLabelVersion: task.locationLabelVersion,
      inventoryScannedAt: inventoryConfirmedAt,
      locationScannedAt: locationConfirmedAt,
    };
    const fingerprint = mutationFingerprint(intent);
    if (
      cancelMutationIfSessionExpired(privateSessionGate.current, sessionToken, () =>
        settleOperation(operation),
      )
    )
      return;
    mutations.current.assertIntent(operation, fingerprint);
    const retry = mutations.current.peek(operation);
    const activeLease = retry ? null : await requireLease();
    if (
      cancelMutationIfSessionExpired(privateSessionGate.current, sessionToken, () =>
        settleOperation(operation),
      )
    )
      return;
    const snapshot = mutations.current.get(
      operation,
      fingerprint,
      () => crypto.randomUUID(),
      (key) => {
        return {
          inventoryNumber: intent.inventoryNumber,
          locationCode: intent.locationCode,
          inventoryLabelVersion: intent.inventoryLabelVersion,
          locationLabelVersion: intent.locationLabelVersion,
          addressLeaseId: activeLease!,
          inventoryScannedAt: intent.inventoryScannedAt,
          locationScannedAt: intent.locationScannedAt,
          confirmedAt: new Date().toISOString(),
          idempotencyKey: key,
          humanConfirmed: true,
        };
      },
    );
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () =>
        requestJson<OrderOperationResponse>(
          `/v1/workspaces/${workspaceId}/orders/${orderId}/pick`,
          { method: "POST", body: snapshot.serialized },
        ),
      () => settleOperation(operation),
      async (result) => {
        if (!result.orderId) throw new Error("取り出し結果を確認できません。");
        setNotice("商品と場所を照合して、取り出しを記録しました。");
        await refreshOrder(orderId);
      },
    );
  }

  async function confirmPacking() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task) return;
    const orderId = task.orderId;
    const operation = `pack:${orderId}`;
    const fingerprint = mutationFingerprint({ kind: "pack", orderId });
    if (
      cancelMutationIfSessionExpired(privateSessionGate.current, sessionToken, () =>
        settleOperation(operation),
      )
    )
      return;
    mutations.current.assertIntent(operation, fingerprint);
    const retry = mutations.current.peek(operation);
    const activeLease = retry ? null : await requireLease();
    if (
      cancelMutationIfSessionExpired(privateSessionGate.current, sessionToken, () =>
        settleOperation(operation),
      )
    )
      return;
    const path = `/v1/workspaces/${workspaceId}/orders/${orderId}/pack`;
    const body = operationBody(
      operation,
      fingerprint,
      (key) =>
        ({
          addressLeaseId: activeLease!,
          idempotencyKey: key,
          humanConfirmed: true,
        }) satisfies PackOrderRequest,
    );
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () => requestJson<OrderOperationResponse>(path, { method: "POST", body }),
      () => settleOperation(operation),
      async (result) => {
        if (!result.orderId) throw new Error("梱包確認の結果を確認できません。");
        setNotice("人による梱包確認を記録しました。発送はまだ確定していません。");
        await refreshOrder(orderId);
      },
    );
  }

  async function confirmShipment() {
    const sessionToken = privateSessionGate.current.capture();
    if (!task) return;
    const orderId = task.orderId;
    const operation = `ship:${orderId}`;
    const p14Selection = p14ShippingRequired ? activeReadiness?.selectedMethod : null;
    const p14Confirmation = p14ShippingRequired
      ? activeReadiness?.humanConfirmation.confirmationId
      : null;
    const p14ShippedAt = p14ShippingRequired ? saleOccurredAtIso(shippingOccurredAtInput) : null;
    if (
      p14ShippingRequired &&
      (!p14Selection ||
        activeReadiness?.humanConfirmation.state !== "confirmed" ||
        !p14Confirmation ||
        !p14ShippedAt)
    ) {
      throw new Error("配送方法、発送前確認、発送日時をすべて人が確認してください。");
    }
    const intent = {
      kind: "ship",
      orderId,
      shippingMethodSelectionId: p14Selection?.selectionId ?? null,
      readinessConfirmationId: p14Confirmation ?? null,
      shippedAt: p14ShippedAt,
    };
    const fingerprint = mutationFingerprint(intent);
    if (
      cancelMutationIfSessionExpired(privateSessionGate.current, sessionToken, () =>
        settleOperation(operation),
      )
    )
      return;
    mutations.current.assertIntent(operation, fingerprint);
    const retry = mutations.current.peek(operation);
    const activeLease = retry ? null : await requireLease();
    if (
      cancelMutationIfSessionExpired(privateSessionGate.current, sessionToken, () =>
        settleOperation(operation),
      )
    )
      return;
    const path = `/v1/workspaces/${workspaceId}/orders/${orderId}/ship`;
    const body = operationBody(
      operation,
      fingerprint,
      (key) =>
        ({
          addressLeaseId: activeLease!,
          idempotencyKey: key,
          humanConfirmed: true,
          ...(intent.shippingMethodSelectionId && intent.readinessConfirmationId && intent.shippedAt
            ? {
                shippingMethodSelectionId: intent.shippingMethodSelectionId,
                readinessConfirmationId: intent.readinessConfirmationId,
                shippedAt: intent.shippedAt,
              }
            : {}),
        }) satisfies ShipOrderRequest,
    );
    await completePrivateMutationBeforeFollowUp(
      sessionToken,
      () => requestJson<OrderOperationResponse>(path, { method: "POST", body }),
      () => settleOperation(operation),
      (result) => {
        if (!result.orderId) throw new Error("発送確認の結果を確認できません。");
        const selectedMethod = activeReadiness?.selectedMethod?.method ?? null;
        setCompletedShipment({
          orderId,
          orderNumber: task.orderNumber,
          methodName: selectedMethod?.methodName ?? null,
          feeMinor: selectedMethod?.feeMinor ?? null,
          shippedAt: p14ShippedAt ?? result.updatedAt,
          assignmentLabel: shippingRoleLabel(role),
        });
        setNotice("人による発送確認を記録しました。");
      },
    );
  }

  const uploadControls = (photoRole: PhotoRole, label: string) => (
    <label className={liveStyles.fileControl}>
      <span>{label}</span>
      <input
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        disabled={busy !== null}
        onFocus={() => {
          pickerActive.current = true;
        }}
        onBlur={() => {
          pickerActive.current = false;
          if (pickerNeedsReauth.current) {
            pickerNeedsReauth.current = false;
            revalidateRef.current();
          }
        }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          pickerActive.current = false;
          if (pickerNeedsReauth.current) {
            pickerNeedsReauth.current = false;
            revalidateRef.current();
          }
          if (!file) return;
          const orderId = currentOrderId.current;
          if (!orderId || orderId !== task?.orderId) {
            setError("担当注文を確認できません。もう一度読み込んでください。");
            event.currentTarget.value = "";
            return;
          }
          const intentId = crypto.randomUUID();
          const operation = `upload:${orderId}:${photoRole}`;
          const fingerprint = mutationFingerprint({
            orderId,
            role: photoRole,
            intentId,
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          });
          const next = {
            file,
            role: photoRole,
            operation,
            orderId,
            intentId,
            fingerprint,
          };
          try {
            // This gate is intentionally synchronous: no File or queued intent is
            // overwritten when another operation has an unknown outcome.
            mutations.current.assertIntent(operation, fingerprint);
            const decision = pickerExecutionDecision(
              reauthGate.current,
              executionGate.current,
              busy !== null,
            );
            if (decision === "queue") queuedUpload.current.queue(next);
            setPendingUpload(next);
            if (decision === "send") {
              void run(`upload-${photoRole}`, () => uploadPhoto(next), next.operation);
            } else {
              revalidateRef.current();
            }
          } catch (reason) {
            setError(errorMessage(reason));
          }
          event.currentTarget.value = "";
        }}
      />
      <small>端末で選ぶか、カメラで撮影します。外部には送信しません。</small>
    </label>
  );

  function handleApprovedFieldChange(field: ShippingField, value: string) {
    if (field === "salesChannel") {
      const channel = salesChannelIdentity(value);
      setSalesChannelName(channel.name);
      setSalesChannelKey(channel.key);
      return;
    }
    if (field === "transactionId" && canManage) {
      setTransactionIdInput(value);
      return;
    }
    if (field === "buyerDisplayName" && canManage) {
      setBuyerDisplayNameInput(value);
      return;
    }
    if (field === "saleAmount" && canManage && creatingOrderRef.current) {
      setNewOrderSaleAmountInput(value.replace(/[^0-9]/gu, ""));
      return;
    }
    if (field === "inventoryNumber") {
      const normalized = value.toUpperCase();
      setInventoryInput(normalized);
      setInventoryConfirmedAt((current) =>
        normalized === task?.inventoryNumber ? current || new Date().toISOString() : "",
      );
      return;
    }
    if (field === "locationCode") {
      const normalized = value.toUpperCase();
      setLocationInput(normalized);
      setLocationConfirmedAt((current) =>
        normalized === task?.locationCode ? current || new Date().toISOString() : "",
      );
      return;
    }
    if (field === "shippingOccurredAt") setShippingOccurredAtInput(value);
  }

  function runApprovedPrimary() {
    if (!task || busy !== null) return;
    if (displayedApprovedStage === "order") {
      void run("registration", saveOrderRegistration, `registration:${task.orderId}`);
      return;
    }
    if (displayedApprovedStage === "pick") {
      void run("pick", pick, `pick:${task.orderId}`);
      return;
    }
    if (displayedApprovedStage === "method") {
      void run("shipping-method", selectOrderShippingMethod, `shipping-method:${task.orderId}`);
      return;
    }
    if (displayedApprovedStage === "review" && approvedScreen.stage === "ship") {
      setApprovedViewStage(null);
      setNotice("確認済みの内容から、発送を記録する画面へ戻りました。");
      return;
    }
    if (displayedApprovedStage === "review") {
      void run(
        "shipping-readiness",
        confirmOrderShippingReadiness,
        `shipping-readiness:${task.orderId}`,
      );
      return;
    }
    if (displayedApprovedStage === "ship") {
      void run("ship", confirmShipment, `ship:${task.orderId}`);
    }
  }

  function showPreviousApprovedStep() {
    if (displayedApprovedStage === "ship") {
      setApprovedViewStage("review");
      setNotice("発送前に確認した内容を表示しています。");
      return;
    }
    if (displayedApprovedStage === "review") {
      setApprovedViewStage("method");
      setNotice("選択済みの配送方法を確認できます。");
      return;
    }
    window.location.assign("/workflow");
  }

  function showOrderInformation() {
    if (!canManage || !activeRegistration) {
      setNotice("この担当では購入者情報を表示しません。");
      return;
    }
    setApprovedViewStage("order");
    setNotice("注文情報を確認できます。保存するまで発送内容は変わりません。");
  }

  const productOptions = Array.from(
    new Map(
      orderCandidates.map((candidate) => [
        candidate.skuId,
        { skuId: candidate.skuId, label: `${candidate.skuCode}｜${candidate.title}` },
      ]),
    ).values(),
  );
  const inventoryOptions = orderCandidates.filter((candidate) => candidate.skuId === selectedSkuId);
  const selectedOrderCandidate = orderCandidates.find(
    (candidate) =>
      candidate.skuId === selectedSkuId && candidate.inventoryUnitId === selectedInventoryUnitId,
  );
  const orderFormLocked =
    busy !== null || retryDisplay !== null || mutations.current.pendingSlot !== null;
  const orderContextControl = canManage ? (
    <div className={liveStyles.orderContextControl}>
      <label>
        登録済み注文
        <select
          value={creatingOrder ? "" : (task?.orderId ?? "")}
          disabled={orderFormLocked}
          onChange={(event) => {
            if (event.target.value) selectOrder(event.target.value);
          }}
        >
          <option value="">{creatingOrder ? "新しい注文を登録中" : "注文を選択"}</option>
          {tasks.map((entry) => (
            <option key={entry.orderId} value={entry.orderId}>
              {entry.orderNumber}｜{entry.productTitle}
            </option>
          ))}
        </select>
      </label>
      {!creatingOrder ? (
        <button type="button" disabled={orderFormLocked} onClick={startNewOrder}>
          新しい注文
        </button>
      ) : null}
    </div>
  ) : null;
  const orderCreationControl = creatingOrder ? (
    <div className={liveStyles.orderCreationControl}>
      <label>
        商品（必須）
        <select
          aria-label="注文する商品"
          value={selectedSkuId}
          disabled={orderFormLocked}
          onChange={(event) => {
            setSelectedSkuId(event.target.value);
            setSelectedInventoryUnitId("");
          }}
        >
          <option value="">未割当の商品を選択</option>
          {productOptions.map((option) => (
            <option key={option.skuId} value={option.skuId}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        未割当の在庫（必須）
        <select
          aria-label="注文に割り当てる在庫"
          value={selectedInventoryUnitId}
          disabled={orderFormLocked || !selectedSkuId}
          onChange={(event) => setSelectedInventoryUnitId(event.target.value)}
        >
          <option value="">在庫番号を選択</option>
          {inventoryOptions.map((candidate) => (
            <option key={candidate.inventoryUnitId} value={candidate.inventoryUnitId}>
              {candidate.inventoryNumber}｜{candidate.locationCode ?? "場所未設定"}
            </option>
          ))}
        </select>
      </label>
      <label>
        住所の扱い（必須）
        <select
          aria-label="住所の扱い"
          value={newOrderAddressMode}
          disabled={orderFormLocked}
          onChange={(event) => {
            const mode = event.target.value as "" | CreateOrderRequest["addressMode"];
            setNewOrderAddressMode(mode);
            if (mode !== "stored") setNewOrderShippingAddress("");
          }}
        >
          <option value="">選択してください</option>
          <option value="anonymous">匿名（住所を保存しない）</option>
          <option value="stored">住所が必要（暗号化して保存）</option>
        </select>
      </label>
      {newOrderAddressMode === "stored" ? (
        <label>
          配送先（必須・最大1000文字）
          <textarea
            aria-label="配送先"
            maxLength={1000}
            value={newOrderShippingAddress}
            disabled={orderFormLocked}
            onChange={(event) => setNewOrderShippingAddress(event.target.value)}
          />
        </label>
      ) : null}
    </div>
  ) : null;

  const createOrderDisabled =
    orderFormLocked ||
    !selectedOrderCandidate ||
    !salesChannelKey ||
    !salesChannelName ||
    !newOrderAddressMode ||
    (newOrderAddressMode === "stored" && !newOrderShippingAddress.trim());

  const approvedReady =
    sessionAuthorized &&
    !loading &&
    task !== null &&
    reauthVisible &&
    shippingContextOrderId === task.orderId &&
    activePreflight !== null;
  const selectedMethod =
    activeShippingMethods.find((method) => method.methodId === selectedShippingMethodId) ??
    activeReadiness?.selectedMethod?.method ??
    null;
  const productAssets = activePreflight?.assets.filter((asset) => asset.role === "product") ?? [];
  const packedAssets =
    activePreflight?.assets.filter((asset) => asset.role === "packed_package") ?? [];
  const productPhotoUrl = task
    ? privatePhotoUrl(workspaceId, task.orderId, productAssets.at(-1)?.assetId)
    : undefined;
  const packedPhotoUrl = task
    ? privatePhotoUrl(workspaceId, task.orderId, packedAssets.at(-1)?.assetId)
    : undefined;
  const locationPhotoUrl = visibleAssignedLocationPhotoUrl(
    locationPhotoDisplay,
    task,
    sessionAuthorized && reauthVisible,
    Date.now(),
    canManage,
  );
  const productPhotoState = photoState(productAssets, currentConfirmed);
  const packedPhotoState = photoState(packedAssets, currentConfirmed);
  const photoCaptureAllowed =
    activePreflight?.state === "capture_required" ||
    activePreflight?.state === "awaiting_confirmation" ||
    activePreflight?.state === "confirmed";
  const primaryDisabled =
    busy !== null ||
    displayedApprovedStage === "complete" ||
    displayedApprovedStage === "photo_and_pack" ||
    (displayedApprovedStage === "order" &&
      (!activeRegistration || !salesChannelKey || !salesChannelName)) ||
    (displayedApprovedStage === "pick" &&
      (inventoryInput !== task?.inventoryNumber || locationInput !== task?.locationCode)) ||
    (displayedApprovedStage === "method" &&
      !activeShippingMethods.some((method) => method.methodId === selectedShippingMethodId)) ||
    (displayedApprovedStage === "review" &&
      p14ShippingRequired &&
      (activeReadiness?.selectedMethod == null ||
        activeReadiness.blockingIssues.length > 0 ||
        activeReadiness.registrationRevision === null)) ||
    (displayedApprovedStage === "ship" &&
      p14ShippingRequired &&
      (activeReadiness?.humanConfirmation.state !== "confirmed" ||
        !saleOccurredAtIso(shippingOccurredAtInput)));
  const primaryLabel =
    displayedApprovedStage === "order"
      ? "注文を保存"
      : displayedApprovedStage === "pick"
        ? "取り出しを完了"
        : displayedApprovedStage === "photo_and_pack"
          ? "上の確認を順番に進める"
          : displayedApprovedStage === "method"
            ? "この方法にする"
            : displayedApprovedStage === "review"
              ? "内容を確認しました"
              : displayedApprovedStage === "ship"
                ? "発送を記録"
                : "発送を記録済み";
  const retryControl = retryDisplay ? (
    <button
      type="button"
      className={liveStyles.controlButton}
      disabled={busy !== null || executionGate.current.busy || !retryAuthorized}
      onClick={() => {
        const retry = retryRegistry.current.peek();
        if (!retry || retry.slot !== retryDisplay.slot) {
          setError("再試行する操作を確認できません。画面を読み直してください。");
          return;
        }
        void run(`retry-${retry.label}`, retry.action, retry.slot);
      }}
    >
      {busy?.startsWith("retry-") ? "同じ内容を再送しています…" : "同じ操作を再試行"}
    </button>
  ) : null;
  if (sessionAuthorized && !loading && canManage && creatingOrder) {
    return (
      <ShippingApprovedLiveLayout
        stage="order"
        productTitle={selectedOrderCandidate?.title}
        salesChannel={salesChannelName || undefined}
        transactionId={transactionIdInput}
        buyerDisplayName={buyerDisplayNameInput}
        saleAmount={newOrderSaleAmountInput}
        saleAmountReadOnly={false}
        missingInformationCount={
          Number(!transactionIdInput.trim()) + Number(!newOrderSaleAmountInput)
        }
        orderContextControl={orderContextControl}
        orderCreationControl={orderCreationControl}
        notice={notice || undefined}
        error={error || undefined}
        retryControl={retryControl}
        busy={busy !== null}
        primaryDisabled={createOrderDisabled}
        primaryLabel="注文を登録して取り出しへ"
        onFieldChange={handleApprovedFieldChange}
        onPrimary={() => {
          if (!selectedInventoryUnitId) return;
          const operation = `create:${selectedInventoryUnitId}`;
          void run("create-order", createOrder, operation);
        }}
        onSecondary={() => window.location.assign("/workflow")}
      />
    );
  }
  const pickVerificationControl = task ? (
    <div className={liveStyles.controlPanel}>
      <div className={liveStyles.controlGrid}>
        <label>
          商品ラベルの在庫番号
          <input
            value={inventoryInput}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="在庫番号を入力"
            onChange={(event) => handleApprovedFieldChange("inventoryNumber", event.target.value)}
          />
        </label>
        <label>
          置き場所ラベルの場所コード
          <input
            value={locationInput}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="場所コードを入力"
            onChange={(event) => handleApprovedFieldChange("locationCode", event.target.value)}
          />
        </label>
      </div>
      <p className={inventoryInput === task.inventoryNumber ? liveStyles.confirmedText : undefined}>
        商品ラベル：{inventoryInput === task.inventoryNumber ? "一致" : "未確認"}
      </p>
      <p className={locationInput === task.locationCode ? liveStyles.confirmedText : undefined}>
        置き場所ラベル：{locationInput === task.locationCode ? "一致" : "未確認"}
      </p>
    </div>
  ) : null;
  const policySaveControl = isOwner ? (
    <div className={liveStyles.controlPanel}>
      {policyMode === "high_value_only" ? (
        <label>
          高額の目安（円）
          <input
            inputMode="numeric"
            value={thresholdInput}
            onChange={(event) => setThresholdInput(event.target.value.replace(/[^0-9]/gu, ""))}
          />
        </label>
      ) : null}
      <button
        type="button"
        className={liveStyles.controlButton}
        disabled={busy !== null}
        onClick={() => void run("policy", savePolicy, `policy:${workspaceId}`)}
      >
        {busy === "policy" ? "保存しています…" : "写真の設定を保存"}
      </button>
    </div>
  ) : null;
  const photoDecisionControl = activePreflight ? (
    <div className={liveStyles.controlPanel}>
      <p>{preflightText(activePreflight)}</p>
      {photoChoiceAction === "refresh" ? (
        <button
          type="button"
          className={liveStyles.controlButton}
          disabled={busy !== null}
          onClick={() =>
            void run(
              "evaluate-preflight",
              evaluatePreflight,
              `preflight:${activePreflight.orderId}`,
            )
          }
        >
          現在の設定で写真の要否を決める
        </button>
      ) : null}
      {photoChoiceAction === "choose" ? (
        <div className={liveStyles.controlRow}>
          <button
            type="button"
            className={liveStyles.controlButton}
            disabled={busy !== null}
            onClick={() =>
              void run(
                "use-photos",
                () => choosePhotos("use_photos"),
                `override:${activePreflight.orderId}`,
              )
            }
          >
            今回は写真を使う
          </button>
        </div>
      ) : null}
      {canManage &&
      activePreflight.saleAmountStatus === "missing" &&
      activePreflight.state === "choice_required" ? (
        <details>
          <summary>販売額を人が確認して記録</summary>
          <div className={liveStyles.controlGrid}>
            <label>
              販売額（円）
              <input
                inputMode="numeric"
                value={saleAmountInput}
                onChange={(event) => setSaleAmountInput(event.target.value.replace(/[^0-9]/gu, ""))}
              />
            </label>
            <label>
              確認した内容
              <input value={saleMeaning} onChange={(event) => setSaleMeaning(event.target.value)} />
            </label>
            <label>
              販売日時
              <input
                type="datetime-local"
                value={saleOccurredAt}
                onChange={(event) => setSaleOccurredAt(event.target.value)}
              />
            </label>
            <label className={liveStyles.checkLabel}>
              <input
                type="checkbox"
                checked={saleConfirmed}
                onChange={(event) => setSaleConfirmed(event.target.checked)}
              />
              入力内容を人が確認しました
            </label>
            <button
              type="button"
              className={liveStyles.controlButton}
              disabled={
                busy !== null ||
                !saleConfirmed ||
                !saleMeaning.trim() ||
                !saleOccurredAt ||
                !saleAmountInput
              }
              onClick={() =>
                void run("sale-amount", recordSaleAmount, `sale:${activePreflight.orderId}`)
              }
            >
              販売額を記録
            </button>
          </div>
        </details>
      ) : null}
    </div>
  ) : null;
  const photoConfirmationControl = activePreflight ? (
    currentConfirmed ? (
      <p className={liveStyles.confirmedText}>写真は人が確認済みです。</p>
    ) : (
      <button
        type="button"
        className={liveStyles.controlButton}
        disabled={busy !== null || !hasBothRoles(activePreflight.assets)}
        onClick={() =>
          void run("confirm-photos", confirmPhotos, `confirm:${activePreflight.orderId}`)
        }
      >
        {busy === "confirm-photos" ? "確認を記録しています…" : "この写真を人が確認"}
      </button>
    )
  ) : null;
  const packingConfirmationControl = activePreflight ? (
    activePreflight.packingHumanConfirmed ? (
      <p className={liveStyles.confirmedText}>梱包内容は人が確認済みです。</p>
    ) : (
      <button
        type="button"
        className={liveStyles.controlButton}
        disabled={busy !== null || !isPreflightSatisfied(activePreflight)}
        onClick={() => void run("pack", confirmPacking, `pack:${activePreflight.orderId}`)}
      >
        {busy === "pack" ? "梱包確認を記録しています…" : "梱包内容を人が確認"}
      </button>
    )
  ) : null;
  const addressControl = task ? (
    <div className={liveStyles.addressControl}>
      {task.addressMode === "stored" ? (
        <>
          <button type="button" disabled={busy !== null} onClick={() => void revealAddress()}>
            {busy === "address" ? "表示しています…" : "発送先を最大5分だけ表示"}
          </button>
          {visibleAddress ? <p>{visibleAddress}</p> : null}
        </>
      ) : (
        <p>匿名注文のため、住所は保存されていません。</p>
      )}
    </div>
  ) : null;
  const shippingCatalogDialogControl = (
    <div className={liveStyles.catalogEditor}>
      <p>外部サイトへ自動接続しません。公式情報を人が確認し、確認日とメモを残します。</p>
      {shippingCatalogError || error ? (
        <div className={liveStyles.error} role="alert">
          {shippingCatalogError || error}
        </div>
      ) : null}
      {shippingCatalogLoading ? <p role="status">送料一覧を読み込んでいます…</p> : null}
      <div className={liveStyles.catalogList} aria-label="登録済みの送料一覧">
        {isOwner
          ? shippingCatalog.map((entry) => (
              <button
                type="button"
                className={
                  shippingCatalogDraft.methodId === entry.methodId
                    ? liveStyles.catalogListSelected
                    : undefined
                }
                onClick={() => setShippingCatalogDraft(shippingCatalogDraftFromEntry(entry))}
                key={entry.catalogRevisionId}
              >
                <span>
                  <strong>{entry.methodName}</strong>
                  <small>
                    {entry.salesChannelName}・公式確認 {entry.officialCheckedOn}
                  </small>
                </span>
                <b>{formatPcYen(entry.feeMinor)}</b>
              </button>
            ))
          : activeShippingMethods.map((entry) => (
              <div
                className={
                  selectedShippingMethodId === entry.methodId
                    ? liveStyles.catalogListSelected
                    : undefined
                }
                key={entry.catalogRevisionId}
              >
                <span>
                  <strong>{entry.methodName}</strong>
                  <small>
                    {entry.salesChannelName}・公式確認 {entry.officialCheckedOn}
                  </small>
                </span>
                <b>{formatPcYen(entry.feeMinor)}</b>
              </div>
            ))}
        {!shippingCatalogLoading &&
        (isOwner ? shippingCatalog.length === 0 : activeShippingMethods.length === 0) ? (
          <p>登録済みの送料はありません。</p>
        ) : null}
      </div>
      {isOwner ? (
        <div className={liveStyles.catalogForm}>
          <div className={liveStyles.catalogFormHeader}>
            <h3>{shippingCatalogDraft.methodId ? "送料を編集" : "送料を追加"}</h3>
            <button type="button" onClick={startNewShippingCatalogEntry}>
              新しく追加
            </button>
          </div>
          <div className={liveStyles.catalogFormGrid}>
            <label>
              販売先の識別名
              <input
                value={shippingCatalogDraft.salesChannelKey}
                placeholder="例 mercari"
                onChange={(event) =>
                  setShippingCatalogDraft((current) => ({
                    ...current,
                    salesChannelKey: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              販売先の表示名
              <input
                value={shippingCatalogDraft.salesChannelName}
                placeholder="例 メルカリ"
                onChange={(event) =>
                  setShippingCatalogDraft((current) => ({
                    ...current,
                    salesChannelName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              配送方法
              <input
                value={shippingCatalogDraft.methodName}
                placeholder="例 ネコポス"
                onChange={(event) =>
                  setShippingCatalogDraft((current) => ({
                    ...current,
                    methodName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              送料（円）
              <input
                value={shippingCatalogDraft.feeYen}
                inputMode="numeric"
                placeholder="例 210"
                onChange={(event) =>
                  setShippingCatalogDraft((current) => ({
                    ...current,
                    feeYen: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              配送の目安（任意）
              <input
                value={shippingCatalogDraft.deliveryEstimate}
                placeholder="例 2〜3日"
                onChange={(event) =>
                  setShippingCatalogDraft((current) => ({
                    ...current,
                    deliveryEstimate: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              公式確認日
              <input
                type="date"
                value={shippingCatalogDraft.officialCheckedOn}
                onChange={(event) =>
                  setShippingCatalogDraft((current) => ({
                    ...current,
                    officialCheckedOn: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label>
            確認メモ
            <textarea
              value={shippingCatalogDraft.officialReferenceNote}
              placeholder="確認した公式料金表の名称など"
              onChange={(event) =>
                setShippingCatalogDraft((current) => ({
                  ...current,
                  officialReferenceNote: event.target.value,
                }))
              }
            />
          </label>
          <div className={liveStyles.catalogChecks}>
            <label>
              <input
                type="checkbox"
                checked={shippingCatalogDraft.trackingAvailable}
                onChange={(event) =>
                  setShippingCatalogDraft((current) => ({
                    ...current,
                    trackingAvailable: event.target.checked,
                  }))
                }
              />
              追跡番号あり
            </label>
            <label>
              <input
                type="checkbox"
                checked={shippingCatalogDraft.active}
                onChange={(event) =>
                  setShippingCatalogDraft((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
              />
              選択肢に表示する
            </label>
          </div>
          <button
            type="button"
            className={liveStyles.controlButton}
            disabled={busy !== null}
            onClick={() => void run("catalog", saveShippingCatalogEntry, `catalog:${workspaceId}`)}
          >
            {busy === "catalog" ? "保存しています…" : "人が確認して送料を保存"}
          </button>
        </div>
      ) : (
        <p className={liveStyles.policyReadOnly}>
          この画面では閲覧だけできます。送料の変更は管理者が行います。
        </p>
      )}
    </div>
  );
  if (approvedReady && task && activePreflight) {
    return (
      <ShippingApprovedLiveLayout
        key={task.orderId}
        stage={displayedApprovedStage}
        orderNumber={activeCompletedShipment?.orderNumber ?? task.orderNumber}
        productTitle={task.productTitle}
        orderContextControl={orderContextControl}
        salesChannel={salesChannelName || activeReadiness?.salesChannel?.name || undefined}
        transactionId={canManage ? transactionIdInput : undefined}
        buyerDisplayName={canManage ? buyerDisplayNameInput : undefined}
        saleAmount={activeReadiness?.saleAmountStatus === "present" ? "確認済み" : undefined}
        saleAmountReadOnly
        missingInformationCount={activeReadiness?.missingInformation.length ?? 0}
        inventoryNumber={inventoryInput || task.inventoryNumber}
        locationCode={locationInput || task.locationCode}
        locationPhotoUrl={locationPhotoUrl}
        inventoryConfirmed={inventoryInput === task.inventoryNumber}
        locationConfirmed={locationInput === task.locationCode}
        inventoryConfirmedAt={
          inventoryConfirmedAt ? formatClockTime(new Date(inventoryConfirmedAt)) : undefined
        }
        locationConfirmedAt={
          locationConfirmedAt ? formatClockTime(new Date(locationConfirmedAt)) : undefined
        }
        pickMatched={inventoryInput === task.inventoryNumber && locationInput === task.locationCode}
        policyMode={isOwner ? policyMode : shippingPolicyModeForReadOnly(activePreflight)}
        policyThreshold={
          isOwner && thresholdInput
            ? `${Number(thresholdInput).toLocaleString("ja-JP")}円`
            : undefined
        }
        canManagePolicy={isOwner}
        productPhotoState={productPhotoState}
        packedPhotoState={packedPhotoState}
        productPhotoUrl={productPhotoUrl}
        packedPhotoUrl={packedPhotoUrl}
        photoConfirmed={currentConfirmed}
        photoStatusLabel={
          activePreflight.state === "satisfied_without_photo"
            ? "写真不要・確認済み"
            : activePreflight.state === "confirmed"
              ? `${activePreflight.assets.length}枚・確認済み`
              : "要確認"
        }
        packingConfirmed={activePreflight.packingHumanConfirmed}
        shippingMethods={activeShippingMethods.map((method) => ({
          id: method.methodId,
          label: method.methodName,
          feeLabel: formatMobileShippingFee(method.methodName, method.feeMinor),
          pcFeeLabel: formatPcYen(method.feeMinor),
          ...(method.deliveryEstimate ? { estimate: method.deliveryEstimate } : {}),
        }))}
        selectedShippingMethodId={selectedShippingMethodId || undefined}
        shippingMethod={activeCompletedShipment?.methodName ?? selectedMethod?.methodName}
        shippingFee={
          activeCompletedShipment?.feeMinor != null
            ? formatYen(activeCompletedShipment.feeMinor)
            : selectedMethod
              ? formatYen(selectedMethod.feeMinor)
              : undefined
        }
        pcShippingFee={
          activeCompletedShipment?.feeMinor != null
            ? formatPcYen(activeCompletedShipment.feeMinor)
            : selectedMethod
              ? formatPcYen(selectedMethod.feeMinor)
              : undefined
        }
        officialCheckedDate={formatJapaneseDate(
          selectedMethod?.officialCheckedOn ?? activeShippingMethods[0]?.officialCheckedOn,
        )}
        reviewConfirmedAt={
          activeReadiness?.humanConfirmation.confirmedAt
            ? formatDateTimeForDisplay(activeReadiness.humanConfirmation.confirmedAt)
            : undefined
        }
        shippingOccurredAt={
          activeCompletedShipment
            ? formatDateTimeForDisplay(activeCompletedShipment.shippedAt)
            : shippingOccurredAtInput
        }
        assignmentLabel={activeCompletedShipment?.assignmentLabel ?? shippingRoleLabel(role)}
        notice={notice || undefined}
        error={error || preflightError || shippingContextError || undefined}
        retryControl={retryControl}
        pickVerificationControl={pickVerificationControl}
        productPhotoControl={
          photoCaptureAllowed
            ? uploadControls("product", productAssets.length > 0 ? "再撮影" : "商品写真を追加")
            : undefined
        }
        packedPhotoControl={
          photoCaptureAllowed
            ? uploadControls(
                "packed_package",
                packedAssets.length > 0 ? "再撮影" : "梱包後写真を追加",
              )
            : undefined
        }
        photoDecisionControl={photoDecisionControl}
        photoConfirmationControl={photoConfirmationControl}
        packingConfirmationControl={packingConfirmationControl}
        catalogDialogControl={shippingCatalogDialogControl}
        policySaveControl={policySaveControl}
        addressControl={addressControl}
        busy={busy !== null}
        primaryDisabled={primaryDisabled}
        primaryLabel={primaryLabel}
        catalogDialogOpen={shippingCatalogOpen}
        onFieldChange={handleApprovedFieldChange}
        onPolicyModeChange={isOwner ? setPolicyMode : undefined}
        onShippingMethodChange={setSelectedShippingMethodId}
        onPrimary={runApprovedPrimary}
        onSecondary={showPreviousApprovedStep}
        onReviewOrderInfo={showOrderInformation}
        onSkipPhotos={
          photoChoiceAction === "choose" && activePreflight
            ? () =>
                void run(
                  "skip-photos",
                  () => choosePhotos("skip_photos"),
                  `override:${activePreflight.orderId}`,
                )
            : undefined
        }
        onContinue={
          approvedScreen.stage === "complete"
            ? () => {
                void run("reload", async () => {
                  await refresh();
                  setCompletedShipment(null);
                });
              }
            : undefined
        }
        onEditShippingCatalog={openShippingCatalog}
        onCloseShippingCatalog={() => {
          if (busy === null) setShippingCatalogOpen(false);
        }}
        onCheckOfficialFee={() =>
          setNotice("外部サイトへ自動接続せず、表示中の公式確認日を人が確認します。")
        }
      />
    );
  }

  if (sessionAuthorized && !loading && task && reauthVisible) {
    return (
      <main className="shippingAppShell">
        <section className="shippingMain">
          <div className="panel shippingLoading" role={shippingContextError ? "alert" : undefined}>
            <h1>注文・発送を読み込んでいます</h1>
            <p>{shippingContextError || preflightError || "安全な最新情報を確認しています…"}</p>
            {shippingContextError || preflightError ? (
              <button
                type="button"
                onClick={() =>
                  void run("reload-context", () =>
                    Promise.all([
                      loadPreflight(task.orderId),
                      loadShippingContext(task.orderId),
                    ]).then(() => undefined),
                  )
                }
              >
                もう一度読み込む
              </button>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shippingAppShell">
      <aside className="shippingSidebar" aria-label="PCナビゲーション">
        <a className="brand" href="/" aria-label="ホームへ">
          R<span>O</span>
        </a>
        <p>作業</p>
        <a href="/workflow">商品</a>
        <a aria-current="page" href="/shipping">
          注文・発送
        </a>
        <a href="/inventory">在庫</a>
        <a href="/accounting">会計</a>
      </aside>
      <section className="shippingMain">
        <header className="shippingHeader">
          <div>
            <p className="eyebrow">ORDER & SHIPPING</p>
            <h1>注文・発送</h1>
            <p>写真確認、梱包確認、発送確認はそれぞれ人が行います。</p>
          </div>
          <div className="shippingHeaderActions">
            <a href="/mobile">モバイル表示</a>
            <LogoutButton />
          </div>
        </header>
        {sessionAuthorized && error ? (
          <p role="alert" className="shippingAlert">
            {error}
          </p>
        ) : null}
        {sessionAuthorized && notice ? (
          <p role="status" className="shippingNotice">
            {notice}
          </p>
        ) : null}
        {sessionAuthorized && retryDisplay ? (
          <section className="shippingRetry panel" role="alert" aria-live="assertive">
            <div>
              <strong>前回の操作結果を確認できません</strong>
              <p>入力内容を変えず、同じ操作だけをそのまま再試行できます。</p>
            </div>
            <button
              type="button"
              disabled={busy !== null || executionGate.current.busy || !retryAuthorized}
              onClick={() => {
                const retry = retryRegistry.current.peek();
                if (!retry || retry.slot !== retryDisplay.slot) {
                  setError("再試行する操作を確認できません。画面を読み直してください。");
                  return;
                }
                void run(`retry-${retry.label}`, retry.action, retry.slot);
              }}
            >
              {busy?.startsWith("retry-") ? "同じ内容を再送しています…" : "同じ操作を再試行"}
            </button>
          </section>
        ) : null}

        {!sessionAuthorized ? (
          <section className="shippingSessionExpired panel" role="alert">
            <h2>ログインが切れました</h2>
            <p>安全のため、担当注文や発送前の写真設定を画面から消しました。</p>
            <a href="/login">ログインし直す</a>
          </section>
        ) : null}

        {isOwner && sessionAuthorized ? (
          <section className="shippingPolicy panel" aria-labelledby="photo-policy-title">
            <div>
              <p className="eyebrow">工程設定</p>
              <h2 id="photo-policy-title">発送前の写真</h2>
              <p>初期表示はおすすめです。保存するまで、設定はまだ作られていません。</p>
            </div>
            <div className="shippingPolicyChoices" role="radiogroup" aria-label="発送前写真の設定">
              {(
                [
                  ["high_value_only", "高額商品だけ撮る", "おすすめ"],
                  ["all", "すべて撮る", "すべての注文で写真を確認します"],
                  ["disabled", "使わない", "写真を使わずに進めます"],
                ] as const
              ).map(([mode, label, hint]) => (
                <label className={policyMode === mode ? "selected" : ""} key={mode}>
                  <input
                    type="radio"
                    name="shipping-photo-policy"
                    value={mode}
                    checked={policyMode === mode}
                    onChange={() => setPolicyMode(mode)}
                  />
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </label>
              ))}
            </div>
            {policyMode === "high_value_only" ? (
              <label className="shippingThreshold">
                高額の目安（円）
                <input
                  inputMode="numeric"
                  value={thresholdInput}
                  placeholder="例は保存しません。1円以上を入力"
                  onChange={(event) =>
                    setThresholdInput(event.target.value.replace(/[^0-9]/gu, ""))
                  }
                />
              </label>
            ) : null}
            <div className="shippingPolicyFooter">
              <span>
                {policy
                  ? `保存済み（変更 ${policy.revision} 回目）`
                  : "未保存：DBに写真設定はありません"}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("policy", savePolicy, `policy:${workspaceId}`)}
              >
                {busy === "policy" ? "保存しています…" : "この設定を保存"}
              </button>
            </div>
          </section>
        ) : null}
        {sessionAuthorized && loading ? (
          <section className="panel shippingLoading">発送の準備を読み込んでいます…</section>
        ) : null}
        {sessionAuthorized && !loading && tasks.length === 0 ? (
          <section className="panel shippingEmpty">
            <h2>現在の発送作業はありません</h2>
            <p>割り当てられた注文があると、ここに表示されます。</p>
            <button type="button" onClick={() => void run("reload", refresh)}>
              もう一度読み込む
            </button>
          </section>
        ) : null}

        {sessionAuthorized && task && reauthVisible ? (
          <div className="shippingGrid">
            <section className="panel shippingOrderCard">
              <div className="shippingOrderHead">
                <div>
                  <p className="eyebrow">担当注文</p>
                  <h2>{task.orderNumber}</h2>
                  <p>
                    {task.assignmentExpiresAt
                      ? `割当期限: ${new Date(task.assignmentExpiresAt).toLocaleString("ja-JP")}`
                      : "管理者として作業中"}
                  </p>
                </div>
                {tasks.length > 1 ? (
                  <label>
                    注文を切り替える
                    <select
                      value={task.orderId}
                      disabled={
                        busy !== null ||
                        executionGate.current.busy ||
                        retryDisplay !== null ||
                        mutations.current.pendingSlot !== null
                      }
                      onChange={(event) => selectOrder(event.target.value)}
                    >
                      {tasks.map((entry) => (
                        <option key={entry.orderId} value={entry.orderId}>
                          {entry.orderNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <section className="shippingStep">
                <h3>1. 商品を取り出す</h3>
                <p>商品番号と場所コードを手入力して照合します。</p>
                {task.state === "confirmed" ? (
                  <>
                    <div className="measurementGrid">
                      <label>
                        在庫番号
                        <input
                          value={inventoryInput}
                          onChange={(event) => setInventoryInput(event.target.value.toUpperCase())}
                        />
                      </label>
                      <label>
                        場所コード
                        <input
                          value={locationInput}
                          onChange={(event) => setLocationInput(event.target.value.toUpperCase())}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void run("pick", pick, `pick:${task.orderId}`)}
                    >
                      {busy === "pick" ? "照合しています…" : "商品と場所を照合して取り出す"}
                    </button>
                  </>
                ) : (
                  <p className="shippingDone">取り出しを記録済みです。</p>
                )}
              </section>
              <section className="shippingStep">
                <h3>2. 発送前の写真</h3>
                {preflightError ? (
                  <div className="shippingAlert">
                    <p>写真の要否を確認できません。</p>
                    <p>{preflightError}</p>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void run("preflight-retry", () => loadPreflight(task.orderId))}
                    >
                      もう一度確認
                    </button>
                  </div>
                ) : activePreflight ? (
                  <>
                    <p>{preflightText(activePreflight)}</p>
                    {photoChoiceAction === "refresh" ? (
                      <div className="shippingChoice">
                        <p>写真の設定を変更しました。現在の設定をこの注文へ反映してください。</p>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(
                              "evaluate-preflight",
                              evaluatePreflight,
                              `preflight:${task.orderId}`,
                            )
                          }
                        >
                          現在の設定で写真の要否を決める
                        </button>
                      </div>
                    ) : photoChoiceAction === "choose" ? (
                      <div className="shippingChoice">
                        <p>今回は写真を使うか、使わないかを選んでください。</p>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(
                              "use-photos",
                              () => choosePhotos("use_photos"),
                              `override:${task.orderId}`,
                            )
                          }
                        >
                          今回は写真を使う
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(
                              "skip-photos",
                              () => choosePhotos("skip_photos"),
                              `override:${task.orderId}`,
                            )
                          }
                        >
                          今回は写真を使わない
                        </button>
                      </div>
                    ) : null}
                    {canManage &&
                    activePreflight.saleAmountStatus === "missing" &&
                    activePreflight.state === "choice_required" ? (
                      <details className="shippingSaleAmount">
                        <summary>販売額を後から記録する</summary>
                        <p>人が確認した額だけを記録します。0円の補完はしません。</p>
                        <label>
                          販売額（円）
                          <input
                            inputMode="numeric"
                            value={saleAmountInput}
                            onChange={(event) =>
                              setSaleAmountInput(event.target.value.replace(/[^0-9]/gu, ""))
                            }
                          />
                        </label>
                        <label>
                          確認した内容
                          <input
                            value={saleMeaning}
                            onChange={(event) => setSaleMeaning(event.target.value)}
                          />
                        </label>
                        <label>
                          販売日時
                          <input
                            type="datetime-local"
                            value={saleOccurredAt}
                            onChange={(event) => setSaleOccurredAt(event.target.value)}
                          />
                        </label>
                        <label className="shippingSaleConfirm">
                          <input
                            type="checkbox"
                            checked={saleConfirmed}
                            onChange={(event) => setSaleConfirmed(event.target.checked)}
                          />
                          入力内容を人が確認し、この販売額として記録します
                        </label>
                        <button
                          type="button"
                          disabled={
                            busy !== null ||
                            !saleConfirmed ||
                            !saleMeaning.trim() ||
                            !saleOccurredAt ||
                            !saleAmountInput
                          }
                          onClick={() =>
                            void run("sale-amount", recordSaleAmount, `sale:${task.orderId}`)
                          }
                        >
                          販売額を人が確認して記録
                        </button>
                      </details>
                    ) : null}
                    {activePreflight.state === "capture_required" ||
                    activePreflight.state === "awaiting_confirmation" ? (
                      <div className="shippingPhotoGrid">
                        {uploadControls("product", "商品写真を追加")}
                        {uploadControls("packed_package", "梱包後写真を追加")}
                        {activePendingUpload ? (
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy !== null}
                            onClick={() =>
                              void run(
                                `upload-${activePendingUpload.role}`,
                                () => uploadPhoto(activePendingUpload),
                                activePendingUpload.operation,
                              )
                            }
                          >
                            {busy?.startsWith("upload-")
                              ? "送信しています…"
                              : `${roleLabel(activePendingUpload.role)}をもう一度送る`}
                          </button>
                        ) : null}
                        <PhotoStatus
                          assets={activePreflight.assets}
                          workspaceId={workspaceId}
                          orderId={task.orderId}
                        />
                        <p className="shippingPhotoHint">
                          確認する対象は、今ある{activePreflight.assets.length}
                          枚すべてです。商品写真と梱包後写真を各1枚以上そろえ、追加後は全写真を確認し直します。
                        </p>
                        <button
                          type="button"
                          disabled={busy !== null || !hasBothRoles(activePreflight.assets)}
                          onClick={() =>
                            void run("confirm-photos", confirmPhotos, `confirm:${task.orderId}`)
                          }
                        >
                          {busy === "confirm-photos" ? "確認を記録しています…" : "この写真で確認"}
                        </button>
                      </div>
                    ) : null}
                    {activePreflight.state === "confirmed" && currentConfirmed ? (
                      <p className="shippingDone">
                        写真は確認済みです。写真を追加した場合は、もう一度確認が必要です。
                      </p>
                    ) : null}
                    {activePreflight.state === "satisfied_without_photo" ? (
                      <p className="shippingDone">この注文は、写真なしで進められます。</p>
                    ) : null}
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          "evaluate-preflight",
                          evaluatePreflight,
                          `preflight:${task.orderId}`,
                        )
                      }
                    >
                      写真の要否をもう一度確認
                    </button>
                  </>
                ) : (
                  <p>写真の要否を読み込んでいます…</p>
                )}
              </section>
              <section className="shippingStep">
                <h3>3. 梱包を確認</h3>
                <p>写真確認とは別に、梱包内容を人が確認して記録します。</p>
                {activePreflight?.packingHumanConfirmed ? (
                  <p className="shippingDone">梱包確認を記録済みです。</p>
                ) : null}
                {(task.state === "picking" || task.state === "packed") &&
                !activePreflight?.packingHumanConfirmed ? (
                  <button
                    type="button"
                    disabled={busy !== null || !isPreflightSatisfied(activePreflight)}
                    onClick={() => void run("pack", confirmPacking, `pack:${task.orderId}`)}
                  >
                    {busy === "pack" ? "梱包確認を記録しています…" : "梱包内容を人が確認"}
                  </button>
                ) : null}
              </section>
              <section className="shippingStep">
                <h3>4. 発送を確認</h3>
                <p>発送する内容を最後に人が確認してから、発送を記録します。</p>
                {task.state === "packed" && activePreflight?.packingHumanConfirmed ? (
                  <button
                    type="button"
                    disabled={busy !== null || !isPreflightSatisfied(activePreflight)}
                    onClick={() => void run("ship", confirmShipment, `ship:${task.orderId}`)}
                  >
                    {busy === "ship" ? "発送を記録しています…" : "発送を人が確認して記録"}
                  </button>
                ) : (
                  <p className="shippingWaiting">梱包確認が終わると、発送確認を行えます。</p>
                )}
              </section>
            </section>
            <aside className="shippingSupport panel">
              <h2>発送先の表示</h2>
              <p>ラベル作成に必要な時だけ、最大5分表示します。</p>
              <button type="button" disabled={busy !== null} onClick={() => void revealAddress()}>
                {busy === "address" ? "表示しています…" : "発送先を最大5分だけ表示"}
              </button>
              {visibleAddress ? <p className="shippingAddress">{visibleAddress}</p> : null}
              <div className="shippingSafety">
                <strong>表示しない情報</strong>
                <p>原価・利益・税務情報・写真の保存場所は、発送担当へ表示しません。</p>
              </div>
            </aside>
          </div>
        ) : null}
      </section>
      <nav className="mobileBottomNav shippingMobileNav" aria-label="モバイルナビゲーション">
        <a href="/mobile">今日</a>
        <a aria-current="page" href="/shipping">
          発送
        </a>
        <a href="/inventory">在庫</a>
      </nav>
    </main>
  );
}

function PhotoStatus({
  assets,
  workspaceId,
  orderId,
}: {
  assets: ShippingPhotoAssetResponse[];
  workspaceId: string;
  orderId: string;
}) {
  return (
    <div className="shippingPhotoStatus" aria-label="撮影済み写真">
      {(["product", "packed_package"] as const).map((role) => {
        const photos = assets.filter((asset) => asset.role === role);
        return (
          <div key={role}>
            <strong>{roleLabel(role)}</strong>
            <span>{photos.length > 0 ? `${photos.length}枚 撮影済み` : "未撮影"}</span>
            {photos.map((asset) => (
              <img
                key={asset.assetId}
                alt={`${roleLabel(role)} ${asset.capturedAt}`}
                src={`/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photos/${asset.assetId}/content`}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function hasBothRoles(assets: ShippingPhotoAssetResponse[]) {
  return ["product", "packed_package"].every((role) => assets.some((asset) => asset.role === role));
}
function hasCurrentConfirmation(preflight: ShippingPhotoPreflightResponse | null) {
  return Boolean(
    preflight &&
    preflight.assets.length > 0 &&
    preflight.assets.length === preflight.confirmedAssetIds.length &&
    preflight.assets.every((asset) => preflight.confirmedAssetIds.includes(asset.assetId)),
  );
}
function isPreflightSatisfied(preflight: ShippingPhotoPreflightResponse | null) {
  return preflight?.state === "satisfied_without_photo" || preflight?.state === "confirmed";
}
function roleLabel(role: PhotoRole) {
  return role === "product" ? "商品写真" : "梱包後写真";
}
function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function salesChannelIdentity(name: string): { key: string; name: string } {
  const keyByName: Record<string, string> = {
    メルカリ: "mercari",
    "Yahoo!フリマ": "yahoo_furima",
    "Yahoo!オークション": "yahoo_auction",
  };
  return { key: keyByName[name] ?? "", name };
}
function privatePhotoUrl(
  workspaceId: string,
  orderId: string,
  assetId?: string,
): string | undefined {
  return assetId
    ? `/v1/workspaces/${workspaceId}/orders/${orderId}/shipping-photos/${assetId}/content`
    : undefined;
}
function photoState(
  assets: ShippingPhotoAssetResponse[],
  exactSetConfirmed: boolean,
): ShippingPhotoState {
  if (assets.length === 0) return "missing";
  return exactSetConfirmed ? "confirmed" : "ready";
}
function shippingRoleLabel(role: ShippingRole): string {
  if (role === "owner") return "本人";
  if (role === "inventory_manager") return "在庫管理担当";
  return "発送担当";
}
function formatYen(value: number): string {
  return `${value.toLocaleString("ja-JP")}円`;
}
function formatMobileShippingFee(methodName: string, value: number): string {
  const fee = formatYen(value);
  return methodName === "宅急便コンパクト" ? `${fee}＋箱` : fee;
}
function formatPcYen(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}
function formatJapaneseDate(value?: string): string | undefined {
  return value ? value.replaceAll("-", "/") : undefined;
}
function formatDateTimeForDisplay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}
function formatClockTime(value: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}
function preflightText(preflight: ShippingPhotoPreflightResponse) {
  if (preflight.state === "choice_required")
    return "写真を使うか、今回だけ人が選ぶ必要があります。";
  if (preflight.state === "capture_required")
    return "この注文は写真が必要です。2種類の写真をそろえてください。";
  if (preflight.state === "awaiting_confirmation")
    return "写真はそろいました。すべてを人が確認してください。";
  if (preflight.state === "confirmed") return "発送前の写真を人が確認済みです。";
  return "この注文は写真なしで進められます。";
}

async function requestOptionalJson<T>(url: string): Promise<T | null> {
  const response = await fetchNoStore(url);
  if (response.status === 204) return null;
  return parseResponse<T>(response);
}
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && typeof init.body === "string") headers.set("content-type", "application/json");
  return parseResponse<T>(await fetchNoStore(url, { ...init, headers }));
}
async function requestBinary<T>(url: string, contentType: string, body: ArrayBuffer): Promise<T> {
  return parseResponse<T>(
    await fetchNoStore(url, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }),
  );
}
async function fetchNoStore(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { cache: "no-store", ...init });
  } catch (reason) {
    if (reason instanceof Error && reason.name === "AbortError") throw reason;
    throw new UnknownRequestError();
  }
}
async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok)
    throw new RequestError(
      response.status,
      payload?.message ?? `操作に失敗しました（${response.status}）。`,
    );
  return payload as T;
}
class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
class UnknownRequestError extends Error {
  constructor() {
    super("通信が途中で切れたため、操作結果を確認できません。");
    this.name = "UnknownRequestError";
  }
}
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "安全に処理できませんでした。";
}
