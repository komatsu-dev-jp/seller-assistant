"use client";

import type {
  DiscrepancyChallengeResponse,
  DiscrepancyEvidenceListItem,
  DiscrepancyEvidenceResponse,
  LocationNodeResponse,
  P0ItemResponse,
  StocktakeResponse,
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

type PendingChallenge = {
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
  const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);
  const [mobileStage, setMobileStage] = useState<MobileStocktakeStage>("mode");
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
      const scanTime = new Date().toISOString();
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
            inventoryScannedAt: scanTime,
            locationScannedAt: scanTime,
            humanInitiated: true,
          }),
        },
      );
      setPendingChallenge({
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
        `/v1/workspaces/${workspaceId}/stocktakes/${active.stocktakeId}/discrepancies/${pendingChallenge.discrepancyId}/${endpoint}`,
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
              await act(`/v1/workspaces/${workspaceId}/stocktakes`, {
                locationId: form.get("locationId"),
                humanConfirmed: true,
              });
              setMobileStage("count");
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
            <button disabled={busy} type="submit">
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
                            {difference.inventoryNumber ?? discrepancyKindLabel(difference.kind)}
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
                <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>
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
      {message ? <p role="status">{message}</p> : null}
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
          <div className="accountingFieldGrid">
            <label>
              在庫管理番号を再読取
              <input
                name="inventoryNumber"
                required
                defaultValue=""
                placeholder="現物の商品ラベルをスキャン"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            <label>
              現在場所を再読取
              <input
                name="locationCode"
                required
                defaultValue=""
                placeholder="現物の場所ラベルをスキャン"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            {action === "confirm" ? (
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
          <button disabled={busy || !item} type="submit">
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
