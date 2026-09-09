"use client";

import type {
  DiscrepancyChallengeResponse,
  DiscrepancyEvidenceListItem,
  DiscrepancyEvidenceResponse,
  LocationNodeResponse,
  P0ItemResponse,
  StocktakeResponse,
  ReturnCatalogResponse,
} from "@resale/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { stocktakeAuditEntries } from "../lib/stocktake-audit";
import { selectFocusedStocktake } from "../lib/stocktake-focus";
import { hasValidCodeCheckDigit } from "@resale/contracts";
import { shortInventoryNumber } from "../lib/inventory-label";
import {
  assertStocktakeChallengeTarget,
  validateStocktakeScanTimes,
  assertReturnSnapshot,
  validateReturnInventoryNumber,
  isReturnQuarantineLocation,
  inventoryStateLabel,
} from "../lib/inventory-live-safety";
import styles from "./inventory-live.module.css";

type PendingChallenge = {
  stocktakeId: string;
  response: DiscrepancyChallengeResponse;
  discrepancyId: string;
  action: "confirm" | "restore";
  evidenceId: string | null;
  reasonCode: string;
  reasonNote: string;
};

type MobileStocktakeStage = "mode" | "count" | "difference" | "audit" | "labels";

export type StocktakeFocus = "all" | "approval-pending";

export function StocktakeWorkspace({
  currentIdentityId,
  workspaceId,
  initialFocus = "all",
}: {
  currentIdentityId: string;
  workspaceId: string;
  initialFocus?: StocktakeFocus;
}) {
  const [stocktakes, setStocktakes] = useState<StocktakeResponse[]>([]);
  const [locations, setLocations] = useState<LocationNodeResponse[]>([]);
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState<"stocktake" | "returns">("stocktake");
  const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);
  const [mobileStage, setMobileStage] = useState<MobileStocktakeStage>(
    initialFocus === "approval-pending" ? "difference" : "mode",
  );
  const [selectedStocktakeId, setSelectedStocktakeId] = useState<string | null>(null);
  const [selectedDiscrepancyId, setSelectedDiscrepancyId] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<DiscrepancyEvidenceListItem[]>([]);
  const active =
    initialFocus === "approval-pending"
      ? selectFocusedStocktake(stocktakes, selectedStocktakeId)
      : (stocktakes.find((stocktake) => stocktake.state !== "approved") ?? null);
  const isApprovalActorEligible =
    active !== null &&
    (active.confirmationMode === "solo_reversible"
      ? active.initialCounterId === currentIdentityId
      : active.initialCounterId !== currentIdentityId);
  const activeStocktakeId = useRef<string | null>(null);
  activeStocktakeId.current = active?.stocktakeId ?? null;
  const hasOnlyApprovalReadyDiscrepancies =
    active !== null &&
    active.discrepancies.every(
      (difference) =>
        difference.state === "resolved" ||
        difference.state === "candidate_confirmed" ||
        difference.state === "restored",
    );
  const canApprove = isApprovalActorEligible && hasOnlyApprovalReadyDiscrepancies;
  const selectedDiscrepancy =
    active?.discrepancies.find(
      (difference) => difference.discrepancyId === selectedDiscrepancyId,
    ) ??
    (active?.state === "approved"
      ? active.discrepancies.find((difference) => difference.state === "candidate_confirmed")
      : null) ??
    active?.discrepancies[0] ??
    null;

  const reload = useCallback(async () => {
    const [counts, places, products] = await Promise.all([
      requestJson<StocktakeResponse[]>(`/v1/workspaces/${workspaceId}/stocktakes`),
      requestJson<LocationNodeResponse[]>(`/v1/workspaces/${workspaceId}/locations`),
      requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`),
    ]);
    setStocktakes(counts);
    setLocations(places);
    setItems(products);
  }, [workspaceId]);

  useEffect(() => {
    void reload().catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : "棚卸情報を取得できませんでした。"),
    );
  }, [reload]);

  useEffect(() => {
    if (initialFocus !== "approval-pending") {
      setSelectedStocktakeId(null);
      return;
    }
    const selected = selectFocusedStocktake(stocktakes, selectedStocktakeId);
    if ((selected?.stocktakeId ?? null) !== selectedStocktakeId) {
      setSelectedStocktakeId(selected?.stocktakeId ?? null);
    }
  }, [initialFocus, selectedStocktakeId, stocktakes]);

  useEffect(() => {
    if (!active || active.discrepancies.length === 0) {
      setSelectedDiscrepancyId(null);
      return;
    }
    const preferredDiscrepancy =
      active.state === "approved"
        ? (active.discrepancies.find((entry) => entry.state === "candidate_confirmed") ??
          active.discrepancies[0])
        : active.discrepancies[0];
    setSelectedDiscrepancyId((current) =>
      current && active.discrepancies.some((entry) => entry.discrepancyId === current)
        ? current
        : preferredDiscrepancy!.discrepancyId,
    );
  }, [active]);

  useEffect(() => {
    if (active?.state !== "approved") return;
    setMobileStage((current) => (current === "audit" ? current : "difference"));
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    if (!active || !selectedDiscrepancy) {
      setSelectedEvidence([]);
      return;
    }
    void requestJson<DiscrepancyEvidenceListItem[]>(
      `/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/discrepancies/${selectedDiscrepancy.discrepancyId}/evidence`,
    )
      .then((evidence) => {
        if (!cancelled) setSelectedEvidence(evidence);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSelectedEvidence([]);
          setMessage(
            error instanceof Error ? error.message : "証拠写真の一覧を取得できませんでした。",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, selectedDiscrepancy, workspaceId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作を完了できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function act(url: string, body: Record<string, unknown>, successMessage?: string) {
    return run(async () => {
      await requestJson(url, { method: "POST", body: JSON.stringify(body) });
      await reload();
      if (successMessage) setMessage(successMessage);
    });
  }

  async function prepareChallenge(
    stocktake: StocktakeResponse,
    discrepancy: StocktakeResponse["discrepancies"][number],
    action: "confirm" | "restore",
    form: FormData,
  ) {
    await run(async () => {
      const inventoryScannedAt = formText(form, "inventoryScannedAt");
      const locationScannedAt = formText(form, "locationScannedAt");
      validateStocktakeScanTimes(inventoryScannedAt, locationScannedAt);
      assertStocktakeChallengeTarget(stocktake.stocktakeId, activeStocktakeId.current);
      const item = items.find(
        (candidate) => candidate.inventoryUnitId === discrepancy.inventoryUnitId,
      );
      const locationCode = formText(form, "locationCode").toUpperCase();
      const scannedLocation = locations.find((location) => location.code === locationCode);
      if (!item || !item.locationCode || !scannedLocation) {
        throw new Error("現在の商品・読取場所ラベル情報を取得できません。画面を更新してください。");
      }
      let evidenceId: string | null = null;
      if (action === "confirm") {
        const file = form.get("evidence");
        if (!(file instanceof File) || file.size === 0) {
          throw new Error("再確認した保管場所の写真を選択してください。");
        }
        if (!["image/jpeg", "image/png"].includes(file.type)) {
          throw new Error("証拠写真はJPEGまたはPNGを選択してください。");
        }
        const evidence = await uploadEvidence(
          `/v1/workspaces/${workspaceId}/stocktakes/${stocktake.stocktakeId}/discrepancies/${discrepancy.discrepancyId}/evidence?mimeType=${encodeURIComponent(file.type)}`,
          file,
        );
        evidenceId = evidence.evidenceId;
      }
      assertStocktakeChallengeTarget(stocktake.stocktakeId, activeStocktakeId.current);
      const challenge = await requestJson<DiscrepancyChallengeResponse>(
        `/v1/workspaces/${workspaceId}/stocktakes/${stocktake.stocktakeId}/discrepancies/${discrepancy.discrepancyId}/challenges`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            inventoryNumber: formText(form, "inventoryNumber").toUpperCase(),
            locationCode,
            inventoryLabelVersion: item.inventoryLabelVersion,
            locationLabelVersion: scannedLocation.labelVersion,
            inventoryScannedAt,
            locationScannedAt,
            humanInitiated: true,
          }),
        },
      );
      assertStocktakeChallengeTarget(stocktake.stocktakeId, activeStocktakeId.current);
      setPendingChallenge({
        stocktakeId: stocktake.stocktakeId,
        response: challenge,
        discrepancyId: discrepancy.discrepancyId,
        action,
        evidenceId,
        reasonCode: formText(form, "reasonCode"),
        reasonNote: formText(form, "reasonNote"),
      });
      setMessage(
        action === "confirm"
          ? "商品と場所の再読取を保存しました。3秒確認へ進んでください。"
          : "復元用の再読取を保存しました。3秒確認へ進んでください。",
      );
    });
  }

  async function completeChallenge() {
    if (!active || !pendingChallenge) return;
    await run(async () => {
      assertStocktakeChallengeTarget(pendingChallenge.stocktakeId, activeStocktakeId.current);
      const endpoint = pendingChallenge.action === "confirm" ? "confirm" : "restore";
      const body =
        pendingChallenge.action === "confirm"
          ? {
              challengeId: pendingChallenge.response.challengeId,
              evidenceId: pendingChallenge.evidenceId,
              reasonCode: pendingChallenge.reasonCode,
              reasonNote: pendingChallenge.reasonNote,
              confirmedAt: new Date().toISOString(),
              humanConfirmed: true,
            }
          : {
              challengeId: pendingChallenge.response.challengeId,
              reasonCode: pendingChallenge.reasonCode,
              reasonNote: pendingChallenge.reasonNote,
              confirmedAt: new Date().toISOString(),
              humanConfirmed: true,
            };
      await requestJson(
        `/v1/workspaces/${workspaceId}/stocktakes/${pendingChallenge.stocktakeId}/discrepancies/${pendingChallenge.discrepancyId}/${endpoint}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setPendingChallenge(null);
      await reload();
      setMessage(
        endpoint === "confirm"
          ? "不足候補として保存しました。販売・出庫はDBが停止します。"
          : "発見した在庫を現在場所へ復元しました。",
      );
      if (endpoint === "restore") setMobileStage("audit");
    });
  }

  const labelTargets = useMemo(
    () => [
      ...items.map((item) => ({
        type: "inventory_unit",
        id: item.inventoryUnitId,
        label: item.inventoryNumber,
      })),
      ...locations.map((location) => ({ type: "location", id: location.id, label: location.code })),
    ],
    [items, locations],
  );

  return (
    <section className="stocktakeWorkspace">
      <nav className={styles.stages} aria-label="在庫確認の目的">
        <button
          type="button"
          disabled={busy}
          aria-pressed={purpose === "stocktake"}
          onClick={() => setPurpose("stocktake")}
        >
          棚卸し・差異
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={purpose === "returns"}
          onClick={() => setPurpose("returns")}
        >
          返品の確認
        </button>
      </nav>
      {purpose === "returns" ? (
        <InventoryReturnWorkflow workspaceId={workspaceId} onBusyChange={setBusy} />
      ) : (
        <>
          <div className="stocktakeWorkspaceTitle">
            <div>
              <p className="eyebrow">STOCKTAKE & LABELS</p>
              <h2>棚卸差異を現物から確認</h2>
            </div>
            <span className="safeBadge">自動で在庫数を変更しません</span>
          </div>
          <ol className="stocktakeJourney" aria-label="棚卸差異の確認手順">
            {["運用モード", "商品再読取", "場所再読取", "証拠と理由", "最終確認", "復元と監査"].map(
              (step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  {step}
                </li>
              ),
            )}
          </ol>
          <nav className="stocktakeMobileStages" aria-label="棚卸の作業画面">
            {(active?.state === "approved"
              ? ([
                  ["difference", "復元"],
                  ["audit", "監査"],
                ] as const)
              : ([
                  ["mode", "運用モード"],
                  ["count", "商品を読む"],
                  ["difference", "差異を確認"],
                  ["audit", "復元・監査"],
                  ["labels", "ラベル"],
                ] as const)
            ).map(([stage, label], index) => (
              <button
                key={stage}
                type="button"
                aria-pressed={mobileStage === stage}
                disabled={busy || (!active && stage !== "mode" && stage !== "labels")}
                onClick={() => setMobileStage(stage)}
              >
                <span>{index + 1}</span>
                {label}
              </button>
            ))}
          </nav>
          <div className={`stocktakeMobilePanel ${mobileStage === "mode" ? "isActive" : ""}`}>
            {!active ? (
              <form
                action={async (form) => {
                  await run(async () => {
                    await requestJson(`/v1/workspaces/${workspaceId}/stocktakes`, {
                      method: "POST",
                      body: JSON.stringify({
                        locationId: form.get("locationId"),
                        humanConfirmed: true,
                      }),
                    });
                    await reload();
                    setMobileStage("count");
                  });
                }}
                className="operationsFormGrid"
              >
                <label>
                  棚卸場所
                  <select name="locationId" required>
                    {locations
                      .filter((location) => location.canStoreInventory)
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.code} / {location.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  disabled={busy || !locations.some((location) => location.canStoreInventory)}
                  type="submit"
                >
                  人が確認して棚卸開始
                </button>
              </form>
            ) : (
              <div className="stocktakeModeSummary">
                <div className="stocktakeModeBanner">
                  <div>
                    <strong>
                      {active.locationCode} / {stateLabel(active.state)}
                    </strong>
                    <p>
                      読取 {active.observationCount}件、差異 {active.discrepancies.length}件
                    </p>
                  </div>
                  <span
                    className={
                      active.confirmationMode === "solo_reversible" ? "warningBadge" : "safeBadge"
                    }
                  >
                    {active.confirmationMode === "solo_reversible"
                      ? "単独・復元可能モード"
                      : "2名確認モード"}
                  </span>
                </div>
                <p className="accountingDisclaimer">
                  モードは開始時の有効メンバー数
                  {active.activeMembershipCountAtSelection}
                  名からサーバーが選択しました。画面から変更できません。
                </p>
                {active.state === "approved" ? (
                  <p className="safeNotice">承認済みです。紛失候補の復元と監査だけを行えます。</p>
                ) : (
                  <button type="button" onClick={() => setMobileStage("difference")}>
                    現在の差異を確認
                  </button>
                )}
              </div>
            )}
          </div>
          {active ? (
            <div className="stocktakeControl" data-mobile-stage={mobileStage}>
              <div className="stocktakeDesktopBoard">
                <aside
                  className={`stocktakeQueue stocktakeMobilePanel ${
                    mobileStage === "difference" ? "isActive" : ""
                  }`}
                  aria-label="差異確認キュー"
                >
                  <div className="panelHead">
                    <h3>差異・即時確認キュー</h3>
                    <span>{active.discrepancies.length}件</span>
                  </div>
                  {active.discrepancies.length === 0 ? (
                    <p>差異はまだありません。</p>
                  ) : (
                    <div className="stocktakeQueueTable" role="listbox" aria-label="差異一覧">
                      <div className="stocktakeQueueHeader" aria-hidden="true">
                        <span>在庫番号</span>
                        <span>差異</span>
                        <span>予定場所</span>
                        <span>状態</span>
                      </div>
                      {active.discrepancies.map((difference) => {
                        return (
                          <button
                            type="button"
                            role="option"
                            aria-selected={
                              selectedDiscrepancy?.discrepancyId === difference.discrepancyId
                            }
                            className={`stocktakeQueueRow ${
                              selectedDiscrepancy?.discrepancyId === difference.discrepancyId
                                ? "selected"
                                : ""
                            }`}
                            key={difference.discrepancyId}
                            onClick={() => setSelectedDiscrepancyId(difference.discrepancyId)}
                          >
                            <strong>{difference.inventoryNumber ?? "在庫番号不明"}</strong>
                            <span>{discrepancyKindLabel(difference.kind)}</span>
                            <span>{difference.expectedLocationCode ?? "未記録"}</span>
                            <small>{discrepancyStateLabel(difference.state)}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </aside>
                <div className="stocktakeDetailStack">
                  {active.state !== "approved" ? (
                    <div
                      className={`stocktakeMobilePanel ${mobileStage === "count" ? "isActive" : ""}`}
                    >
                      {active.state === "counting" ? (
                        <CountingPanel
                          busy={busy}
                          active={active}
                          onAct={act}
                          workspaceId={workspaceId}
                        />
                      ) : (
                        <div className="humanGate">
                          <div>
                            <strong>初回計数は提出済みです</strong>
                            <p>差異確認へ進み、商品と場所を現物から再読取してください。</p>
                          </div>
                          <button type="button" onClick={() => setMobileStage("difference")}>
                            差異確認へ
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div
                    className={`stocktakeMobilePanel ${mobileStage === "difference" ? "isActive" : ""}`}
                  >
                    {active.discrepancies.length > 1 ? (
                      <label className="stocktakeMobileDifferencePicker">
                        確認する差異
                        <select
                          value={selectedDiscrepancy?.discrepancyId ?? ""}
                          onChange={(event) => setSelectedDiscrepancyId(event.target.value)}
                        >
                          {active.discrepancies.map((difference) => (
                            <option key={difference.discrepancyId} value={difference.discrepancyId}>
                              {difference.inventoryNumber ?? "在庫番号不明"} /{" "}
                              {discrepancyStateLabel(difference.state)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {active.postStartMovements.length > 0 ? (
                      <div className="accountingDisclaimer">
                        <strong>棚卸開始後の通常移動 {active.postStartMovements.length}件</strong>
                        {active.postStartMovements.map((movement) => (
                          <p key={movement.inventoryUnitId}>
                            {movement.inventoryNumber}: {movement.expectedLocationCode} →{" "}
                            {movement.currentLocationCode ?? "場所なし"}
                            （移動番号 {movement.snapshotMovementSequence} →{" "}
                            {movement.currentMovementSequence}）
                          </p>
                        ))}
                        <small>不足候補には含めず、開始後移動として分けて保存します。</small>
                      </div>
                    ) : null}
                    {selectedDiscrepancy ? (
                      [selectedDiscrepancy].map((difference) => {
                        const item = items.find(
                          (candidate) => candidate.inventoryUnitId === difference.inventoryUnitId,
                        );
                        if (difference.kind === "missing_candidate") {
                          return (
                            <MissingCandidateCard
                              key={difference.discrepancyId}
                              busy={busy}
                              stocktake={active}
                              discrepancy={difference}
                              item={item ?? null}
                              evidence={selectedEvidence}
                              handoffRequired={
                                active.confirmationMode === "dual_actor" &&
                                active.initialCounterId === currentIdentityId &&
                                difference.state === "reconfirmation_required"
                              }
                              pending={
                                pendingChallenge?.discrepancyId === difference.discrepancyId
                                  ? pendingChallenge
                                  : null
                              }
                              onPrepare={prepareChallenge}
                              onComplete={completeChallenge}
                              onCancel={() => setPendingChallenge(null)}
                            />
                          );
                        }
                        return (
                          <div key={difference.discrepancyId} className="humanGate">
                            <div>
                              <strong>
                                {difference.inventoryNumber ??
                                  discrepancyKindLabel(difference.kind)}
                              </strong>
                              <p>
                                {discrepancyKindLabel(difference.kind)} /{" "}
                                {discrepancyStateLabel(difference.state)}
                              </p>
                            </div>
                            {difference.state !== "resolved" ? (
                              <button
                                disabled={busy}
                                type="button"
                                onClick={() =>
                                  void act(
                                    `/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/discrepancies/${difference.discrepancyId}/resolve`,
                                    { resolution: "no_inventory_adjustment", humanConfirmed: true },
                                  )
                                }
                              >
                                内容を再確認して解決
                              </button>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <p className="safeNotice">現在、確認が必要な差異はありません。</p>
                    )}
                    {active.state === "reconciliation" ? (
                      <>
                        <button
                          disabled={busy || pendingChallenge !== null || !canApprove}
                          type="button"
                          onClick={() =>
                            void act(
                              `/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/approve`,
                              { humanConfirmed: true },
                              "棚卸を承認しました。",
                            )
                          }
                        >
                          {active.confirmationMode === "dual_actor"
                            ? "別担当として棚卸承認"
                            : "復元可能な差異を確認して棚卸承認"}
                        </button>
                        {!isApprovalActorEligible ? (
                          <p className="stocktakeBlockNotice" role="status">
                            {active.confirmationMode === "dual_actor"
                              ? "最初の担当者とは別の担当者でログインして承認してください"
                              : "棚卸を開始した担当者でログインして承認してください"}
                          </p>
                        ) : null}
                        {isApprovalActorEligible && !hasOnlyApprovalReadyDiscrepancies ? (
                          <p className="stocktakeBlockNotice" role="status">
                            差異の再確認を完了してから棚卸を承認してください。
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <section
                    className={`stocktakeAuditTimeline stocktakeMobilePanel ${
                      mobileStage === "audit" ? "isActive" : ""
                    }`}
                    aria-labelledby="stocktake-history-heading"
                  >
                    <div className="panelHead">
                      <h3 id="stocktake-history-heading">復元・監査履歴</h3>
                      <span>server保存 {stocktakeAuditEntries(active).length}件</span>
                    </div>
                    {stocktakeAuditEntries(active).length > 0 ? (
                      <ol>
                        {stocktakeAuditEntries(active).map((entry) => (
                          <li key={entry.key}>
                            <time>{formatAuditTime(entry.occurredAt)}</time>
                            <strong>{entry.label}</strong>
                            <span>{entry.detail}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>保存済みの監査履歴はまだありません。</p>
                    )}
                  </section>
                </div>
              </div>
            </div>
          ) : null}

          {active?.state !== "approved" ? (
            <form
              action={(form) => {
                const [targetType, targetId] = formText(form, "target").split(":");
                return act(`/v1/workspaces/${workspaceId}/inventory-labels/reissue`, {
                  targetType,
                  targetId,
                  reasonCode: form.get("reasonCode"),
                  humanConfirmed: true,
                });
              }}
              className={`operationsFormGrid stocktakeMobilePanel ${
                mobileStage === "labels" ? "isActive" : ""
              }`}
            >
              <label>
                再発行対象
                <select name="target" required>
                  {labelTargets.map((target) => (
                    <option
                      key={`${target.type}:${target.id}`}
                      value={`${target.type}:${target.id}`}
                    >
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                理由
                <select name="reasonCode">
                  <option value="damaged">破損</option>
                  <option value="lost">紛失</option>
                  <option value="unreadable">読取不能</option>
                  <option value="security_reissue">安全上の再発行</option>
                </select>
              </label>
              <button disabled={busy} type="submit">
                旧ラベルを無効化して再発行
              </button>
            </form>
          ) : null}
          {!active && mobileStage === "difference" ? (
            <p role="status">確認待ちの棚卸はありません。「運用モード」から棚卸を開始できます。</p>
          ) : null}
          {message ? <p role="status">{message}</p> : null}
          {message ? (
            <button type="button" disabled={busy} onClick={() => void run(reload)}>
              最新の状態を確認
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function InventoryReturnWorkflow({
  workspaceId,
  onBusyChange,
}: {
  workspaceId: string;
  onBusyChange: (value: boolean) => void;
}) {
  type ReturnOrder = ReturnCatalogResponse["orders"][number];
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [places, setPlaces] = useState<LocationNodeResponse[]>([]);
  const [selected, setSelected] = useState<ReturnOrder | null>(null);
  const [stage, setStage] = useState<
    "select" | "receive" | "item" | "place" | "quarantine" | "inspect" | "result"
  >("select");
  const [value, setValue] = useState("");
  const [inventoryTime, setInventoryTime] = useState("");
  const [locationTime, setLocationTime] = useState("");
  const [destination, setDestination] = useState<LocationNodeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepHeading.current?.focus();
  }, [stage, selected?.orderId]);
  const load = useCallback(async () => {
    const [catalog, locations] = await Promise.all([
      requestJson<ReturnCatalogResponse>(`/v1/workspaces/${workspaceId}/inventory/return-catalog`),
      requestJson<LocationNodeResponse[]>(`/v1/workspaces/${workspaceId}/locations`),
    ]).catch((reason: unknown) => {
      setOrders([]);
      setSelected(null);
      setStage("select");
      throw reason;
    });
    setOrders(catalog.orders);
    setPlaces(locations.filter(isReturnQuarantineLocation));
    setLoaded(true);
    return catalog.orders;
  }, [workspaceId]);
  useEffect(() => {
    void load().catch((reason: unknown) => {
      setMessage(errorMessage(reason));
      setLoaded(true);
    });
  }, [load]);

  function choose(order: ReturnOrder) {
    setSelected(order);
    setValue("");
    setInventoryTime("");
    setLocationTime("");
    setDestination(null);
    setMessage("");
    setStage(
      order.orderState === "shipped"
        ? "receive"
        : order.inventoryStatus === "shipped"
          ? "item"
          : order.inventoryStatus === "quarantined"
            ? "inspect"
            : "result",
    );
  }

  async function save(
    operation: "return" | "return-quarantine" | "return-inspection",
    resolution?: "restock" | "dispose",
  ) {
    if (locked.current || !selected) return;
    locked.current = true;
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    try {
      const current = await load();
      assertReturnSnapshot(
        selected,
        current.find((entry) => entry.orderId === selected.orderId),
      );
      let body: Record<string, unknown> = {
        idempotencyKey: crypto.randomUUID(),
        humanConfirmed: true,
      };
      if (operation === "return") body = { ...body, returnedAt: new Date().toISOString() };
      if (operation === "return-inspection") {
        if (!resolution || selected.inventoryStatus !== "quarantined")
          throw new Error("隔離した返品を人が検品してください。");
        body = { ...body, resolution, inspectedAt: new Date().toISOString() };
      }
      if (operation === "return-quarantine") {
        if (!destination || !selected.inventoryLabelVersion)
          throw new Error("商品と隔離場所を確認してください。");
        validateStocktakeScanTimes(inventoryTime, locationTime);
        const currentPlaces = await requestJson<LocationNodeResponse[]>(
          `/v1/workspaces/${workspaceId}/locations`,
        );
        const latest = currentPlaces.find((entry) => entry.id === destination.id);
        if (
          !latest ||
          !isReturnQuarantineLocation(latest) ||
          latest.labelVersion !== destination.labelVersion ||
          latest.code !== destination.code
        )
          throw new Error("隔離場所が更新されています。読み直してください。");
        body = {
          ...body,
          orderId: selected.orderId,
          inventoryNumber: selected.inventoryNumber,
          locationCode: destination.code,
          inventoryLabelVersion: selected.inventoryLabelVersion,
          locationLabelVersion: destination.labelVersion,
          inventoryScannedAt: inventoryTime,
          locationScannedAt: locationTime,
          confirmedAt: new Date().toISOString(),
        };
      }
      await requestJson(`/v1/workspaces/${workspaceId}/orders/${selected.orderId}/${operation}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const updated = await load();
      const result = updated.find((entry) => entry.orderId === selected.orderId);
      if (!result) {
        setSelected(null);
        setStage("select");
        setMessage("保存しました。最新の対象一覧を確認してください。");
        return;
      }
      choose(result);
      if (operation === "return-inspection") setStage("result");
      setMessage(
        operation === "return"
          ? "返品の受取を保存しました。次に別の場所へ隔離します。"
          : operation === "return-quarantine"
            ? "別の場所への隔離を保存しました。人が状態を検品してください。"
            : "人が確認した検品結果を保存しました。",
      );
    } catch (reason) {
      setSelected(null);
      setStage("select");
      setInventoryTime("");
      setLocationTime("");
      setDestination(null);
      try {
        await load();
      } catch {
        setOrders([]);
      }
      setMessage(
        `${errorMessage(reason)} 最新の一覧から選び直してください。結果不明の場合も、保存済み状態を確認してから再操作してください。`,
      );
    } finally {
      locked.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  const titles = {
    select: "返品する商品を選ぶ",
    receive: "返品の受取を確認",
    item: "返品の商品番号を確認",
    place: "別に保管する場所を確認",
    quarantine: "商品と隔離場所の最終確認",
    inspect: "人が返品を検品する",
    result: "返品の確認結果",
  };
  return (
    <section className={`panel ${styles.returnFlow}`}>
      <h2 ref={stepHeading} tabIndex={-1} aria-live="polite">
        {titles[stage]}
      </h2>
      <p>
        返品は通常在庫と別の場所で保管します。人の検品前に再販売へ戻しません。廃棄は確定しません。
      </p>
      {message ? <p role="status">{message}</p> : null}
      {stage === "select" ? (
        <div className="inventoryFormGrid">
          {!loaded ? (
            <p role="status">返品対象を読み込んでいます。</p>
          ) : orders.length === 0 ? (
            <p>表示できる発送済み・返品済み商品はありません。</p>
          ) : (
            orders.map((order) => (
              <button
                type="button"
                key={order.orderId}
                disabled={busy}
                onClick={() => choose(order)}
              >
                {order.orderNumber} · {shortInventoryNumber(order.inventoryNumber)} · {order.title}{" "}
                · {inventoryStateLabel(order.inventoryStatus)}
              </button>
            ))
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void load()
                .then(() => setMessage(""))
                .catch((reason: unknown) => setMessage(errorMessage(reason)));
            }}
          >
            一覧を再読み込み
          </button>
        </div>
      ) : selected ? (
        <>
          <h3>
            {shortInventoryNumber(selected.inventoryNumber)} · {selected.title}
          </h3>
          <p>
            {selected.orderNumber} ·{" "}
            {selected.orderState === "shipped" ? "発送済み" : "返品受取済み"} ·{" "}
            {inventoryStateLabel(selected.inventoryStatus)}
          </p>
          <p>
            商品ラベル版 {selected.inventoryLabelVersion ?? "未確認"} / 移動履歴番号{" "}
            {selected.movementSequence}
            <br />
            現在場所 {selected.locationCode ?? "未格納"} / 場所ラベル版{" "}
            {selected.locationLabelVersion ?? "未確認"}
          </p>
          {stage === "receive" ? (
            <form action={() => save("return")}>
              <label>
                <input type="checkbox" required />{" "}
                この注文の商品が返品されたことを現物で確認しました
              </label>
              <button disabled={busy} type="submit">
                返品の受取を保存
              </button>
            </form>
          ) : null}
          {stage === "item" ? (
            <div>
              <label>
                手書きの商品番号
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="0001"
                />
              </label>
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  try {
                    validateReturnInventoryNumber(value, selected);
                    setInventoryTime(new Date().toISOString());
                    setValue("");
                    setStage("place");
                    setMessage("");
                  } catch (reason) {
                    setMessage(errorMessage(reason));
                  }
                }}
              >
                商品番号を確認して次へ
              </button>
            </div>
          ) : null}
          {stage === "place" ? (
            <div>
              {places.length === 0 ? (
                <p role="status">
                  返品専用の保管場所がありません。<a href="/inventory">保管場所の登録</a>
                  で用途「返品専用・検品前の隔離」を作成してください。
                </p>
              ) : null}
              <label>
                隔離場所の番号
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="場所ラベルの番号を末尾まで入力"
                />
              </label>
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  const matches = places.filter(
                    (entry) => entry.code === value.trim().toUpperCase(),
                  );
                  if (matches.length !== 1) {
                    setMessage("有効な隔離場所の番号を確認してください。");
                    return;
                  }
                  setDestination(matches[0]!);
                  setLocationTime(new Date().toISOString());
                  setStage("quarantine");
                  setMessage("");
                }}
              >
                場所番号を確認して次へ
              </button>
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  setInventoryTime("");
                  setValue("");
                  setStage("item");
                }}
              >
                商品番号から読み直す
              </button>
            </div>
          ) : null}
          {stage === "quarantine" && destination ? (
            <form action={() => save("return-quarantine")}>
              <h3>
                隔離先：{destination.name} / {destination.code}
              </h3>
              <p>場所ラベル版 {destination.labelVersion}</p>
              <label>
                <input type="checkbox" required />{" "}
                通常在庫と分けたこの場所に、対象の現物を置いたことを確認しました
              </label>
              <button disabled={busy} type="submit">
                隔離を確認して保存
              </button>
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  setLocationTime("");
                  setValue("");
                  setStage("place");
                }}
              >
                場所を読み直す
              </button>
            </form>
          ) : null}
          {stage === "inspect" ? (
            <form
              action={(form) => {
                const resolution = form.get("resolution");
                if (resolution === "restock" || resolution === "dispose")
                  return save("return-inspection", resolution);
              }}
            >
              <label>
                現物を確認した結果
                <select name="resolution" required defaultValue="">
                  <option value="" disabled>
                    人が検品して選ぶ
                  </option>
                  <option value="restock">通常棚への再格納を準備する（まだ再販売しない）</option>
                  <option value="dispose">再販売できない候補へ（廃棄未確定）</option>
                </select>
              </label>
              <label>
                <input type="checkbox" required />{" "}
                別保管中の現物の状態を検品し、上の結果を確認しました
              </label>
              <button disabled={busy} type="submit">
                検品結果を確認して保存
              </button>
            </form>
          ) : null}
          {stage === "result" ? (
            <p role="status">
              現在の保存済み状態：{inventoryStateLabel(selected.inventoryStatus)}
              。履歴は残ります。廃棄の確定は行っていません。
            </p>
          ) : null}
          {stage === "result" && selected.inventoryStatus === "putaway_pending" ? (
            <p>
              検品を完了しました。通常の保管場所へ格納するまでは再販売できません。
              <a href="/mobile/scan">商品と通常の場所を確認して格納する</a>
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSelected(null);
              setStage("select");
            }}
          >
            対象一覧へ戻る
          </button>
        </>
      ) : null}
      {busy ? <p role="status">保存内容を確認しています。操作せずにお待ちください。</p> : null}
    </section>
  );
}

function CountingPanel({
  active,
  busy,
  workspaceId,
  onAct,
}: {
  active: StocktakeResponse;
  busy: boolean;
  workspaceId: string;
  onAct: (url: string, body: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <div className="stocktakeCounting">
      <form
        action={(form) =>
          onAct(`/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/observations`, {
            readResult: "readable",
            inventoryNumber: formText(form, "inventoryNumber").toUpperCase(),
            observedAt: new Date().toISOString(),
            humanConfirmed: true,
          })
        }
      >
        <label>
          在庫管理番号
          <input name="inventoryNumber" required placeholder="INV-000001-7" />
        </label>
        <button disabled={busy}>読取を記録</button>
      </form>
      <form
        className="operationsFormGrid"
        action={(form) =>
          onAct(`/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/observations`, {
            readResult: "unreadable",
            failureReason: form.get("failureReason"),
            observedAt: new Date().toISOString(),
            humanConfirmed: true,
          })
        }
      >
        <label>
          読取不能の理由
          <select name="failureReason" defaultValue="damaged_label">
            <option value="camera_blur">カメラのぶれ</option>
            <option value="damaged_label">ラベル破損</option>
            <option value="no_label">ラベルなし</option>
            <option value="manual_unreadable">手入力でも読取不能</option>
          </select>
        </label>
        <button disabled={busy}>読取不能として記録</button>
      </form>
      {active.observations.length > 0 ? (
        <ul className="auditList" aria-label="棚卸の全読取記録">
          {active.observations.map((observation) => (
            <li key={observation.ordinal}>
              <strong>
                #{observation.ordinal} {observation.observedCode ?? "コードなし"}
              </strong>
              <span>
                {observation.result}
                {observation.failureReason ? ` / ${observation.failureReason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        disabled={busy}
        type="button"
        onClick={() =>
          void onAct(`/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/reconcile`, {})
        }
      >
        初回計数を提出
      </button>
    </div>
  );
}

function MissingCandidateCard({
  stocktake,
  discrepancy,
  item,
  evidence,
  handoffRequired,
  pending,
  busy,
  onPrepare,
  onComplete,
  onCancel,
}: {
  stocktake: StocktakeResponse;
  discrepancy: StocktakeResponse["discrepancies"][number];
  item: P0ItemResponse | null;
  evidence: DiscrepancyEvidenceListItem[];
  handoffRequired: boolean;
  pending: PendingChallenge | null;
  busy: boolean;
  onPrepare: (
    stocktake: StocktakeResponse,
    discrepancy: StocktakeResponse["discrepancies"][number],
    action: "confirm" | "restore",
    form: FormData,
  ) => Promise<void>;
  onComplete: () => Promise<void>;
  onCancel: () => void;
}) {
  const action = discrepancy.state === "candidate_confirmed" ? "restore" : "confirm";
  const [scanStep, setScanStep] = useState<"inventory" | "location" | "evidence">("inventory");
  const [inventoryValue, setInventoryValue] = useState("");
  const [locationValue, setLocationValue] = useState("");
  const [inventoryTime, setInventoryTime] = useState("");
  const [locationTime, setLocationTime] = useState("");
  const [scanError, setScanError] = useState("");
  const candidateConfirmed = discrepancy.state === "candidate_confirmed";
  const finished = discrepancy.state === "restored";
  return (
    <article className="discrepancyCard">
      <div className="sectionTitle">
        <div>
          <span>!</span>
          <h3>{discrepancy.inventoryNumber ?? "在庫番号不明"}</h3>
        </div>
        <strong>{discrepancyStateLabel(discrepancy.state)}</strong>
      </div>
      <dl className="discrepancyFacts">
        <div>
          <dt>確認方式</dt>
          <dd>
            {discrepancy.confirmationMode === "solo_reversible"
              ? "単独・後から復元可能"
              : "2名で確認"}
          </dd>
        </div>
        <div>
          <dt>証拠写真</dt>
          <dd>{discrepancy.evidenceCount}件</dd>
        </div>
        <div>
          <dt>棚卸開始時の予定場所</dt>
          <dd>{discrepancy.expectedLocationCode ?? "未記録"}</dd>
        </div>
        <div>
          <dt>現在のシステム場所</dt>
          <dd>{discrepancy.currentLocationCode ?? "未記録"}</dd>
        </div>
      </dl>
      {evidence.length > 0 ? (
        <div className="discrepancyEvidenceGallery" aria-label="非公開の証拠写真">
          {evidence.map((entry) => (
            <a key={entry.evidenceId} href={entry.contentUrl} target="_blank" rel="noreferrer">
              <img
                src={entry.contentUrl}
                alt={`証拠写真 ${new Date(entry.createdAt).toLocaleString("ja-JP")}`}
              />
              <span>
                {entry.width}×{entry.height} / {Math.ceil(entry.sizeBytes / 1024)}KB
              </span>
            </a>
          ))}
          <small>権限確認後に位置情報を除いて表示します。保管キーと原本は公開しません。</small>
        </div>
      ) : discrepancy.evidenceCount > 0 ? (
        <p className="candidateReferences">証拠写真を安全に読み込んでいます。</p>
      ) : null}
      {candidateConfirmed ? (
        <p className="stocktakeBlockNotice">
          販売・出庫をDBで停止中です。現物を発見した場合だけ、商品と現在場所を再読取して復元します。
        </p>
      ) : null}
      {finished ? (
        <p className="safeNotice">現物を現在場所へ復元済みです。履歴は削除されません。</p>
      ) : handoffRequired ? (
        <p className="stocktakeBlockNotice" role="status">
          別担当者でログインし、証拠写真・商品・場所を再確認してください。
        </p>
      ) : pending ? (
        <div className="challengePanel">
          <strong>{pending.action === "confirm" ? "不足候補を確定" : "発見した在庫を復元"}</strong>
          <p>
            取り消しや誤操作を防ぐため、ポインターは3秒押し続けます。キーボードは
            EnterまたはSpaceで開始し、カウント後にもう一度押します。
          </p>
          <HoldToConfirmButton busy={busy} onConfirm={onComplete} />
          <button type="button" className="secondaryButton" disabled={busy} onClick={onCancel}>
            再読取からやり直す
          </button>
        </div>
      ) : (
        <form
          className="discrepancyForm"
          action={(form) => onPrepare(stocktake, discrepancy, action, form)}
        >
          <input type="hidden" name="inventoryScannedAt" value={inventoryTime} />
          <input type="hidden" name="locationScannedAt" value={locationTime} />
          {scanError ? <p role="alert">{scanError}</p> : null}
          <div className="accountingFieldGrid">
            <label>
              1. 商品番号を再確認
              <input
                name="inventoryNumber"
                required
                value={inventoryValue}
                readOnly={scanStep !== "inventory"}
                onChange={(event) => setInventoryValue(event.target.value)}
                placeholder="現物の商品ラベルをスキャン"
                autoComplete="off"
                autoCapitalize="characters"
              />
              {scanStep === "inventory" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !item ||
                      ![item.inventoryNumber, shortInventoryNumber(item.inventoryNumber)].includes(
                        inventoryValue.trim().toUpperCase(),
                      )
                    ) {
                      setScanError("対象の商品番号を確認してください。");
                      return;
                    }
                    setInventoryValue(item.inventoryNumber);
                    setInventoryTime(new Date().toISOString());
                    setLocationTime("");
                    setLocationValue("");
                    setScanStep("location");
                    setScanError("");
                  }}
                >
                  商品番号を確認して次へ
                </button>
              ) : null}
            </label>
            <label>
              2. 現在場所を再確認
              <input
                name="locationCode"
                required
                value={locationValue}
                readOnly={scanStep !== "location"}
                onChange={(event) => setLocationValue(event.target.value)}
                placeholder="現物の場所ラベルをスキャン"
                autoComplete="off"
                autoCapitalize="characters"
              />
              {scanStep === "location" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!hasValidCodeCheckDigit(locationValue.trim().toUpperCase())) {
                      setScanError("末尾まで正しい場所番号を入力してください。");
                      return;
                    }
                    setLocationValue(locationValue.trim().toUpperCase());
                    setLocationTime(new Date().toISOString());
                    setScanStep("evidence");
                    setScanError("");
                  }}
                >
                  場所番号を確認して次へ
                </button>
              ) : null}
            </label>
            {scanStep !== "inventory" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setScanStep("inventory");
                  setInventoryTime("");
                  setLocationTime("");
                  setInventoryValue("");
                  setLocationValue("");
                }}
              >
                商品番号から読み直す
              </button>
            ) : null}
            {scanStep === "evidence" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setScanStep("location");
                  setLocationTime("");
                  setLocationValue("");
                }}
              >
                場所番号を読み直す
              </button>
            ) : null}
            {action === "confirm" && scanStep === "evidence" ? (
              <label>
                再確認した場所の写真
                <input name="evidence" required type="file" accept="image/jpeg,image/png" />
              </label>
            ) : null}
            <label>
              理由
              <select
                name="reasonCode"
                defaultValue={action === "confirm" ? "not_seen_during_count" : "found_in_place"}
              >
                {action === "confirm" ? (
                  <>
                    <option value="not_seen_during_count">計数時と再確認時に見つからない</option>
                    <option value="label_unreadable">ラベルが読めない</option>
                    <option value="location_mismatch">場所表示と現物が一致しない</option>
                  </>
                ) : (
                  <>
                    <option value="found_in_place">同じ場所で発見</option>
                    <option value="found_after_move">開始後の移動先で発見</option>
                    <option value="counting_error">計数の入力誤り</option>
                  </>
                )}
              </select>
            </label>
          </div>
          <label>
            人が確認した内容
            <textarea
              name="reasonNote"
              required
              maxLength={500}
              rows={3}
              placeholder={
                action === "confirm"
                  ? "棚の奥まで確認したが現物を発見できなかった、など"
                  : "棚の奥で発見し、商品と場所を再読取した、など"
              }
            />
          </label>
          <button disabled={busy || !item || scanStep !== "evidence"} type="submit">
            {action === "confirm" ? "証拠と再読取を保存して3秒確認へ" : "再読取を保存して3秒確認へ"}
          </button>
        </form>
      )}
    </article>
  );
}

function HoldToConfirmButton({
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "pointer" | "keyboard" | "ready" | "submitting">(
    "idle",
  );
  const [remaining, setRemaining] = useState(3);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const deadlineRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  function start(nextMode: "pointer" | "keyboard") {
    if (busy || mode !== "idle") return;
    clearTimers();
    deadlineRef.current = Date.now() + 3_000;
    setMode(nextMode);
    setRemaining(3);
    intervalRef.current = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1_000)));
    }, 100);
    timeoutRef.current = window.setTimeout(() => {
      clearTimers();
      setRemaining(0);
      if (nextMode === "pointer") {
        setMode("submitting");
        void onConfirm();
      } else {
        setMode("ready");
      }
    }, 3_050);
  }

  function cancelPointer() {
    if (mode !== "pointer") return;
    clearTimers();
    setMode("idle");
    setRemaining(3);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start("pointer");
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cancelPointer();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (mode === "idle") {
      start("keyboard");
    } else if (mode === "ready") {
      setMode("submitting");
      void onConfirm();
    }
  }

  const label =
    mode === "idle"
      ? "3秒押し続けて確定"
      : mode === "ready"
        ? "もう一度押して確定"
        : mode === "submitting"
          ? "保存中…"
          : `${remaining}秒…`;
  return (
    <div className="holdConfirm">
      <button
        type="button"
        disabled={busy || mode === "submitting"}
        aria-describedby="hold-confirm-help"
        onClick={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelPointer}
        onPointerLeave={cancelPointer}
      >
        {label}
      </button>
      <span id="hold-confirm-help" className="srOnly">
        ポインターは3秒押し続けます。キーボードは開始後、準備完了の案内で再度押します。
      </span>
      <p aria-live="polite">
        {mode === "ready"
          ? "3秒経過しました。もう一度EnterまたはSpaceで確定します。"
          : mode === "pointer" || mode === "keyboard"
            ? `確認まで${remaining}秒`
            : ""}
      </p>
    </div>
  );
}

async function uploadEvidence(url: string, file: File): Promise<DiscrepancyEvidenceResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": file.type },
    body: file,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    DiscrepancyEvidenceResponse | { message?: string } | null;
  if (!response.ok) {
    throw new Error(
      (payload as { message?: string } | null)?.message ?? "証拠写真を保存できませんでした。",
    );
  }
  return payload as DiscrepancyEvidenceResponse;
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok) {
    throw new Error(
      (payload as { message?: string } | null)?.message ?? "操作を確認できませんでした。",
    );
  }
  return payload as T;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "操作を確認できませんでした。";
}

function stateLabel(state: StocktakeResponse["state"]): string {
  return { counting: "計数中", reconciliation: "差異確認中", approved: "承認済み" }[state];
}

function discrepancyStateLabel(state: StocktakeResponse["discrepancies"][number]["state"]): string {
  return {
    reconfirmation_required: "再確認が必要",
    candidate_confirmed: "不足候補・復元可能",
    restored: "復元済み",
    resolved: "解決済み",
  }[state];
}

function discrepancyKindLabel(kind: StocktakeResponse["discrepancies"][number]["kind"]): string {
  return {
    missing_candidate: "不足候補",
    misplaced: "場所違い",
    unexpected: "予定外の読取",
    duplicate: "重複読取",
    unreadable: "読取不能",
  }[kind];
}

function formatAuditTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
