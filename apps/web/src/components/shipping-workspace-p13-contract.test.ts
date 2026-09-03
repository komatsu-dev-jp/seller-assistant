import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("apps/web/src/components/shipping-workspace.tsx"), "utf8");
const proxy = readFileSync(
  resolve("apps/web/src/app/v1/workspaces/[workspaceId]/[[...segments]]/route.ts"),
  "utf8",
);
const proxyHelper = readFileSync(resolve("apps/web/src/lib/workspace-proxy-request.ts"), "utf8");
const safety = readFileSync(resolve("apps/web/src/lib/shipping-live-safety.ts"), "utf8");
const styles = readFileSync(resolve("apps/web/src/app/globals.css"), "utf8");

describe("P13 live shipping web contract", () => {
  it("keeps the policy unsaved until an owner saves an explicit positive threshold", () => {
    expect(source).toContain(
      'const [policyMode, setPolicyMode] = useState<ShippingPhotoPolicyMode>("high_value_only")',
    );
    expect(source).toContain('setThresholdInput("")');
    expect(source).toContain("未保存：DBに写真設定はありません");
    expect(source).toContain("保存するまで、設定はまだ作られていません。");
    expect(source).toContain("highValueThresholdMinor: threshold");
    expect(source).toContain("humanConfirmed: true");
  });

  it("uses only the frozen preflight, upload, confirmation, and strict pack/ship contracts", () => {
    for (const path of [
      "shipping-photo-preflight",
      "shipping-photo-override",
      "shipping-photos",
      "shipping-photo-confirmations",
      "sale-amount",
    ]) {
      expect(source).toContain(path);
      expect(proxyHelper).toContain(path);
    }
    expect(source).toContain("const assetIds = activePreflight.assets.map");
    expect(source).toContain("role: pending.role");
    expect(source).toContain('capture="environment"');
    expect(source).toContain("写真を追加した後は、もう一度すべて確認してください。");
    expect(source).toContain("satisfies PackOrderRequest");
    expect(source).toContain("satisfies ShipOrderRequest");
    expect(source).not.toMatch(/packingEvidenceReferenceId|confirmedAt.*PackOrderRequest/u);
    expect(source).toContain("shippingMethodSelectionId: intent.shippingMethodSelectionId");
    expect(source).toContain("readinessConfirmationId: intent.readinessConfirmationId");
    expect(source).toContain("shippedAt: intent.shippedAt");
  });

  it("does not render money or private storage details to the shipping role", () => {
    expect(source).toContain("const canManage = canRecordShippingSale(role)");
    expect(source).toContain("canRecordShippingSale");
    expect(source).toMatch(/canManage\s*&&\s*activePreflight\.saleAmountStatus === "missing"/u);
    expect(source).toContain("写真の保存場所は、発送担当へ表示しません。");
    expect(source).not.toContain("storageKey");
    expect(source).not.toContain("highValueThresholdMinor: policy");
    expect(source).not.toContain("saleAmountMinor: preflight");
  });

  it("clears sensitive order state before refresh and keeps retries on one operation key", () => {
    expect(source).toContain(
      "const activePreflight = preflight?.orderId === task?.orderId ? preflight : null",
    );
    expect(source).toContain("preflightAbort.current?.abort()");
    expect(source).toContain("setTasks([])");
    expect(source).toContain("setPendingUpload(null)");
    expect(source).toContain('setSaleOccurredAt("")');
    expect(source).toContain('window.addEventListener("focus", revalidate)');
    expect(source).toContain('document.addEventListener("visibilitychange", onVisibility)');
    expect(source).toContain("MutationCoordinator");
    expect(source).toContain("mutationFingerprint");
    expect(source).toContain("mutations.current.assertIntent");
    expect(source).toContain("completeMutationBeforeFollowUp");
    expect(source.match(/await completePrivateMutationBeforeFollowUp\(/gu)).toHaveLength(14);
    expect(
      source.match(/await completePrivateMutationBeforeFollowUp\(\s*sessionToken,/gu),
    ).toHaveLength(14);
    expect(source).toContain("snapshot.payload.query");
    expect(source).toContain("snapshot.payload.file");
    expect(source).toContain('type="datetime-local"');
    expect(source).toContain("入力内容を人が確認し、この販売額として記録します");
    expect(source).not.toContain("occurredAt: new Date().toISOString()");
    expect(source).toContain("pickerExecutionDecision(");
    expect(source).toContain("shippingPhotoChoiceAction(");
    expect(source).toContain("activePreflight?.saleAmountStatus ?? null");
    expect(source).toContain("現在の設定で写真の要否を決める");
    expect(source).toContain("photoStatusLabel=");
    expect(source).toContain('activePreflight.state === "satisfied_without_photo"');
    expect(source).toContain("`${activePreflight.assets.length}枚・確認済み`");
    expect(source).toContain("画面の情報が更新されていました。");
    expect(source).not.toContain("if (reauthVisible) void run");

    const privateCompleteStart = source.indexOf(
      "async function completePrivateMutationBeforeFollowUp",
    );
    const privateCompleteEnd = source.indexOf("async function savePolicy", privateCompleteStart);
    const privateComplete = source.slice(privateCompleteStart, privateCompleteEnd);
    expect(privateComplete).toContain("sessionToken: PrivateSessionToken");
    expect(privateComplete).not.toContain("privateSessionGate.current.capture()");
    expect(privateComplete).toContain("completeMutationBeforeFollowUp(send, settle, followUp");
    expect(privateComplete).toContain("privateSessionGate.current.isCurrent(sessionToken)");

    for (const name of [
      "savePolicy",
      "saveShippingCatalogEntry",
      "evaluatePreflight",
      "choosePhotos",
      "uploadPhoto",
      "confirmPhotos",
      "recordSaleAmount",
      "saveOrderRegistration",
      "createOrder",
      "selectOrderShippingMethod",
      "confirmOrderShippingReadiness",
      "pick",
      "confirmPacking",
      "confirmShipment",
    ]) {
      const entryStart = source.indexOf(`async function ${name}`);
      const entryBody = source.indexOf("{", entryStart);
      expect(source.slice(entryBody, entryBody + 180)).toContain(
        "const sessionToken = privateSessionGate.current.capture()",
      );
    }

    for (const [name, snapshotMarker] of [
      ["pick", "const snapshot = mutations.current.get"],
      ["confirmPacking", "const body = operationBody"],
      ["confirmShipment", "const body = operationBody"],
    ] as const) {
      const entryStart = source.indexOf(`async function ${name}`);
      const entryEnd = source.indexOf("\n  async function ", entryStart + 1);
      const entry = source.slice(entryStart, entryEnd);
      const lease = entry.indexOf("await requireLease()");
      const postLeaseGate = entry.indexOf("cancelMutationIfSessionExpired(", lease);
      const snapshot = entry.indexOf(snapshotMarker);
      expect(lease).toBeGreaterThan(-1);
      expect(postLeaseGate).toBeGreaterThan(lease);
      expect(snapshot).toBeGreaterThan(postLeaseGate);
    }

    const uploadStart = source.indexOf("async function uploadPhoto");
    const uploadEnd = source.indexOf("async function confirmPhotos", uploadStart);
    const upload = source.slice(uploadStart, uploadEnd);
    const classification = upload.indexOf("classifyUploadAttempt(");
    const fileRead = upload.indexOf("await uploadFile.arrayBuffer()");
    const postReadGate = upload.indexOf("cancelMutationIfSessionExpired(", fileRead);
    const freshSnapshot = upload.indexOf("mutations.current.get<UploadSnapshotPayload>");
    const binarySend = upload.indexOf("requestBinary<ShippingPhotoAssetResponse>", postReadGate);
    expect(classification).toBeGreaterThan(-1);
    expect(fileRead).toBeGreaterThan(-1);
    expect(fileRead).toBeGreaterThan(classification);
    expect(postReadGate).toBeGreaterThan(fileRead);
    expect(freshSnapshot).toBeGreaterThan(postReadGate);
    expect(binarySend).toBeGreaterThan(postReadGate);
    expect(binarySend).toBeGreaterThan(freshSnapshot);
    expect(upload).toContain('uploadAttempt === "unknown_retry" ? existingSnapshot!.payload.file');
    const readFailure = upload.slice(upload.indexOf("} catch (reason)"), postReadGate);
    expect(readFailure).toContain('if (uploadAttempt === "fresh")');
    expect(readFailure).toContain("settleOperation(pending.operation)");
    expect(readFailure).toContain("current?.intentId === pending.intentId ? null : current");

    const uploadClassifierStart = safety.indexOf("export function classifyUploadAttempt");
    const uploadClassifierEnd = safety.indexOf("export class MutationBlockedError");
    const uploadClassifier = safety.slice(uploadClassifierStart, uploadClassifierEnd);
    expect(uploadClassifier).toContain('return "fresh"');
    expect(uploadClassifier).toContain('return "unknown_retry"');
    expect(uploadClassifier).toContain("coordinator.pendingSlot !== slot");
    expect(uploadClassifier).toContain("coordinator.has(slot)");

    const completeStart = safety.indexOf("export async function completeMutationBeforeFollowUp");
    const completeEnd = safety.indexOf("export async function settleBeforeConflictRecovery");
    const completeHelper = safety.slice(completeStart, completeEnd);
    const preSendGate = completeHelper.indexOf("if (!sessionCurrent())");
    const cancelledSettle = completeHelper.indexOf("settle()", preSendGate);
    const send = completeHelper.indexOf("const result = await send()");
    const sentSettle = completeHelper.indexOf("settle()", send);
    const postSendGate = completeHelper.indexOf("if (!sessionCurrent()) return result", sentSettle);
    const followUp = completeHelper.indexOf("await followUp(result)");
    expect(preSendGate).toBeGreaterThan(-1);
    expect(cancelledSettle).toBeGreaterThan(preSendGate);
    expect(cancelledSettle).toBeLessThan(send);
    expect(sentSettle).toBeGreaterThan(send);
    expect(postSendGate).toBeGreaterThan(sentSettle);
    expect(followUp).toBeGreaterThan(postSendGate);
  });

  it("wires the exact retry, order switch, picker, and unknown-outcome gates into the component", () => {
    expect(source).toContain("MutationRetryRegistry");
    expect(source).toContain("前回の操作結果を確認できません");
    expect(source).toContain("retry.action");
    expect(source).toContain("reason instanceof UnknownRequestError");
    expect(source).toContain("mutations.current.has(slot)");
    expect(source).toContain("mutations.current.assertRunnable(slot)");
    expect(source).toContain("mutations.current.assertRunnable()");
    expect(source).toContain("PickerUploadQueue");
    expect(source).toContain("pickerExecutionDecision(");
    expect(source).toContain("queuedUpload.current.queue(next)");
    expect(source).toContain("takeQueuedUploadForExecution(");
    expect(source).toContain("pending.orderId !== currentOrderId.current");
    expect(source).toContain("belongsToOrder(address, task?.orderId ?? null)");
    expect(source).toContain("isCurrent(started.token, currentOrderId.current)");
    expect(source).toContain("isMutationAuthorized(retryDisplay.slot, renderAuthorization)");
    expect(source).toMatch(
      /disabled=\{busy !== null \|\| executionGate\.current\.busy \|\| !retryAuthorized\}/u,
    );

    const runStart = source.indexOf("async function run(");
    const runnableGate = source.indexOf("mutations.current.assertRunnable(slot)", runStart);
    const authorizationGate = source.indexOf("authorizeAndAcquireExecution(", runStart);
    const action = source.indexOf("await action()", runStart);
    expect(runStart).toBeGreaterThan(-1);
    expect(runnableGate).toBeGreaterThan(runStart);
    expect(authorizationGate).toBeGreaterThan(runnableGate);
    expect(action).toBeGreaterThan(authorizationGate);

    const selectStart = source.indexOf("function selectOrder(orderId: string)");
    const selectGate = source.indexOf("assertOrderSwitchAllowed(", selectStart);
    const selectClear = source.indexOf("clearOrderScopeForSwitch(previous)", selectStart);
    expect(selectGate).toBeGreaterThan(selectStart);
    expect(selectClear).toBeGreaterThan(selectGate);

    const scopedClearStart = source.indexOf("const clearOrderScopeForSwitch");
    const scopedClearEnd = source.indexOf(
      "const clearPrivateForAutomaticTransition",
      scopedClearStart,
    );
    const scopedClear = source.slice(scopedClearStart, scopedClearEnd);
    expect(scopedClear).toContain("mutations.current.clearOrder(oldOrderId)");
    expect(scopedClear).toContain("retryRegistry.current.clearOrder(oldOrderId)");
    expect(scopedClear).not.toContain("clearAllMutations");

    const sensitiveClearStart = source.indexOf("const clearSessionState");
    const sensitiveClear = source.slice(sensitiveClearStart, scopedClearStart);
    expect(sensitiveClear).toContain("if (!privateSessionGate.current.revoke()) return");
    expect(sensitiveClear).toContain("privateSessionGate.current.revoke()");
    expect(sensitiveClear).toContain("taskRequestGate.current.invalidate()");
    expect(sensitiveClear).toContain("policyRequestGate.current.invalidate()");
    expect(sensitiveClear).toContain("clearAllMutations()");
    expect(sensitiveClear).toContain("setSessionAuthorized(false)");
    expect(sensitiveClear).toContain("setPolicy(null)");
    expect(sensitiveClear).toContain('setPolicyMode("high_value_only")');
    expect(sensitiveClear).toContain('setThresholdInput("")');
    expect(sensitiveClear).toContain("setTasks([])");
    expect(sensitiveClear).toContain("setSelectedOrderId(null)");
    expect(sensitiveClear).toContain("setPreflight(null)");
    expect(sensitiveClear).toContain("setPendingUpload(null)");
    expect(sensitiveClear).toContain("queuedUpload.current.clear()");
    expect(sensitiveClear).toContain('setInventoryInput("")');
    expect(sensitiveClear).toContain('setSaleAmountInput("")');
    expect(sensitiveClear).toContain("setReauthVisible(reauthGate.current.hide())");
    expect(sensitiveClear).toContain("clearLease()");
    expect(sensitiveClear).toContain(
      "handleSessionAuthorizationFailure(reason, clearSessionState)",
    );

    const pickerIntent = source.indexOf("const intentId = crypto.randomUUID()");
    const pickerGate = source.indexOf(
      "mutations.current.assertIntent(operation, fingerprint)",
      pickerIntent,
    );
    const pickerStateWrite = source.indexOf("setPendingUpload(next)", pickerIntent);
    expect(pickerIntent).toBeGreaterThan(-1);
    expect(pickerGate).toBeGreaterThan(pickerIntent);
    expect(pickerStateWrite).toBeGreaterThan(pickerGate);

    const refreshStart = source.indexOf("const applyTaskResult");
    const decision = source.indexOf("decideShippingTaskTransition(", refreshStart);
    const clear = source.indexOf("clearPrivateForAutomaticTransition(transition)", refreshStart);
    const setTasks = source.indexOf("setTasks(validTasks)", clear);
    expect(refreshStart).toBeGreaterThan(-1);
    expect(decision).toBeGreaterThan(refreshStart);
    expect(clear).toBeGreaterThan(decision);
    expect(setTasks).toBeGreaterThan(clear);
    expect(source).toContain("deferredTaskResult.current = { token, result }");
    expect(source).toContain("setExecutionRevision((current) => current + 1)");

    const conflictStart = source.indexOf("reason.status === 409 && slot");
    const conflictEnd = source.indexOf("shouldDiscardSnapshot", conflictStart);
    const conflictBranch = source.slice(conflictStart, conflictEnd);
    expect(conflictBranch).toContain("settleBeforeConflictRecovery");
    expect(conflictBranch).toContain("clearIfSessionAuthorizationFailed(recoveryReason)");
    expect(conflictBranch).toContain("setError(errorMessage(recoveryReason))");
    expect(conflictBranch).not.toContain("clearAll");

    const normalAuth = source.indexOf("clearIfSessionAuthorizationFailed(reason)", runStart);
    expect(normalAuth).toBeGreaterThan(runStart);
    expect(normalAuth).toBeLessThan(conflictStart);
  });

  it("uses one latest-wins task clock and separates assignment expiry from session clearing", () => {
    expect(source.match(/\/shipping-tasks/gu)).toHaveLength(1);
    expect(source).toContain("new ShippingTaskRequestGate()");
    expect(source).toContain("new ShippingPolicyRequestGate()");
    expect(source).toContain("new PrivateSessionGate()");
    expect(source).toContain("isOwner && sessionAuthorized");
    expect(source).not.toContain("setSessionAuthorized(true)");

    const policyStart = source.indexOf("const loadPolicy = useCallback");
    const policyEnd = source.indexOf("const loadPreflight", policyStart);
    const policyBranch = source.slice(policyStart, policyEnd);
    expect(policyBranch).toContain("privateSessionGate.current.authorized");
    expect(policyBranch).toContain("privateSessionGate.current.capture()");
    expect(policyBranch).toContain("policyRequestGate.current.begin()");
    expect(policyBranch).toContain("privateSessionGate.current.isCurrent(sessionToken)");
    expect(policyBranch).toContain("policyRequestGate.current.isLatest(requestToken)");
    expect(policyBranch.indexOf("policyRequestGate.current.isLatest(requestToken)")).toBeLessThan(
      policyBranch.indexOf("setPolicy(result)"),
    );

    const hideStart = source.indexOf("const hideAssignmentForRevalidation");
    const applyStart = source.indexOf("const applyTaskResult", hideStart);
    const hideBranch = source.slice(hideStart, applyStart);
    expect(hideBranch).toContain("taskRequestGate.current.invalidate()");
    expect(hideBranch).toContain("setReauthVisible(reauthGate.current.hide())");
    expect(hideBranch).toContain("clearLease()");
    expect(hideBranch).not.toContain("clearAllMutations");
    expect(hideBranch).not.toContain("setPendingUpload(null)");

    const deferredEffectStart = source.indexOf(
      "if (executionGate.current.busy) return",
      applyStart,
    );
    const refreshStart = source.indexOf("const refresh = useCallback", deferredEffectStart);
    const applyBranch = source.slice(applyStart, deferredEffectStart);
    const deferredBranch = source.slice(deferredEffectStart, refreshStart);
    expect(applyBranch).toContain("taskRequestGate.current.isLatest(token)");
    expect(applyBranch).toContain("shouldDeferTaskResult(");
    expect(applyBranch).toContain("decideShippingTaskTransition(");
    expect(applyBranch).toContain("clearPrivateForAutomaticTransition(transition)");
    expect(applyBranch).not.toContain("clearSessionState()");
    expect(deferredBranch).toContain("taskRequestGate.current.isLatest(deferred.token)");
    expect(deferredBranch).toContain("applyTaskResult(deferred.result, deferred.token)");

    const refreshEnd = source.indexOf("refreshRef.current = refresh", refreshStart);
    const refreshBranch = source.slice(refreshStart, refreshEnd);
    const sessionCapture = refreshBranch.indexOf("privateSessionGate.current.capture()");
    const begin = refreshBranch.indexOf("taskRequestGate.current.begin()");
    const request = refreshBranch.indexOf("/shipping-tasks");
    const sessionLatest = refreshBranch.indexOf(
      "privateSessionGate.current.isCurrent(sessionToken)",
    );
    const latest = refreshBranch.indexOf("taskRequestGate.current.isLatest(token)");
    const apply = refreshBranch.indexOf("applyTaskResult(result, token)");
    expect(sessionCapture).toBeGreaterThan(-1);
    expect(begin).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(begin);
    expect(sessionLatest).toBeGreaterThan(request);
    expect(latest).toBeGreaterThan(request);
    expect(apply).toBeGreaterThan(latest);

    const initialStart = source.indexOf("const handleInitialFailure = (reason: unknown)");
    const initialEnd = source.indexOf("const orderId = task?.orderId ?? null", initialStart);
    const initialBranch = source.slice(initialStart, initialEnd);
    expect(initialBranch).toContain("clearIfSessionAuthorizationFailed(reason)");
    expect(initialBranch).toContain(
      "observeInitialPrivateRequest(refresh(), handleInitialFailure)",
    );
    expect(initialBranch).toContain(
      "observeInitialPrivateRequest(loadPolicy(), handleInitialFailure)",
    );
    expect(initialBranch).toContain("Promise.all([taskRequest, policyRequest]).finally");
    expect(initialBranch).not.toMatch(/Promise\.all\(\[taskRequest, policyRequest\]\)\s*\.catch/u);

    const expiryStart = source.indexOf("const refreshAfterAssignmentExpiry");
    const expiryEnd = source.indexOf("const revalidate", expiryStart);
    const expiryBranch = source.slice(expiryStart, expiryEnd);
    expect(expiryBranch).toContain("hideAssignmentForRevalidation()");
    expect(expiryBranch).toContain("refresh()");
    expect(expiryBranch).not.toContain("clearAllMutations");
  });

  it("shows only a fresh-login recovery panel after the private session is revoked", () => {
    expect(source).toContain("{!sessionAuthorized ? (");
    expect(source).toContain("ログインが切れました");
    expect(source).toContain('<a href="/login">ログインし直す</a>');
    expect(source).toContain("sessionAuthorized && !loading && tasks.length === 0");
    expect(source).toContain("sessionAuthorized && task && reauthVisible");
    expect(source).toContain("sessionAuthorized && retryDisplay");
    expect(source).toContain("sessionAuthorized && loading");
    expect(styles).toContain(".shippingSessionExpired a");
    const loginLinkStyle = styles.slice(
      styles.indexOf(".shippingSessionExpired a"),
      styles.indexOf(".shippingPolicy", styles.indexOf(".shippingSessionExpired a")),
    );
    expect(loginLinkStyle).toContain("min-height: 44px");
    expect(styles).toContain(".shippingAppShell a:focus-visible");
  });

  it("preserves only the exact unknown order retry during automatic task transitions", () => {
    const automaticStart = source.indexOf("const clearPrivateForAutomaticTransition");
    const automaticEnd = source.indexOf("const operationBody", automaticStart);
    const automaticBranch = source.slice(automaticStart, automaticEnd);
    expect(automaticBranch).toContain("mutations.current.clearOrder(decision.clearOrderId)");
    expect(automaticBranch).toContain("retryRegistry.current.clearOrder(decision.clearOrderId)");
    expect(automaticBranch).toContain("current?.slot === decision.preserveSlot");
    expect(automaticBranch).toContain("current?.operation === decision.preserveSlot");
    expect(automaticBranch).toContain('setInventoryInput("")');
    expect(automaticBranch).toContain("clearLease()");
    expect(automaticBranch).not.toContain("clearAllMutations");
    expect(automaticBranch).not.toContain("setPendingUpload(null)");

    const taskEffect = source.slice(
      source.indexOf("const orderId = task?.orderId ?? null"),
      source.indexOf("const refreshAfterAssignmentExpiry"),
    );
    expect(taskEffect).toContain("decideShippingTaskTransition(");
    expect(taskEffect).toContain(
      "current?.operation === mutations.current.pendingSlot ? current : null",
    );
  });

  it("keeps the proxy method and segment allowlist narrow and private image headers intact", () => {
    expect(proxy).toContain("export async function PUT");
    expect(proxy).toContain('method !== "GET" && !matchesConfiguredAppOrigin');
    expect(proxy).toContain('segments[2] === "shipping-photos"');
    expect(proxy).toContain('segments[4] === "content"');
    expect(proxy).toContain('"cache-control": "private, no-store"');
    expect(proxy).toContain('pragma: "no-cache"');
    expect(proxy).toContain('"x-content-type-options": "nosniff"');
  });
});
