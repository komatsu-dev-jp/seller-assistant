---
id: INC-20260825-011
type: incident
category: pilot-contract-integrity
status: candidate
created_at: 2026-08-25
verified_at: null
review_after: 2026-08-26
owner: Codex
scope:
  - apps/api
  - apps/web
evidence:
  - docs/implementation/acceptance-map.md
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

fixture categoryとAPI送信契約が一致し、category mismatchを人P06開始前に検出する。

# 実際の結果

category `tops` mismatchで初回POSTが409になった。

# 影響

契約不一致を開始前に検出でき、誤SKU作成や外部送信は0件だった。修正後の同run TOP-01は201（`INV-910006-4`）。

# 修正・検証

category送信契約を修正し、a976で同run再送、console 0/warn 0、18 loopback requests、full check 31 files / 209 testsをPASS。独立Terra GO後もcandidateとしてP08を待つ。

# 再発防止の候補

fixture manifest、UI payload、API contract、DB categoryを同じpreflightで照合する。
