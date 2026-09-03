export type ShippingRole =
  "accounting" | "owner" | "inventory_manager" | "shipping" | "field_worker";

export function canRecordShippingSale(role: ShippingRole): boolean {
  return role === "owner" || role === "inventory_manager";
}

export function shippingPhotoChoiceAction(
  policyMode: "all" | "disabled" | "high_value_only" | null,
  saleAmountStatus: "missing" | "present" | null,
  preflightState: string | null,
): "choose" | "refresh" | "none" {
  if (preflightState !== "choice_required") return "none";
  if (policyMode === "all" || policyMode === "disabled") return "refresh";
  if (policyMode === "high_value_only") {
    return saleAmountStatus === "missing" ? "choose" : "refresh";
  }
  return "choose";
}

export function isFutureIso(value: string, now = Date.now()): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

export function scheduleExpiryRefresh(
  expiresAt: string,
  refresh: () => void,
  now = Date.now(),
): ReturnType<typeof setTimeout> {
  const timestamp = Date.parse(expiresAt);
  return setTimeout(refresh, Math.max(0, Number.isFinite(timestamp) ? timestamp - now : 0));
}

export function saleOccurredAtIso(value: string): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export class MutationKeyStore {
  private readonly keys = new Map<string, string>();

  get(operation: string, create: () => string): string {
    const existing = this.keys.get(operation);
    if (existing) return existing;
    const key = create();
    this.keys.set(operation, key);
    return key;
  }

  clear(operation: string): void {
    this.keys.delete(operation);
  }

  clearAll(): void {
    this.keys.clear();
  }
}

export type MutationSnapshot<T> = {
  key: string;
  payload: T;
  serialized: string;
  fingerprint: string;
};

/** A local, deterministic description of the human's exact current intent. */
export function mutationFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

const orderScopedMutationKinds = new Set([
  "address",
  "confirm",
  "override",
  "pack",
  "pick",
  "preflight",
  "registration",
  "sale",
  "ship",
  "shipping-method",
  "shipping-readiness",
  "upload",
]);

export type MutationScope =
  | { scope: "workspace"; kind: "catalog" | "policy" }
  | { scope: "creation"; kind: "create"; inventoryUnitId: string }
  | { scope: "order"; kind: string; orderId: string };

/** Parses only the stable slots that the shipping UI is allowed to execute. */
export function parseMutationScope(slot: string): MutationScope | null {
  const parts = slot.split(":");
  const [kind, identifier] = parts;
  if (!kind || !identifier) return null;
  if (kind === "policy" || kind === "catalog") {
    return parts.length === 2 ? { scope: "workspace", kind } : null;
  }
  if (kind === "create") {
    return parts.length === 2 ? { scope: "creation", kind, inventoryUnitId: identifier } : null;
  }
  if (!orderScopedMutationKinds.has(kind)) return null;
  if (kind === "upload") {
    if (parts.length !== 3 || !["packed_package", "product"].includes(parts[2] ?? "")) return null;
  } else if (parts.length !== 2) return null;
  return { scope: "order", kind, orderId: identifier };
}

export type MutationAuthorization = {
  reauthVisible: boolean;
  currentOrderId: string | null;
  taskOrderId: string | null;
  assignmentExpiresAt: string | null;
  managerAccess?: boolean;
  now?: number;
};

export type ShippingTaskRequestToken = { generation: number };

/** One monotonic clock shared by every shipping-task GET. */
export class ShippingTaskRequestGate {
  private generation = 0;

  begin(): ShippingTaskRequestToken {
    return { generation: ++this.generation };
  }

  isLatest(token: ShippingTaskRequestToken): boolean {
    return token.generation === this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }
}

export type ShippingPolicyRequestToken = ShippingTaskRequestToken;

/** A distinct latest-wins clock for owner policy GETs. */
export class ShippingPolicyRequestGate extends ShippingTaskRequestGate {}

/** Gives each initial private request its own failure observer. */
export async function observeInitialPrivateRequest(
  request: Promise<void>,
  onFailure: (reason: unknown) => void,
): Promise<void> {
  await request.catch((reason: unknown) => {
    onFailure(reason);
  });
}

export type PrivateSessionToken = { epoch: number };

/** A revoked SSR session can only be re-established by a fresh page/session boundary. */
export class PrivateSessionGate {
  private epoch = 0;
  private allowed = true;

  capture(): PrivateSessionToken {
    return { epoch: this.epoch };
  }

  isCurrent(token: PrivateSessionToken): boolean {
    return this.allowed && token.epoch === this.epoch;
  }

  revoke(): boolean {
    if (!this.allowed) return false;
    this.allowed = false;
    this.epoch += 1;
    return true;
  }

  get authorized(): boolean {
    return this.allowed;
  }
}

/** Cancels delayed mutation preparation without creating a new snapshot. */
export function cancelMutationIfSessionExpired(
  gate: PrivateSessionGate,
  token: PrivateSessionToken,
  settle: () => void,
): boolean {
  if (gate.isCurrent(token)) return false;
  settle();
  return true;
}

/** A hidden assignment or a changing order cannot be applied while a side effect owns its data. */
export function shouldDeferTaskResult(
  executionBusy: boolean,
  assignmentVisible: boolean,
  previousOrderId: string | null,
  nextOrderId: string | null,
): boolean {
  return executionBusy && (!assignmentVisible || previousOrderId !== nextOrderId);
}

export type ShippingTaskTransitionDecision = {
  previousOrderId: string | null;
  nextOrderId: string | null;
  protectedOrderId: string | null;
  preserveSlot: string | null;
  clearOrderId: string | null;
  orderChanged: boolean;
};

/**
 * Chooses the next order while protecting an unresolved order mutation. If
 * that assignment returns later, it takes priority so the exact retry can be
 * authorized again.
 */
export function decideShippingTaskTransition(
  previousOrderId: string | null,
  validOrderIds: readonly string[],
  pendingSlot: string | null,
): ShippingTaskTransitionDecision {
  const pendingScope = pendingSlot ? parseMutationScope(pendingSlot) : null;
  const protectedOrderId = pendingScope?.scope === "order" ? pendingScope.orderId : null;
  const preserveSlot = pendingScope ? pendingSlot : null;
  const nextOrderId =
    protectedOrderId && validOrderIds.includes(protectedOrderId)
      ? protectedOrderId
      : previousOrderId && validOrderIds.includes(previousOrderId)
        ? previousOrderId
        : (validOrderIds[0] ?? null);
  const orderChanged = previousOrderId !== nextOrderId;
  return {
    previousOrderId,
    nextOrderId,
    protectedOrderId,
    preserveSlot,
    clearOrderId: orderChanged && previousOrderId !== protectedOrderId ? previousOrderId : null,
    orderChanged,
  };
}

/** Workspace policy is independent; every order side effect needs the current live assignment. */
export function isMutationAuthorized(slot: string, authorization: MutationAuthorization): boolean {
  const parsed = parseMutationScope(slot);
  if (!parsed) return false;
  if (parsed.scope === "workspace") return true;
  if (parsed.scope === "creation") {
    return authorization.reauthVisible && authorization.managerAccess === true;
  }
  return (
    authorization.reauthVisible &&
    authorization.currentOrderId === parsed.orderId &&
    authorization.taskOrderId === parsed.orderId &&
    ((authorization.assignmentExpiresAt !== null &&
      isFutureIso(authorization.assignmentExpiresAt, authorization.now)) ||
      (authorization.managerAccess === true && authorization.assignmentExpiresAt === null))
  );
}

/** Keeps one human operation immutable until its outcome is known. */
export class MutationSnapshotStore {
  private readonly snapshots = new Map<string, MutationSnapshot<unknown>>();

  getWithKey<T>(
    operation: string,
    fingerprint: string,
    createKey: () => string,
    createPayload: (key: string) => T,
  ): MutationSnapshot<T> {
    const existing = this.snapshots.get(operation) as MutationSnapshot<T> | undefined;
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new MutationBlockedError();
      return existing;
    }
    const key = createKey();
    const payload = createPayload(key);
    const snapshot = {
      key,
      payload,
      serialized: JSON.stringify(payload),
      fingerprint,
    };
    this.snapshots.set(operation, snapshot);
    return snapshot;
  }

  peek<T>(operation: string): MutationSnapshot<T> | undefined {
    return this.snapshots.get(operation) as MutationSnapshot<T> | undefined;
  }

  clear(operation: string): void {
    this.snapshots.delete(operation);
  }

  clearAll(): void {
    this.snapshots.clear();
  }

  clearWhere(predicate: (slot: string) => boolean): void {
    for (const slot of this.snapshots.keys()) {
      if (predicate(slot)) this.snapshots.delete(slot);
    }
  }
}

/**
 * One unknown outcome blocks every other side effect. The same slot may be
 * retried only when its complete intent fingerprint is unchanged.
 */
export class MutationCoordinator {
  private readonly snapshots = new MutationSnapshotStore();
  private unknownSlot: string | null = null;

  assertRunnable(slot?: string): void {
    if (this.unknownSlot && this.unknownSlot !== slot) throw new MutationBlockedError();
  }

  assertIntent(slot: string, fingerprint: string): void {
    this.assertRunnable(slot);
    const existing = this.snapshots.peek(slot);
    if (existing && existing.fingerprint !== fingerprint) throw new MutationBlockedError();
  }

  get<T>(
    slot: string,
    fingerprint: string,
    createKey: () => string,
    create: (key: string) => T,
  ): MutationSnapshot<T> {
    this.assertIntent(slot, fingerprint);
    return this.snapshots.getWithKey(slot, fingerprint, createKey, create);
  }

  peek<T>(slot: string): MutationSnapshot<T> | undefined {
    return this.snapshots.peek(slot);
  }

  has(slot: string): boolean {
    return Boolean(this.snapshots.peek(slot));
  }

  markUnknown(slot: string): void {
    if (!this.snapshots.peek(slot)) {
      throw new Error("通信結果が不明な操作の再送情報を確認できません。");
    }
    if (this.unknownSlot && this.unknownSlot !== slot) throw new MutationBlockedError();
    this.unknownSlot = slot;
  }

  settle(slot: string): void {
    this.snapshots.clear(slot);
    if (this.unknownSlot === slot) this.unknownSlot = null;
  }

  clearAll(): void {
    this.snapshots.clearAll();
    this.unknownSlot = null;
  }

  clearOrder(orderId: string): void {
    const belongsToOldOrder = (slot: string) => {
      const scope = parseMutationScope(slot);
      return scope?.scope === "order" && scope.orderId === orderId;
    };
    this.snapshots.clearWhere(belongsToOldOrder);
    if (this.unknownSlot && belongsToOldOrder(this.unknownSlot)) this.unknownSlot = null;
  }

  get pendingSlot(): string | null {
    return this.unknownSlot;
  }
}

export type UploadAttemptKind = "fresh" | "unknown_retry";

/** Only a slot whose prior network outcome is unknown may retain its File/key on local read failure. */
export function classifyUploadAttempt(
  coordinator: MutationCoordinator,
  slot: string,
): UploadAttemptKind {
  if (coordinator.pendingSlot !== slot) return "fresh";
  if (!coordinator.has(slot)) {
    throw new Error("通信結果が不明な写真の再送情報を確認できません。");
  }
  return "unknown_retry";
}

export class MutationBlockedError extends Error {
  constructor(message = "前の操作の結果を確認中です。表示中の再試行ボタンだけを使ってください。") {
    super(message);
    this.name = "MutationBlockedError";
  }
}

export type RetryOperation = {
  slot: string;
  label: string;
  action: () => Promise<void>;
};

/** Retains the exact action closure even when the ordinary task button disappears. */
export class MutationRetryRegistry {
  private operation: RetryOperation | null = null;

  remember(operation: RetryOperation): void {
    if (this.operation && this.operation.slot !== operation.slot) throw new MutationBlockedError();
    if (!this.operation) this.operation = operation;
  }

  peek(): RetryOperation | null {
    return this.operation;
  }

  clear(slot: string): void {
    if (this.operation?.slot === slot) this.operation = null;
  }

  clearAll(): void {
    this.operation = null;
  }

  clearOrder(orderId: string): void {
    if (!this.operation) return;
    const scope = parseMutationScope(this.operation.slot);
    if (scope?.scope === "order" && scope.orderId === orderId) this.operation = null;
  }
}

export type ShippingExecutionToken = symbol;

/** Synchronous lock: only one shipping side effect may be active at a time. */
export class ShippingExecutionGate {
  private active: ShippingExecutionToken | null = null;

  acquire(): ShippingExecutionToken {
    if (this.active)
      throw new MutationBlockedError("別の操作を処理中です。完了してからもう一度お試しください。");
    const token = Symbol("shipping-execution");
    this.active = token;
    return token;
  }

  release(token: ShippingExecutionToken): void {
    if (this.active === token) this.active = null;
  }

  get busy(): boolean {
    return this.active !== null;
  }
}

/** Manual selection cannot discard any unresolved mutation or active side effect. */
export function assertOrderSwitchAllowed(
  coordinator: MutationCoordinator,
  executionGate: ShippingExecutionGate,
): void {
  if (coordinator.pendingSlot) {
    throw new MutationBlockedError(
      "前の操作結果を確認中のため、注文を切り替えられません。先に再試行してください。",
    );
  }
  if (executionGate.busy) {
    throw new MutationBlockedError("別の操作を処理中のため、注文を切り替えられません。");
  }
}

/** The component uses this single gate immediately before invoking an action. */
export function authorizeAndAcquireExecution(
  gate: ShippingExecutionGate,
  authorizationSlot: string | undefined,
  authorization: MutationAuthorization,
): ShippingExecutionToken {
  if (authorizationSlot && !isMutationAuthorized(authorizationSlot, authorization)) {
    throw new MutationBlockedError(
      "担当注文を再確認しています。確認が終わってから同じ操作を再試行してください。",
    );
  }
  return gate.acquire();
}

/** Settles the POST snapshot before any potentially failing follow-up GET. */
export async function completeMutationBeforeFollowUp<T>(
  send: () => Promise<T>,
  settle: () => void,
  followUp: (result: T) => void | Promise<void>,
  sessionCurrent: () => boolean = () => true,
): Promise<T | undefined> {
  if (!sessionCurrent()) {
    settle();
    return undefined;
  }
  const result = await send();
  settle();
  if (!sessionCurrent()) return result;
  await followUp(result);
  return result;
}

/** A 409 is explicit, so only its own slot is settled before recovery GET. */
export async function settleBeforeConflictRecovery(
  coordinator: MutationCoordinator,
  slot: string,
  recover: () => Promise<void>,
): Promise<void> {
  coordinator.settle(slot);
  await recover();
}

export type SensitiveToken = {
  orderId: string;
  generation: number;
  kind: string;
  sequence: number;
};

/** Guards private address/lease responses after a task changes or expires. */
export class SensitiveShippingController {
  private generation = 0;
  private leaseAbort: AbortController | null = null;
  private addressAbort: AbortController | null = null;
  private revalidationAbort: AbortController | null = null;
  private leaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sequences = new Map<string, number>();
  private readonly activeSequences = new Map<string, number>();

  invalidate(): void {
    this.generation += 1;
    this.leaseAbort?.abort();
    this.addressAbort?.abort();
    this.revalidationAbort?.abort();
    this.leaseAbort = this.addressAbort = this.revalidationAbort = null;
    this.activeSequences.clear();
    if (this.leaseTimer) clearTimeout(this.leaseTimer);
    this.leaseTimer = null;
  }

  begin(
    kind: "lease" | "address" | "revalidation",
    orderId: string,
  ): { token: SensitiveToken; signal: AbortSignal } {
    const field =
      kind === "lease" ? "leaseAbort" : kind === "address" ? "addressAbort" : "revalidationAbort";
    this[field]?.abort();
    const controller = new AbortController();
    this[field] = controller;
    const sequence = (this.sequences.get(kind) ?? 0) + 1;
    this.sequences.set(kind, sequence);
    this.activeSequences.set(kind, sequence);
    return {
      token: { orderId, generation: this.generation, kind, sequence },
      signal: controller.signal,
    };
  }

  isCurrent(token: SensitiveToken, currentOrderId: string | null): boolean {
    return (
      token.orderId === currentOrderId &&
      token.generation === this.generation &&
      this.activeSequences.get(token.kind) === token.sequence
    );
  }

  ownLeaseTimer(
    token: SensitiveToken,
    currentOrderId: () => string | null,
    expiresAt: string,
    onExpire: () => void,
  ): void {
    if (this.leaseTimer) clearTimeout(this.leaseTimer);
    if (!this.isCurrent(token, currentOrderId())) return;
    const wait = Math.max(0, Date.parse(expiresAt) - Date.now());
    this.leaseTimer = setTimeout(() => {
      if (this.isCurrent(token, currentOrderId())) onExpire();
    }, wait);
  }
}

export function recoveryDecision(
  status: number,
  scope: "policy" | "order",
): "clear" | "policy" | "order" | "none" {
  if (status === 401 || status === 403) return "clear";
  if (status === 409) return scope;
  return "none";
}

export function isSessionAuthorizationFailure(reason: unknown): boolean {
  if (typeof reason !== "object" || reason === null || !("status" in reason)) return false;
  const status = (reason as { status?: unknown }).status;
  return status === 401 || status === 403;
}

/** Runs the same immediate full-clear callback for every session auth failure path. */
export function handleSessionAuthorizationFailure(
  reason: unknown,
  clearSessionState: () => void,
): boolean {
  if (!isSessionAuthorizationFailure(reason)) return false;
  clearSessionState();
  return true;
}

/** Only explicit HTTP outcomes can safely discard an idempotency snapshot. */
export function shouldDiscardSnapshot(status: number | undefined): boolean {
  return status !== undefined && [400, 401, 403, 404, 409, 413].includes(status);
}

export function shouldClearOrderScopedState(
  previousOrderId: string | null,
  nextOrderId: string | null,
): boolean {
  return previousOrderId !== null && previousOrderId !== nextOrderId;
}

export function belongsToOrder(
  value: { orderId: string } | null,
  currentOrderId: string | null,
): boolean {
  return Boolean(value && value.orderId === currentOrderId);
}

export type AssignedLocationPhotoDisplay = {
  orderId: string;
  sourceUrl: string;
  objectUrl: string;
};

/** Keeps a loaded private image out of the DOM as soon as its exact task binding is no longer live. */
export function visibleAssignedLocationPhotoUrl(
  display: AssignedLocationPhotoDisplay | null,
  task: {
    orderId: string;
    locationPhotoUrl: string | null;
    assignmentExpiresAt: string | null;
  } | null,
  assignmentVisible: boolean,
  now = Date.now(),
  managerAccess = false,
): string | undefined {
  if (
    !assignmentVisible ||
    !display ||
    !task ||
    !task.locationPhotoUrl ||
    !(
      (task.assignmentExpiresAt !== null && isFutureIso(task.assignmentExpiresAt, now)) ||
      (managerAccess && task.assignmentExpiresAt === null)
    ) ||
    display.orderId !== task.orderId ||
    display.sourceUrl !== task.locationPhotoUrl
  ) {
    return undefined;
  }
  return display.objectUrl;
}

/** Fail-closed gate used while the app proves a backgrounded assignment is still valid. */
export class ReauthVisibilityGate {
  private allowed = true;
  hide(): boolean {
    this.allowed = false;
    return this.allowed;
  }
  allowAfterValidAssignment(): boolean {
    this.allowed = true;
    return this.allowed;
  }
  get visible(): boolean {
    return this.allowed;
  }
}

export function pickerChangeDecision(gate: ReauthVisibilityGate): "send" | "queue" {
  return gate.visible ? "send" : "queue";
}

export function pickerExecutionDecision(
  gate: ReauthVisibilityGate,
  executionGate: ShippingExecutionGate,
  uiBusy: boolean,
): "send" | "queue" {
  if (uiBusy || executionGate.busy) return "queue";
  return pickerChangeDecision(gate);
}

/** A native picker may retain one exact File while assignment reauthorization is pending. */
export class PickerUploadQueue<T extends { intentId: string; orderId: string }> {
  private pending: T | null = null;

  queue(value: T): void {
    if (this.pending && this.pending.intentId !== value.intentId) throw new MutationBlockedError();
    this.pending = value;
  }

  take(orderId: string): T | null {
    if (!this.pending || this.pending.orderId !== orderId) return null;
    const result = this.pending;
    this.pending = null;
    return result;
  }

  peek(): T | null {
    return this.pending;
  }

  clear(): void {
    this.pending = null;
  }
}

/** Takes one queued File only when the same authorization/run gates would permit its POST. */
export function takeQueuedUploadForExecution<
  T extends { intentId: string; operation: string; orderId: string },
>(
  queue: PickerUploadQueue<T>,
  authorization: MutationAuthorization,
  executionGate: ShippingExecutionGate,
  uiBusy: boolean,
  unknownSlot: string | null,
): T | null {
  const pending = queue.peek();
  if (!pending || uiBusy || executionGate.busy) return null;
  if (unknownSlot && unknownSlot !== pending.operation) return null;
  if (!isMutationAuthorized(pending.operation, authorization)) return null;
  return queue.take(pending.orderId);
}
