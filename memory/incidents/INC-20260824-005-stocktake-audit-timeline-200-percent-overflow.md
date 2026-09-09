---
id: INC-20260824-005
type: incident
category: responsive-audit-integrity
status: candidate
created_at: 2026-08-24
verified_at: 2026-08-24
review_after: 2026-08-25
owner: Codex
scope:
  - apps/web/src/lib/stocktake-audit.ts
  - apps/web/src/components/stocktake-workspace.tsx
evidence:
  - docs/implementation/design-fidelity-evidence.md
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

200%相当の文字拡大でも、棚卸監査詳細が390px幅の画面内で折り返され、横方向に切れず読める。

# 実際の結果

200%相当の文字拡大時、`stocktakeAuditTimeline`の長文で`scrollWidth = 402`、`clientWidth = 390`となり、監査詳細の一部が画面外へ切れた。

# 影響

データの更新・削除や監査イベントの欠落は0件。ただし、利用者が監査詳細の長文を横方向へ移動しないと読めず、重要な棚卸理由の確認性が低下した。fresh P05で修正を再確認した。

# 再現方法

390px幅の棚卸画面を200%相当へ拡大し、長文を含む`stocktakeAuditTimeline`を表示する。修正前は`scrollWidth`が`clientWidth`を超過する。

# 原因

mobile gridの列幅と子要素の`min-width`が縮小を妨げ、監査詳細の長文に折返し指定が不足していた。

# 修正

mobile gridを`minmax(0, 1fr)`へ変更し、該当子要素へ`min-width: 0`、長文へ`overflow-wrap: anywhere`を適用した。

# 検証

対象23 tests、Web typecheck/build、full `npm.cmd run check`（29 files / 202 tests）がPASSした。200%相当の表示で監査詳細を再測定し、修正後の横切れを解消した。fresh P05独立Terra 100/100でもresponsive 15/15、selector overflow 0を確認した。candidateは独立P08レビュー待ちで維持する。

# 再発防止の候補

200%相当の文字拡大を含む390px幅の各重要画面で`scrollWidth <= clientWidth`を測定し、長文監査・エラー・理由表示をfixtureへ含める。

# 独立レビュー担当

未実施。Goal凍結後の独立レビューで確認する。
