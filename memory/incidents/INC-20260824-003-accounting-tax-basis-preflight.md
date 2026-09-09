---
id: INC-20260824-003
type: incident
category: accounting-safety
status: candidate
created_at: 2026-08-24
verified_at: null
review_after: 2026-08-25
owner: Codex
scope:
  - packages/contracts/src/index.ts
  - apps/api/src/order-repository.ts
  - apps/web/src/components/accounting-workspace.tsx
evidence:
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

注文の税込・税抜・税区分が不明なら、会計CSVの事前確認画面で不足項目を示し、出力操作を無効にする。

# 実際の結果

`tax_basis = unknown`の評価用注文で、画面は全項目を確認済みとして表示し、CSV作成ボタンを有効にした。操作後のAPIは409で安全に拒否し、CSVは0件のままだった。

# 影響

サーバー側の停止条件が働いたため、誤った会計CSVの作成・外部送信・取込は0件。利用者には、出力できるように見えてから拒否される誤解を招く表示だった。

# 再現方法

会計profileとmappingをすべて確認済みにし、税区分だけ`unknown`の発送済み注文を会計画面で選択する。修正前は事前確認が全件合格に見え、出力ボタンが有効になる。

# 原因

財務サマリーの不足項目に税区分を含めず、Webもサーバーの会計準備状態をボタンの無効条件へ反映していなかった。

# 修正

契約とAPIの`missingInputs`へ`taxBasis`を追加し、Webへ日本語の停止理由を表示した。会計準備が未完了なら、新規作成と再出力の両方を無効にする。

# 検証

対象契約/API/Webテスト、型検査、API/Web build、29 files / 202 testsの全体検査がPASSした。実ブラウザでは「税込・税抜・税区分」を未確認として表示し、27列CSVボタンが操作前から無効になった。正常注文の27列5行CSVはPC内だけで作成・検証した。

# 再発防止の候補

サーバーのhard block（必ず停止する条件）には、同じ原因コードを返す表示用read modelと、操作前に無効になる実ブラウザ試験を必須にする。

# 独立レビュー担当

未実施。Goal凍結後の独立レビューで確認する。
