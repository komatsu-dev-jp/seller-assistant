---
id: INC-20260824-006
type: incident
category: inventory-approval-safety
status: candidate
created_at: 2026-08-24
verified_at: 2026-08-24
review_after: 2026-08-25
owner: Codex
scope:
  - apps/web/src/components/stocktake-workspace.tsx
  - apps/api/src/stocktake-repository.ts
evidence:
  - docs/implementation/design-fidelity-evidence.md
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

`dual_actor`棚卸では、現在の担当者だけが確認操作を行い、最終承認は別managerへ引き渡す。元担当者の承認buttonは無効にし、画面上で日本語の引渡し案内を表示する。

# 実際の結果

dual_actorの初回担当者にも差異確認form送信と最終承認buttonが有効になり、APIが409の英語エラーを返した。API/DB mutationは0件だった。

# 影響

承認状態や監査データの不正更新は0件。ただし、画面が元担当者の操作を止めず、英語409エラーを表示したため、別managerへの引渡し手順が不明確だった。修正後はformを非表示にし、未解決の承認buttonをdisabledとしてP05で確認した。

# 再現方法

dual_actor棚卸を開始し、初回担当者のまま最終承認画面を開く。修正前は最終承認buttonが有効で、押下するとAPI 409の英語エラーになる。

# 原因

Webがcurrent identityとdual ruleを事前に反映せず、APIの409 hard blockだけに依存してbutton状態と案内文を決めていた。

# 修正

Webで`currentIdentityId`と`canApprove`を評価し、元担当者のbuttonを`disabled`にした。別managerへの日本語引渡し案内を表示し、成功状態は`role=status`で示す。API/DBのhard blockは維持した。

# 検証

対象23 tests、Web typecheck/build、full `npm.cmd run check`（29 files / 202 tests）がPASSした。元担当者の確認formは非表示、承認buttonはdisabled、日本語handoffを表示し409なし。別managerの写真・二重読取・keyboard 3秒→hold後の承認は成功statusと`approved dual_actor`を確認した。P05独立Terra 100/100でも再確認した。candidateは独立P08レビュー待ちで維持する。

# 再発防止の候補

重要操作はAPI hard blockだけでなく、current identityに基づくbutton disabled、引渡し案内、成功/失敗のaccessibility statusを同じブラウザ試験で確認する。

# 独立レビュー担当

未実施。Goal凍結後の独立レビューで確認する。
