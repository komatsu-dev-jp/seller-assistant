---
id: INC-20260825-009
type: incident
category: pilot-idempotency
status: candidate
created_at: 2026-08-25
verified_at: null
review_after: 2026-08-26
owner: Codex
scope:
  - apps/api
  - packages/db
evidence:
  - docs/implementation/acceptance-map.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

rerun時はSKUとreceiptが一意に発行され、既存runやreadonly SKUと衝突しない。

# 実際の結果

P06 preflightでrerunのSKU/receipt衝突リスクを検出した。

# 影響

人P06を開始せず停止。確定データの上書きや外部送信は0件だった。

# 修正・検証

一意readonly SKU/receiptと新規run guardを適用し、active run `917e2178-1c1c-4717-999b-0613f8b534a9`でTOP-01を201（`INV-910006-4`）まで確認した。a976のfresh/upgrade rerun testsとfull check 31 files / 209 testsはPASS。P08待ちでcandidateを維持する。

# 再発防止の候補

rerunごとにrun、SKU、receipt、旧summaryの衝突をDB/API/UIで検査する。
