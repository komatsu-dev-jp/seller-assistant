"use client";

import type { OrderOperationResponse, ShippingTaskResponse } from "@resale/contracts";
import { useCallback, useEffect, useState } from "react";

import { LogoutButton } from "./logout-button";

export function ShippingWorkspace({ workspaceId }: { workspaceId: string }) {
  const [tasks, setTasks] = useState<ShippingTaskResponse[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [inventoryInput, setInventoryInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const task = tasks.find((entry) => entry.orderId === selectedOrderId) ?? tasks[0] ?? null;
  const refresh = useCallback(async () => {
    const result = await requestJson<ShippingTaskResponse[]>(
      `/v1/workspaces/${workspaceId}/shipping-tasks`,
    );
    setTasks(result);
    setSelectedOrderId((current) =>
      current && result.some((entry) => entry.orderId === current)
        ? current
        : (result[0]?.orderId ?? null),
    );
  }, [workspaceId]);

  useEffect(() => {
    refresh().catch((reason: unknown) => setError(errorMessage(reason)));
  }, [refresh]);

  useEffect(() => {
    setInventoryInput("");
    setLocationInput("");
    setLeaseId(null);
    setAddress(null);
  }, [task?.orderId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      if (reason instanceof RequestError && reason.status === 403) {
        setLeaseId(null);
        setAddress(null);
      }
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function requireLease(): Promise<string> {
    if (leaseId) return leaseId;
    if (!task) throw new Error("担当注文を確認できません。");
    const lease = await requestJson<{ leaseId: string }>(
      `/v1/workspaces/${workspaceId}/orders/${task.orderId}/address-leases`,
      {
        method: "POST",
        body: JSON.stringify({ purpose: "shipping_label", humanConfirmed: true }),
      },
    );
    setLeaseId(lease.leaseId);
    return lease.leaseId;
  }

  async function revealAddress() {
    if (!task) return;
    await run(async () => {
      const activeLease = await requireLease();
      const result = await requestJson<{ shippingAddress: string; expiresAt: string }>(
        `/v1/workspaces/${workspaceId}/orders/${task.orderId}/address?leaseId=${activeLease}`,
      );
      setAddress(result.shippingAddress);
      const remaining = Math.max(0, Date.parse(result.expiresAt) - Date.now());
      window.setTimeout(
        () => {
          setAddress(null);
          setLeaseId(null);
        },
        Math.min(remaining, 300_000),
      );
    });
  }

  async function progress() {
    if (!task) return;
    await run(async () => {
      const activeLease = await requireLease();
      let result: OrderOperationResponse;
      if (task.state === "confirmed") {
        if (inventoryInput !== task.inventoryNumber || locationInput !== task.locationCode) {
          throw new Error("割当商品の在庫番号と場所コードを、それぞれ手入力して照合してください。");
        }
        const now = Date.now();
        result = await requestJson<OrderOperationResponse>(
          `/v1/workspaces/${workspaceId}/orders/${task.orderId}/pick`,
          {
            method: "POST",
            body: JSON.stringify({
              inventoryNumber: inventoryInput,
              locationCode: locationInput,
              inventoryLabelVersion: task.inventoryLabelVersion,
              locationLabelVersion: task.locationLabelVersion,
              addressLeaseId: activeLease,
              inventoryScannedAt: new Date(now).toISOString(),
              locationScannedAt: new Date(now + 1).toISOString(),
              confirmedAt: new Date(now + 2).toISOString(),
              idempotencyKey: crypto.randomUUID(),
              humanConfirmed: true,
            }),
          },
        );
      } else if (task.state === "picking") {
        result = await requestJson<OrderOperationResponse>(
          `/v1/workspaces/${workspaceId}/orders/${task.orderId}/pack`,
          {
            method: "POST",
            body: JSON.stringify({
              packingEvidenceReferenceId: crypto.randomUUID(),
              addressLeaseId: activeLease,
              confirmedAt: new Date().toISOString(),
              idempotencyKey: crypto.randomUUID(),
              humanConfirmed: true,
            }),
          },
        );
      } else {
        result = await requestJson<OrderOperationResponse>(
          `/v1/workspaces/${workspaceId}/orders/${task.orderId}/ship`,
          {
            method: "POST",
            body: JSON.stringify({
              addressLeaseId: activeLease,
              shippedAt: new Date().toISOString(),
              idempotencyKey: crypto.randomUUID(),
              humanConfirmed: true,
            }),
          },
        );
      }
      if (!result.orderId) throw new Error("発送操作の保存結果を確認できません。");
      await refresh();
    });
  }

  return (
    <main className="mobileAppShell">
      <header className="mobileAppHeader">
        <a className="brand" href="/shipping" aria-label="発送担当ホーム">
          R<span>O</span>
        </a>
        <div>
          <span>担当</span>
          <strong>注文別発送</strong>
        </div>
        <LogoutButton />
      </header>
      <section className="mobileAppContent">
        <div className="mobileGreeting">
          <p className="eyebrow">ASSIGNED ORDERS ONLY</p>
          <h1>発送担当の作業</h1>
          <p>割当期間中の注文だけを表示します。</p>
        </div>
        {error ? (
          <p role="alert" className="accountingDisclaimer">
            {error}
          </p>
        ) : null}
        {tasks.length === 0 ? (
          <section className="panel mobileNext">
            <h2>現在の割当はありません</h2>
            <p>オーナーまたは在庫責任者の割当後に表示されます。</p>
          </section>
        ) : (
          <>
            <label className="panel mobileNext">
              担当注文
              <select
                value={task?.orderId ?? ""}
                onChange={(event) => setSelectedOrderId(event.target.value)}
              >
                {tasks.map((entry) => (
                  <option key={entry.orderId} value={entry.orderId}>
                    {entry.orderNumber} / {entry.state}
                  </option>
                ))}
              </select>
            </label>
            {task ? (
              <section className="panel mobileNext">
                <h2>{task.orderNumber}</h2>
                <p>割当期限: {new Date(task.assignmentExpiresAt).toLocaleString("ja-JP")}</p>
                {task.state === "confirmed" ? (
                  <div className="measurementGrid">
                    <label>
                      在庫番号（チェック値を含む）
                      <input
                        value={inventoryInput}
                        onChange={(event) => setInventoryInput(event.target.value.toUpperCase())}
                      />
                    </label>
                    <label>
                      場所コード（チェック値を含む）
                      <input
                        value={locationInput}
                        onChange={(event) => setLocationInput(event.target.value.toUpperCase())}
                      />
                    </label>
                  </div>
                ) : null}
                <button type="button" disabled={busy} onClick={() => void revealAddress()}>
                  発送先を最大5分だけ表示
                </button>
                {address ? <p className="candidateNotice">{address}</p> : null}
                <button type="button" disabled={busy} onClick={() => void progress()}>
                  {task.state === "confirmed"
                    ? "商品と場所を照合してピック"
                    : task.state === "picking"
                      ? "梱包証拠を確認"
                      : "発送を人が確定"}
                </button>
              </section>
            ) : null}
          </>
        )}
        <section className="mobileSafety">
          <strong>安全境界</strong>
          <p>割当外の注文・原価・利益・税務情報は表示しません。</p>
        </section>
      </section>
      <nav className="mobileBottomNav" aria-label="発送ナビゲーション">
        <a aria-current="page" href="/shipping">
          発送
        </a>
        <a href="/mobile">現場</a>
      </nav>
    </main>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && typeof init.body === "string") headers.set("content-type", "application/json");
  const response = await fetch(url, { cache: "no-store", ...init, headers });
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

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "安全に処理できませんでした。";
}
