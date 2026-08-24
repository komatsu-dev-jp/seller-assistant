---
id: INC-20260824-004
type: incident
category: inventory-audit-integrity
status: candidate
created_at: 2026-08-24
verified_at: null
review_after: 2026-08-25
owner: Codex
scope:
  - packages/contracts/src/index.ts
  - apps/api/src/stocktake-repository.ts
  - apps/web/src/lib/stocktake-audit.ts
evidence:
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

不足候補の確認理由と、後で現物を発見して復元した理由を、発生時点ごとの監査履歴として別々に表示する。

# 実際の結果

データベースの`audit_event`には確認時`not_seen_during_count`、復元時`found_in_place`が別行で正しく残っていた。一方、画面は差異レコードにある現在の`reasonCode`を過去の確認履歴にも使い、復元後は両方が`found_in_place`に見えた。

# 影響

保存済み監査イベントの更新・削除や在庫状態の誤変更は0件。ただし画面上では過去の判断理由が書き換わったように見え、監査確認を誤らせる状態だった。

# 再現方法

単独棚卸で不足候補を`not_seen_during_count`として3秒確認し、同じ在庫を`found_in_place`として復元する。修正前の「不足候補を確認」行は、復元後に`found_in_place`と表示される。

# 原因

APIの差異read modelが現在値の理由を1つだけ返し、画面が実際の不変な監査イベントを参照せず、確認履歴を現在値から組み立てていた。

# 修正

APIが`audit_event`から`confirmedReasonCode`と`restoredReasonCode`を別々に返し、画面の純粋関数が各イベントの理由だけを使うようにした。既存の現在値`reasonCode`は互換用に維持した。

# 検証

契約テスト、画面の履歴純粋関数テスト、型検査、29 files / 202 testsの全体検査がPASSした。既存の評価用DBを再読込すると、確認理由`not_seen_during_count`と復元理由`found_in_place`が別々に表示された。空DBの33 migrationsと全PostgreSQL結合試験、0001〜0033の更新試験もPASSした。

# 再発防止の候補

監査タイムラインは現在状態から推測せず、不変な監査イベントまたはイベント別read modelだけから作る。複数段階で理由が変わる操作は、変更前後の理由が同時に残る回帰試験を必須にする。

# 独立レビュー担当

未実施。Goal凍結後の独立レビューで確認する。
