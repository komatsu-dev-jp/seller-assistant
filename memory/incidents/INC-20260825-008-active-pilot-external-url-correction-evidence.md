---
id: INC-20260825-008
type: incident
category: pilot-safety-evidence
status: candidate
created_at: 2026-08-25
verified_at: null
review_after: 2026-08-26
owner: Codex
scope:
  - docs/specs/pilot-protocol-v1.1.md
  - apps/web
evidence:
  - docs/implementation/acceptance-map.md
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

active pilotの導線は外部URLを含まず、訂正が発生した場合は根拠とmanual correctionを欠損なく記録する。

# 実際の結果

P06開始前preflightで、active pilotに外部URL導線と訂正証拠の欠損候補を検出した。

# 影響

合成preflight中に停止し、外部送信と人P06の開始は0件。a976限定の修正後GOで再確認したが、candidateを維持しP08レビューを待つ。

# 修正・検証

外部URL導線を停止し、訂正証拠を保存対象へ追加。a976で31 files / 209 tests、fresh/upgrade DB、18 loopback requests、独立Terra GO（Critical/High/Medium/Low 0）を確認した。人P06は未実施。

# 再発防止の候補

active run開始前に外部URL、根拠、manual correction、network境界を同時確認する。
