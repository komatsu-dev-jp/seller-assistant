"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LocationNodeResponse,
  P0ItemResponse,
  TeamAssignmentResponse,
  TeamStateResponse,
  WorkspaceRole,
} from "@resale/contracts";

interface Props {
  workspaceId: string;
  role: WorkspaceRole;
}

export function TeamWorkspace({ workspaceId, role }: Props) {
  const [team, setTeam] = useState<TeamStateResponse | null>(null);
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [locations, setLocations] = useState<LocationNodeResponse[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignmentType, setAssignmentType] = useState<
    "capture" | "location_putaway" | "location_photo" | "inventory_putaway"
  >("capture");

  const reload = useCallback(async () => {
    const [teamData, itemData, locationData] = await Promise.all([
      requestJson<TeamStateResponse>(`/v1/workspaces/${workspaceId}/team`),
      requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`),
      requestJson<LocationNodeResponse[]>(`/v1/workspaces/${workspaceId}/locations`),
    ]);
    setTeam(teamData);
    setItems(itemData);
    setLocations(locationData);
  }, [workspaceId]);

  useEffect(() => {
    void reload().catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : "担当情報を取得できませんでした。"),
    );
  }, [reload]);

  const targets = useMemo(() => {
    if (assignmentType === "capture") {
      return items
        .filter((item) => ["sku_created", "purchase_confirmed"].includes(item.workflowState))
        .map((item) => ({ id: item.skuId, label: `${item.skuCode} / ${item.title}` }));
    }
    if (assignmentType === "inventory_putaway") {
      return items
        .filter((item) => item.inventoryStatus === "putaway_pending")
        .map((item) => ({ id: item.inventoryUnitId, label: item.inventoryNumber }));
    }
    return locations
      .filter((location) => location.canStoreInventory)
      .map((location) => ({ id: location.id, label: `${location.code} / ${location.name}` }));
  }, [assignmentType, items, locations]);

  async function createMember(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      await requestJson(`/v1/workspaces/${workspaceId}/team/members`, {
        method: "POST",
        body: JSON.stringify({
          displayName: form.get("displayName"),
          email: form.get("email"),
          initialPassword: form.get("initialPassword"),
          role: form.get("role"),
          humanConfirmed: true,
        }),
      });
      setMessage("PC内アカウントを作成しました。初期パスワードは画面やログへ保存しません。");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "アカウントを作成できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function createAssignment(form: FormData) {
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000);
    setBusy(true);
    setMessage("");
    try {
      await requestJson(`/v1/workspaces/${workspaceId}/team/assignments`, {
        method: "POST",
        body: JSON.stringify({
          identityId: form.get("identityId"),
          assignmentType,
          targetId: form.get("targetId"),
          startsAt: startsAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          humanConfirmed: true,
        }),
      });
      setMessage("8時間の担当割当を保存しました。");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "担当を割り当てられませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(assignment: TeamAssignmentResponse) {
    if (!window.confirm(`${assignment.targetLabel} の担当を今すぐ解除しますか？`)) return;
    setBusy(true);
    try {
      await requestJson(
        `/v1/workspaces/${workspaceId}/team/assignments/${assignment.assignmentId}/revoke`,
        {
          method: "POST",
          body: JSON.stringify({
            assignmentType: assignment.assignmentType,
            reasonCode: "assignment_changed",
            humanConfirmed: true,
          }),
        },
      );
      setMessage("担当を解除しました。以後の写真・住所・在庫操作は即時拒否されます。");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "担当を解除できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const workers =
    team?.members.filter((member) => member.active && member.role === "field_worker") ?? [];
  const activeAssignments = team?.assignments.filter((assignment) => !assignment.revokedAt) ?? [];

  return (
    <div className="teamGrid">
      <section className="panel inventoryMain">
        <p className="eyebrow">MEMBERS</p>
        <h2>PC内ログイン</h2>
        {role === "owner" ? (
          <form action={createMember} className="teamFormGrid memberFormGrid">
            <label>
              表示名
              <input name="displayName" required maxLength={120} />
            </label>
            <label>
              ログインメール
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              初期パスワード
              <input
                name="initialPassword"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              役割
              <select name="role" defaultValue="field_worker">
                <option value="field_worker">撮影・在庫担当</option>
                <option value="shipping">発送担当</option>
                <option value="inventory_manager">在庫管理者</option>
                <option value="accounting">経理担当</option>
              </select>
            </label>
            <button disabled={busy} type="submit">
              内容を確認して作成
            </button>
          </form>
        ) : (
          <p>アカウント作成はオーナーだけが行えます。</p>
        )}
        <ul className="auditList">
          {team?.members.map((member) => (
            <li key={member.identityId}>
              <strong>{member.email}</strong>
              <span>
                {member.role} / {member.active ? "有効" : "停止"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel inventoryMain">
        <p className="eyebrow">FIELD ASSIGNMENTS</p>
        <h2>商品・場所を8時間だけ許可</h2>
        <p>
          格納担当には「格納する商品」と「格納先の場所」の2件をそれぞれ割り当てます。場所写真は別の権限です。
        </p>
        <form action={createAssignment} className="teamFormGrid assignmentFormGrid">
          <label>
            担当者
            <select name="identityId" required>
              {workers.map((member) => (
                <option value={member.identityId} key={member.identityId}>
                  {member.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            作業
            <select
              value={assignmentType}
              onChange={(event) => setAssignmentType(event.target.value as typeof assignmentType)}
            >
              <option value="capture">商品撮影・採寸</option>
              <option value="inventory_putaway">格納する商品</option>
              <option value="location_putaway">格納先の場所</option>
              <option value="location_photo">場所写真</option>
            </select>
          </label>
          <label>
            対象
            <select name="targetId" required>
              {targets.map((target) => (
                <option value={target.id} key={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || workers.length === 0 || targets.length === 0} type="submit">
            人が確認して割り当て
          </button>
        </form>
      </section>

      <section className="panel inventoryMain">
        <p className="eyebrow">ACTIVE ACCESS</p>
        <h2>現在の担当と緊急解除</h2>
        <ul className="auditList">
          {activeAssignments.map((assignment) => (
            <li key={`${assignment.assignmentType}-${assignment.assignmentId}`}>
              <div>
                <strong>{assignment.targetLabel}</strong>
                <span>
                  {assignment.assigneeEmail} / {assignment.assignmentType}
                </span>
              </div>
              <button type="button" disabled={busy} onClick={() => void revoke(assignment)}>
                今すぐ解除
              </button>
            </li>
          ))}
        </ul>
        {activeAssignments.length === 0 ? <p>有効な割当はありません。</p> : null}
        {message ? <p role="alert">{message}</p> : null}
      </section>
    </div>
  );
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok)
    throw new Error(
      (payload as { message?: string } | null)?.message ?? "操作を確認できませんでした。",
    );
  return payload as T;
}
