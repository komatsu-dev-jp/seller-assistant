// All intake writers must hold this same browser-origin-wide exclusive lock.
// Holding it for the editor's lifetime keeps synchronous localStorage writes atomic
// relative to every other editor tab (a getItem/setItem check alone cannot do that).
export const intakeWriteLock = "seller-assistant-box-intake-editor-v1";
export interface IntakeEditorLease {
  canWrite(): boolean;
  close(): void;
}
export function acquireIntakeEditor(
  manager: Pick<LockManager, "request"> | undefined,
  ready: () => void,
  failed: (message: string) => void,
): IntakeEditorLease {
  let active = true;
  let held = false;
  let release: (() => void) | undefined;
  const lease = {
    canWrite: () => active && held,
    close: () => {
      active = false;
      held = false;
      release?.();
    },
  };
  if (!manager) {
    failed(
      "安全に保存するための機能が使えません。最新版のSafariなどで、httpsの公開URLから開いてください。保存内容は変更していません。",
    );
    return lease;
  }
  void manager
    .request(intakeWriteLock, { mode: "exclusive", ifAvailable: true }, (lock) => {
      if (!active) return;
      if (!lock) {
        failed(
          "別のタブで箱を編集中です。そのタブを閉じるか商品一覧へ戻ってから、読み込みを再試行してください。保存内容は変更していません。",
        );
        return;
      }
      held = true;
      return new Promise<void>((resolve) => {
        release = resolve;
        ready();
      });
    })
    .catch(() => {
      held = false;
      if (active)
        failed(
          "編集の準備ができませんでした。読み込みを再試行してください。保存内容は変更していません。",
        );
    });
  return lease;
}
