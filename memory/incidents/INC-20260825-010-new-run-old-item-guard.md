---
id: INC-20260825-010
type: incident
category: pilot-run-isolation
status: candidate
created_at: 2026-08-25
verified_at: null
review_after: 2026-08-26
owner: Codex
scope:
  - apps/api
  - apps/web
evidence:
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

新しいpilot runは旧runの商品を操作せず、旧summaryを0件として開始する。

# 実際の結果

P06 preflightで、新runから旧itemへ到達するguard不足のリスクを検出した。

# 影響

人P06を開始せず停止。旧itemの変更、DB mutation、外部送信は0件だった。

# 修正・検証

新runのold-item guard、capture/listing disabled、old summary 0をUI/APIで確認した。a976のfresh rerun testsと31 files / 209 testsがPASS。candidateのままP08を待つ。

# 再発防止の候補

新run開始時に旧item操作、旧summary、capture/listing状態を空状態ゲートで検査する。
