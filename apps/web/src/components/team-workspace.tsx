"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./navigation-home-team.module.css";
import type {
  LocationNodeResponse,
  P0ItemResponse,
  TeamChangeListResponse,
  TeamChangeResponse,
  TeamAssignmentResponse,
  TeamStateResponse,
  WorkspaceRole,
} from "@resale/contracts";
import { csvCell } from "./team-change-csv";

interface Props {
  workspaceId: string;
  role: WorkspaceRole;
  currentIdentityId: string;
}

type TeamSection = "members" | "assignments" | "review" | "history";
type TeamChangeReason =
  "assignment_error" | "assignment_changed" | "device_lost" | "worker_unavailable";
type TeamChangeComment =
  | "target_checked"
  | "dates_checked"
  | "check_target_again"
  | "check_dates_again"
  | "clarify_reason";

const changeReasons: readonly [TeamChangeReason, string][] = [
  ["assignment_error", "割り当て間違い"],
  ["assignment_changed", "担当変更"],
  ["device_lost", "端末紛失"],
  ["worker_unavailable", "担当者不在"],
];

const changeComments: readonly [TeamChangeComment, string][] = [
  ["target_checked", "対象を確認しました"],
  ["dates_checked", "期間を確認しました"],
  ["check_target_again", "対象を再確認してください"],
  ["check_dates_again", "期間を再確認してください"],
  ["clarify_reason", "理由を明確にしてください"],
];

export function TeamWorkspace({ workspaceId, role, currentIdentityId }: Props) {
  const [team, setTeam] = useState<TeamStateResponse | null>(null);
  const [items, setItems] = useState<P0ItemResponse[]>([]);
  const [locations, setLocations] = useState<LocationNodeResponse[]>([]);
  const [changes, setChanges] = useState<TeamChangeResponse[]>([]);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [section, setSection] = useState<TeamSection>("members");
  const [requestReason, setRequestReason] = useState<Record<string, TeamChangeReason | "">>({});
  const [commentCode, setCommentCode] = useState<Record<string, TeamChangeComment>>({});
  const idempotencyKeys = useRef(new Map<string, string>());
  const [assignmentType, setAssignmentType] = useState<
    "capture" | "location_putaway" | "location_photo" | "inventory_putaway"
  >("capture");

  const reload = useCallback(async () => {
    setLoadError("");
    try {
      const [teamData, itemData, locationData] = await Promise.all([
        requestJson<TeamStateResponse>(`/v1/workspaces/${workspaceId}/team`),
        requestJson<P0ItemResponse[]>(`/v1/workspaces/${workspaceId}/p0-items`),
        requestJson<LocationNodeResponse[]>(`/v1/workspaces/${workspaceId}/locations`),
      ]);
      const changeData = await requestJson<TeamChangeListResponse>(
        `/v1/workspaces/${workspaceId}/team/change-requests`,
      );
      setTeam(teamData);
      setItems(itemData);
      setLocations(locationData);
      setChanges(changeData.changes);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "担当情報を取得できませんでした。");
      throw reason;
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload().catch(() => undefined);
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

  async function requestRevocation(assignment: TeamAssignmentResponse) {
    const reasonCode = requestReason[assignment.assignmentId] ?? "";
    if (!reasonCode) {
      setMessage("解除理由を選んでから申請してください。");
      return;
    }
    const keyName = `request:${assignment.assignmentId}`;
    const idempotencyKey = idempotencyKeys.current.get(keyName) ?? crypto.randomUUID();
    idempotencyKeys.current.set(keyName, idempotencyKey);
    setBusy(true);
    setMessage("");
    try {
      await requestJson<TeamChangeResponse>(`/v1/workspaces/${workspaceId}/team/change-requests`, {
        method: "POST",
        body: JSON.stringify({
          assignmentId: assignment.assignmentId,
          assignmentType: assignment.assignmentType,
          expectedAssignmentVersion: assignment.assignmentVersion,
          reasonCode,
          idempotencyKey,
          humanConfirmed: true,
        }),
      });
      idempotencyKeys.current.delete(keyName);
      setRequestReason((current) => ({ ...current, [assignment.assignmentId]: "" }));
      setMessage("解除申請を保存しました。別の管理者が内容を確認します。");
      await reload().catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "解除申請を保存できませんでした。");
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function recordChangeEvent(
    change: TeamChangeResponse,
    action: "approve" | "reject" | "request_changes" | "comment",
  ) {
    const selectedComment = commentCode[change.requestId] ?? defaultCommentFor(action);
    const keyName = `event:${change.requestId}:${action}:${change.revision}`;
    const idempotencyKey = idempotencyKeys.current.get(keyName) ?? crypto.randomUUID();
    idempotencyKeys.current.set(keyName, idempotencyKey);
    setBusy(true);
    setMessage("");
    try {
      await requestJson<TeamChangeResponse>(
        `/v1/workspaces/${workspaceId}/team/change-requests/${change.requestId}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            expectedRevision: change.revision,
            commentCode: selectedComment,
            idempotencyKey,
            humanConfirmed: true,
          }),
        },
      );
      idempotencyKeys.current.delete(keyName);
      setMessage("変更イベントを保存しました。履歴を更新しました。");
      await reload().catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "変更イベントを保存できませんでした。");
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const workers =
    team?.members.filter((member) => member.active && member.role === "field_worker") ?? [];
  const assignments = team?.assignments.filter((assignment) => !assignment.revokedAt) ?? [];
  const activeAssignments = assignments.filter(isActiveAssignment);
  const activeMembers = team?.members.filter((member) => member.active).length ?? 0;
  const expiredAssignments = assignments.filter((assignment) => isExpired(assignment.expiresAt));
  const scheduledAssignments = assignments.filter((assignment) => isScheduled(assignment.startsAt));
  const pendingChangeAssignmentIds = new Set(
    changes
      .filter((change) => change.state === "pending")
      .map((change) => change.before.assignmentId),
  );
  const setupSteps = [
    {
      number: 1 as const,
      title: "ワークスペースを確認",
      state: team ? "確認済み" : "読み込み中",
      detail: team
        ? `現在のワークスペース（${shortId(workspaceId)}）を使います。新しい保存は行いません。`
        : "ワークスペースの情報を読み込んでいます。",
    },
    {
      number: 2 as const,
      title: "あなたの役割を確認",
      state: roleLabel(role),
      detail: `この画面での役割は「${roleLabel(role)}」です。表示・操作範囲は役割に合わせます。`,
    },
    {
      number: 3 as const,
      title: "メンバーと担当を確認",
      state: team ? `${activeMembers}人が利用中` : "読み込み中",
      detail: team
        ? `登録済み${team.members.length}人、現在有効な担当${activeAssignments.length}件です。下のメンバー・担当欄で確認します。`
        : "メンバーと担当の情報を読み込んでいます。",
    },
  ] as const;
  const selectedSetupStep = setupSteps[setupStep - 1] ?? setupSteps[0];

  return (
    <div className={styles.teamBoard}>
      <section className={styles.teamSummary} aria-label="チームの現在状態">
        <article className={styles.teamSummaryCard}>
          <span>利用中のメンバー</span>
          <strong>{activeMembers}人</strong>
          <small>停止中のアカウントは担当候補に表示しません。</small>
        </article>
        <article className={styles.teamSummaryCard}>
          <span>有効な担当</span>
          <strong>{activeAssignments.length}件</strong>
          <small>商品・場所・写真ごとに、必要な範囲だけを許可します。</small>
        </article>
        <article
          className={`${styles.teamSummaryCard} ${expiredAssignments.length ? styles.warning : ""}`}
        >
          <span>期限の確認</span>
          <strong>
            {expiredAssignments.length ? `${expiredAssignments.length}件` : "問題なし"}
          </strong>
          <small>
            {expiredAssignments.length
              ? "期限終了の担当があります。内容を確認して解除してください。"
              : "有効な担当の期限を画面で確認できます。"}
          </small>
        </article>
      </section>

      {loadError ? (
        <div className={styles.loadError} role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void reload().catch(() => undefined)}
            disabled={busy}
          >
            再読み込み
          </button>
        </div>
      ) : null}

      {message ? (
        <p className={styles.message} role="alert">
          {message}
        </p>
      ) : null}

      <nav className={styles.teamSections} aria-label="メンバー・担当・変更の画面" role="tablist">
        {(
          [
            ["members", "PC37 / メンバー", "登録と役割"],
            ["assignments", "PC38 / 担当", "作業と期限"],
            ["review", "PC39 / 変更を確認", "承認・差し戻し"],
            ["history", "PC40 / 変更履歴", "追記のみ"],
          ] as const
        ).map(([nextSection, label, detail]) => (
          <button
            key={nextSection}
            type="button"
            role="tab"
            aria-selected={section === nextSection}
            onClick={() => setSection(nextSection)}
          >
            <strong>{label}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </nav>

      <div className={styles.teamLayout}>
        <section
          className="panel inventoryMain"
          aria-labelledby="team-members-heading"
          hidden={section !== "members"}
        >
          <p className="eyebrow">メンバー</p>
          <h2 className={styles.cardHeading} id="team-members-heading">
            使える範囲を先に確認
          </h2>
          <p className={styles.cardLead}>
            担当者ごとに、必要な作業だけを表示します。原価・利益・住所などは、担当に必要な場合以外は表示しません。
          </p>

          <section className={styles.setupPanel} aria-labelledby="setup-heading">
            <p className="eyebrow">M02 / はじめの設定</p>
            <h3 className={styles.formTitle} id="setup-heading">
              3ステップで準備を確認
            </h3>
            <p className={styles.formNote}>
              ここでは現在の状態を確認するだけです。架空のワークスペースやメンバーは保存しません。
            </p>
            <div className={styles.setupSteps} role="tablist" aria-label="はじめの設定の手順">
              {setupSteps.map((step) => (
                <button
                  key={step.number}
                  type="button"
                  role="tab"
                  aria-selected={setupStep === step.number}
                  onClick={() => setSetupStep(step.number)}
                >
                  <span className={styles.stepNumber}>{step.number}</span>
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.state}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.setupDetail} role="tabpanel">
              <strong>{selectedSetupStep.title}</strong>
              <p>{selectedSetupStep.detail}</p>
            </div>
          </section>

          <ul className={styles.memberList} aria-label="登録済みメンバー">
            {team?.members.map((member) => (
              <li key={member.identityId}>
                <div className={styles.memberMeta}>
                  <strong>{member.email}</strong>
                  <small>{member.active ? "利用中" : "停止中"}</small>
                </div>
                <span className={styles.roleBadge}>{roleLabel(member.role)}</span>
              </li>
            ))}
          </ul>
          {!team?.members.length ? (
            <p className={styles.auditNotice}>メンバー情報を読み込み中です。</p>
          ) : null}

          <div className={styles.formBlock}>
            <h3 className={styles.formTitle}>PC内ログインを作成</h3>
            <p className={styles.formNote}>初期パスワードは、保存後に画面やログへ残しません。</p>
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
              <p className={styles.auditNotice}>アカウント作成はオーナーだけが行えます。</p>
            )}
          </div>
        </section>

        <section
          className="panel inventoryMain"
          aria-labelledby="team-assignment-heading"
          hidden={section !== "assignments"}
        >
          <p className="eyebrow">担当を割り当てる</p>
          <h2 className={styles.cardHeading} id="team-assignment-heading">
            作業・対象・時間を分けて指定
          </h2>
          <p className={styles.cardLead}>
            格納担当には「格納する商品」と「格納先の場所」を別々に割り当てます。場所写真も別の権限です。
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
          {workers.length === 0 ? (
            <p className={styles.auditNotice}>
              先に「撮影・在庫担当」のメンバーを作成してください。
            </p>
          ) : null}
          {workers.length > 0 && targets.length === 0 ? (
            <p className={styles.auditNotice}>この作業に割り当てられる対象がまだありません。</p>
          ) : null}
        </section>

        <section
          className="panel inventoryMain"
          aria-labelledby="team-access-heading"
          hidden={section !== "assignments"}
        >
          <p className="eyebrow">確認・履歴</p>
          <h2 className={styles.cardHeading} id="team-access-heading">
            現在の担当と解除
          </h2>
          <p className={styles.cardLead}>
            解除すると、その後の写真・住所・在庫操作はすぐに拒否されます。解除前に対象を確認してください。
          </p>
          <ul className={styles.assignmentList} aria-label="有効な担当">
            {activeAssignments.map((assignment) => (
              <li key={`${assignment.assignmentType}-${assignment.assignmentId}`}>
                <div className={styles.assignmentMeta}>
                  <strong>{assignment.targetLabel}</strong>
                  <small>{assignment.assigneeEmail}</small>
                  <small>
                    {assignmentTypeLabel(assignment.assignmentType)}・期限{" "}
                    {formatDateTime(assignment.expiresAt)}
                  </small>
                </div>
                <div>
                  <span className={styles.stateBadge}>利用中</span>
                  <label className={styles.changeReason}>
                    <span>解除理由</span>
                    <select
                      aria-label={`${assignment.targetLabel}の解除理由`}
                      value={requestReason[assignment.assignmentId] ?? ""}
                      onChange={(event) =>
                        setRequestReason((current) => ({
                          ...current,
                          [assignment.assignmentId]: event.target.value as TeamChangeReason | "",
                        }))
                      }
                    >
                      <option value="">理由を選択</option>
                      {changeReasons.map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !requestReason[assignment.assignmentId] ||
                      pendingChangeAssignmentIds.has(assignment.assignmentId)
                    }
                    onClick={() => void requestRevocation(assignment)}
                  >
                    {pendingChangeAssignmentIds.has(assignment.assignmentId)
                      ? "申請中"
                      : "解除を申請"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {activeAssignments.length === 0 ? (
            <p className={styles.auditNotice}>有効な担当はありません。</p>
          ) : null}
          {expiredAssignments.length > 0 ? (
            <div className={styles.assignmentHistory}>
              <h3 className={styles.formTitle}>期限切れ（{expiredAssignments.length}件）</h3>
              <ul className={styles.assignmentList} aria-label="期限切れの担当">
                {expiredAssignments.map((assignment) => (
                  <li key={`expired-${assignment.assignmentType}-${assignment.assignmentId}`}>
                    <div className={styles.assignmentMeta}>
                      <strong>{assignment.targetLabel}</strong>
                      <small>{assignment.assigneeEmail}</small>
                      <small>{assignmentTypeLabel(assignment.assignmentType)}・期限終了</small>
                    </div>
                    <span className={`${styles.stateBadge} ${styles.warning}`}>期限終了</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {scheduledAssignments.length > 0 ? (
            <div className={styles.assignmentHistory}>
              <h3 className={styles.formTitle}>開始待ち（{scheduledAssignments.length}件）</h3>
              <p className={styles.auditNotice}>開始時刻になるまで有効な担当には数えません。</p>
            </div>
          ) : null}
          <div className={styles.formBlock}>
            <h3 className={styles.formTitle}>変更申請について</h3>
            <p className={styles.auditNotice}>
              解除はその場で確定せず、PC39の「変更を確認」で別の管理者が承認します。期限切れの担当はこの画面から変更しません。
            </p>
          </div>
        </section>

        <section
          className={`panel inventoryMain ${styles.changePanel}`}
          aria-labelledby="team-review-heading"
          hidden={section !== "review"}
        >
          <p className="eyebrow">PC39 / 変更を確認</p>
          <h2 className={styles.cardHeading} id="team-review-heading">
            解除申請を確認
          </h2>
          <p className={styles.cardLead}>
            変更前と変更後を確認し、別の管理者が承認・差し戻し・却下を行います。申請者本人は自分の申請を決定できません。
          </p>
          <PendingChangeList
            changes={changes.filter((change) => change.state === "pending")}
            currentIdentityId={currentIdentityId}
            commentCode={commentCode}
            setCommentCode={setCommentCode}
            busy={busy}
            onEvent={recordChangeEvent}
          />
        </section>

        <section
          className={`panel inventoryMain ${styles.changePanel}`}
          aria-labelledby="team-history-heading"
          hidden={section !== "history"}
        >
          <p className="eyebrow">PC40 / 変更履歴</p>
          <h2 className={styles.cardHeading} id="team-history-heading">
            変更履歴
          </h2>
          <p className={styles.cardLead}>
            申請・承認・コメントを追記順に確認します。過去の記録は変更できません。
          </p>
          <button
            className="secondaryButton"
            type="button"
            disabled={changes.length === 0}
            onClick={() => downloadChangeCsv(changes)}
          >
            履歴をCSVで保存
          </button>
          <ChangeHistory changes={changes} />
        </section>
      </div>
    </div>
  );
}

function roleLabel(role: WorkspaceRole): string {
  return {
    owner: "オーナー",
    inventory_manager: "在庫管理者",
    field_worker: "撮影・在庫担当",
    shipping: "発送担当",
    accounting: "経理担当",
  }[role];
}

function PendingChangeList({
  changes,
  currentIdentityId,
  commentCode,
  setCommentCode,
  busy,
  onEvent,
}: {
  changes: TeamChangeResponse[];
  currentIdentityId: string;
  commentCode: Record<string, TeamChangeComment>;
  setCommentCode: Dispatch<SetStateAction<Record<string, TeamChangeComment>>>;
  busy: boolean;
  onEvent: (
    change: TeamChangeResponse,
    action: "approve" | "reject" | "request_changes" | "comment",
  ) => Promise<void>;
}) {
  if (changes.length === 0) {
    return <p className={styles.emptyState}>確認待ちの変更申請はありません。</p>;
  }
  return (
    <div className={styles.changeList} aria-label="確認待ちの変更申請">
      {changes.map((change) => {
        const isRequester = change.requesterId === currentIdentityId;
        const selectedComment = commentCode[change.requestId] ?? defaultCommentFor("comment");
        return (
          <article className={styles.changeCard} key={change.requestId}>
            <div className={styles.changeCardHead}>
              <div>
                <span className={styles.stateBadge}>確認待ち</span>
                <h3>{change.before.targetLabel}</h3>
              </div>
              <small>{formatDateTime(change.requestedAt)} 申請</small>
            </div>
            <div className={styles.changeCompare} aria-label="変更前後">
              <div>
                <span>変更前</span>
                <strong>{accessLabel(change.before.access)}</strong>
                <small>
                  {formatDateTime(change.before.startsAt)}〜
                  {formatDateTime(change.before.expiresAt)}
                </small>
              </div>
              <span className={styles.changeArrow} aria-hidden="true">
                →
              </span>
              <div>
                <span>変更後</span>
                <strong>{accessLabel(change.after.access)}</strong>
                <small>
                  {formatDateTime(change.after.startsAt)}〜{formatDateTime(change.after.expiresAt)}
                </small>
              </div>
            </div>
            <dl className={styles.changeFacts}>
              <div>
                <dt>申請者</dt>
                <dd>{change.requesterName}</dd>
              </div>
              <div>
                <dt>理由</dt>
                <dd>{changeReasonLabel(change.reasonCode)}</dd>
              </div>
              <div>
                <dt>対象</dt>
                <dd>{change.before.targetLabel}</dd>
              </div>
              <div>
                <dt>証拠</dt>
                <dd>この変更では任意・なし</dd>
              </div>
              <div>
                <dt>承認者</dt>
                <dd>{change.approverName ?? "未決定（別の管理者）"}</dd>
              </div>
            </dl>
            {isRequester ? (
              <p className={styles.requesterNotice} role="status">
                申請者本人のため、承認・差し戻し・却下はできません。別の管理者が確認してください。
              </p>
            ) : null}
            <div className={styles.changeActions}>
              <label>
                コメント
                <select
                  value={selectedComment}
                  onChange={(event) =>
                    setCommentCode((current) => ({
                      ...current,
                      [change.requestId]: event.target.value as TeamChangeComment,
                    }))
                  }
                >
                  {changeComments.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {!isRequester ? (
                <div className={styles.decisionButtons}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onEvent(change, "approve")}
                  >
                    承認
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onEvent(change, "request_changes")}
                  >
                    差し戻す
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onEvent(change, "reject")}
                  >
                    却下
                  </button>
                </div>
              ) : null}
              <button
                className="secondaryButton"
                type="button"
                disabled={busy}
                onClick={() => void onEvent(change, "comment")}
              >
                コメントを追記
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ChangeHistory({ changes }: { changes: TeamChangeResponse[] }) {
  if (changes.length === 0) {
    return <p className={styles.emptyState}>変更履歴はまだありません。</p>;
  }
  return (
    <ol className={styles.historyList} aria-label="変更履歴のタイムライン">
      {changes.map((change) => (
        <li key={change.requestId}>
          <div className={styles.historyHead}>
            <strong>{change.before.targetLabel}</strong>
            <span className={styles.stateBadge}>{changeStateLabel(change.state)}</span>
          </div>
          <p>
            {change.requesterName}・{formatDateTime(change.requestedAt)}・理由{" "}
            {changeReasonLabel(change.reasonCode)}・承認者 {change.approverName ?? "未決定"}
          </p>
          <div className={styles.historySnapshot}>
            <span>
              変更前: {accessLabel(change.before.access)} /{" "}
              {formatDateTime(change.before.expiresAt)}まで
            </span>
            <span>
              変更後: {accessLabel(change.after.access)} / {formatDateTime(change.after.expiresAt)}
              まで
            </span>
          </div>
          <ul className={styles.eventList}>
            {change.events.map((event) => (
              <li key={event.eventId}>
                <span>{eventActionLabel(event.action)}</span>
                <strong>{event.actorName}</strong>
                <small>{formatDateTime(event.occurredAt)}</small>
                {event.commentCode ? <em>{commentLabel(event.commentCode)}</em> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function defaultCommentFor(
  action: "approve" | "reject" | "request_changes" | "comment",
): TeamChangeComment {
  if (action === "request_changes") return "check_target_again";
  if (action === "reject") return "clarify_reason";
  return "target_checked";
}

function accessLabel(access: TeamChangeResponse["before"]["access"]): string {
  return access === "active" ? "担当中" : "解除予定";
}

function changeReasonLabel(reason: TeamChangeReason): string {
  return changeReasons.find(([value]) => value === reason)?.[1] ?? reason;
}

function changeStateLabel(state: TeamChangeResponse["state"]): string {
  return {
    pending: "確認待ち",
    approved: "承認済み",
    rejected: "却下",
    changes_requested: "差し戻し",
  }[state];
}

function eventActionLabel(action: TeamChangeResponse["events"][number]["action"]): string {
  return {
    requested: "申請",
    approve: "承認",
    reject: "却下",
    request_changes: "差し戻し",
    comment: "コメント",
  }[action];
}

function commentLabel(comment: TeamChangeComment): string {
  return changeComments.find(([value]) => value === comment)?.[1] ?? comment;
}

function downloadChangeCsv(changes: TeamChangeResponse[]): void {
  const header = [
    "対象",
    "状態",
    "理由",
    "申請者",
    "承認者",
    "証拠",
    "申請日時",
    "変更前",
    "変更後",
    "操作",
    "操作した人",
    "操作日時",
    "コメント",
  ];
  const rows = changes.flatMap((change) => {
    const events = change.events.length ? change.events : [null];
    return events.map((event) => [
      change.before.targetLabel,
      changeStateLabel(change.state),
      changeReasonLabel(change.reasonCode),
      change.requesterName,
      change.approverName ?? "未決定",
      "この変更では任意・なし",
      change.requestedAt,
      `${accessLabel(change.before.access)} ${change.before.startsAt}〜${change.before.expiresAt}`,
      `${accessLabel(change.after.access)} ${change.after.startsAt}〜${change.after.expiresAt}`,
      event ? eventActionLabel(event.action) : "申請",
      event?.actorName ?? change.requesterName,
      event?.occurredAt ?? change.requestedAt,
      event?.commentCode ? commentLabel(event.commentCode) : "",
    ]);
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "team-change-history.csv";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function assignmentTypeLabel(type: TeamAssignmentResponse["assignmentType"]): string {
  return {
    capture: "商品撮影・採寸",
    inventory_putaway: "格納する商品",
    location_putaway: "格納先の場所",
    location_photo: "場所写真",
    shipping: "発送",
  }[type];
}

function isExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}

function isScheduled(startsAt: string): boolean {
  return Date.parse(startsAt) > Date.now();
}

function isActiveAssignment(assignment: TeamAssignmentResponse): boolean {
  const now = Date.now();
  return (
    !assignment.revokedAt &&
    Date.parse(assignment.startsAt) <= now &&
    Date.parse(assignment.expiresAt) > now
  );
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
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
