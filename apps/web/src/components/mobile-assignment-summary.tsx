"use client";

import type {
  PutawayCatalogResponse,
  ShippingTaskResponse,
  WorkspaceRole,
} from "@resale/contracts";
import { useEffect, useState } from "react";
import { PUTAWAY_SYNC_CHANGED } from "../lib/offline-events";
import { getPutawayActionState, getShippingActionState } from "./mobile-assignment-action";

function PrimaryTaskAction({
  enabled,
  href,
  title,
  detail,
}: {
  enabled: boolean;
  href: string;
  title: string;
  detail: string;
}) {
  const content = (
    <>
      <span aria-hidden="true">▣</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <span aria-hidden="true">{enabled ? "›" : "—"}</span>
    </>
  );
  if (enabled) {
    return (
      <a className="mobilePrimaryAction" href={href}>
        {content}
      </a>
    );
  }
  return (
    <button className="mobilePrimaryAction" type="button" disabled>
      {content}
    </button>
  );
}

export function MobileAssignmentSummary({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: WorkspaceRole;
}) {
  const [putaway, setPutaway] = useState<PutawayCatalogResponse | null>(null);
  const [shipping, setShipping] = useState<ShippingTaskResponse[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const invalidate = () => setRevision((current) => current + 1);
    window.addEventListener(PUTAWAY_SYNC_CHANGED, invalidate);
    return () => window.removeEventListener(PUTAWAY_SYNC_CHANGED, invalidate);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPutaway(null);
    setShipping([]);
    setError("");
    setLoading(true);
    const url =
      role === "shipping"
        ? `/v1/workspaces/${workspaceId}/shipping-tasks`
        : `/v1/workspaces/${workspaceId}/inventory/putaway-catalog`;
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("担当範囲を読み込めませんでした。");
        const payload: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (role === "shipping") setShipping(payload as ShippingTaskResponse[]);
        else setPutaway(payload as PutawayCatalogResponse);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "担当範囲を読み込めませんでした。");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [role, workspaceId, revision]);

  if (error)
    return (
      <p role="alert" className="accountingDisclaimer">
        {error}
      </p>
    );
  if (role === "shipping") {
    const next = shipping[0];
    const action = getShippingActionState(loading, shipping.length);
    return (
      <>
        <section className="mobileTaskGrid" aria-label="発送割当">
          <article className="mobileTaskCard green">
            <span>割当注文</span>
            <strong>{shipping.length}件</strong>
          </article>
        </section>
        <PrimaryTaskAction
          enabled={action.enabled}
          href="/shipping"
          title="発送作業を開く"
          detail={action.detail}
        />
        <section className="mobileNext panel">
          <div className="panelHead">
            <h2>次の作業</h2>
            <span className="status">{next?.state ?? "割当なし"}</span>
          </div>
          <strong>
            {next ? `${next.orderNumber}｜${next.inventoryNumber}` : "現在の発送割当はありません"}
          </strong>
          <p>
            {next
              ? next.assignmentExpiresAt
                ? `期限 ${new Date(next.assignmentExpiresAt).toLocaleString("ja-JP")}`
                : "管理者として確認中"
              : "管理者の割当後に表示されます。"}
          </p>
        </section>
      </>
    );
  }
  const next = putaway?.inventory[0];
  const action = getPutawayActionState(
    loading,
    putaway?.inventory.length ?? 0,
    putaway?.locations.length ?? 0,
  );
  return (
    <>
      <section className="mobileTaskGrid" aria-label="担当作業">
        <article className="mobileTaskCard orange">
          <span>格納待ち</span>
          <strong>{putaway?.inventory.length ?? 0}件</strong>
        </article>
        <article className="mobileTaskCard green">
          <span>利用可能な場所</span>
          <strong>{putaway?.locations.length ?? 0}件</strong>
        </article>
      </section>
      <PrimaryTaskAction
        enabled={action.enabled}
        href="/mobile/scan"
        title="商品と場所を読み取る"
        detail={action.detail}
      />
      <section className="mobileNext panel">
        <div className="panelHead">
          <h2>次の作業</h2>
          <span className="status">{next ? "格納待ち" : "対象なし"}</span>
        </div>
        <strong>{next?.inventoryNumber ?? "現在の格納割当はありません"}</strong>
        <p>
          {next
            ? "商品コードと保管場所の両方を確認してください。"
            : "管理者の割当後に表示されます。"}
        </p>
      </section>
    </>
  );
}
