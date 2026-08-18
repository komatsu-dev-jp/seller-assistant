"use client";

import type {
  PutawayCatalogResponse,
  ShippingTaskResponse,
  WorkspaceRole,
} from "@resale/contracts";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    const url =
      role === "shipping"
        ? `/v1/workspaces/${workspaceId}/shipping-tasks`
        : `/v1/workspaces/${workspaceId}/inventory/putaway-catalog`;
    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("担当範囲を読み込めませんでした。");
        const payload: unknown = await response.json();
        if (role === "shipping") setShipping(payload as ShippingTaskResponse[]);
        else setPutaway(payload as PutawayCatalogResponse);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "担当範囲を読み込めませんでした。"),
      );
  }, [role, workspaceId]);

  if (error)
    return (
      <p role="alert" className="accountingDisclaimer">
        {error}
      </p>
    );
  if (role === "shipping") {
    const next = shipping[0];
    return (
      <>
        <section className="mobileTaskGrid" aria-label="発送割当">
          <article className="mobileTaskCard green">
            <span>割当注文</span>
            <strong>{shipping.length}件</strong>
          </article>
        </section>
        <a className="mobilePrimaryAction" href="/shipping">
          <span aria-hidden="true">▣</span>
          <div>
            <strong>発送作業を開く</strong>
            <small>割当期間中の注文だけ</small>
          </div>
          <span aria-hidden="true">›</span>
        </a>
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
              ? `期限 ${new Date(next.assignmentExpiresAt).toLocaleString("ja-JP")}`
              : "管理者の割当後に表示されます。"}
          </p>
        </section>
      </>
    );
  }
  const next = putaway?.inventory[0];
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
      <a className="mobilePrimaryAction" href="/mobile/scan">
        <span aria-hidden="true">▣</span>
        <div>
          <strong>商品と場所を読み取る</strong>
          <small>割当範囲・チェック値を照合</small>
        </div>
        <span aria-hidden="true">›</span>
      </a>
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
