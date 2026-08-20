# 2026-08-21 — GitHub Actionsの自動実行方針

- Status: open
- Question: 現在のGitHub Actions自動実行を維持するか、手動実行だけへ戻すか。
- Context: `.github/workflows/ci.yml`は`pull_request`と`main`へのpushで実行する。Draft PR #5の作成時に実行 #32389338067 が自動起動して成功した。一方、`AGENTS.md`と`docs/implementation/zero-cost-guard.md`は外部CIを手動実行だけにする方針を記録している。詳細はGitHub Issue #6を参照する。
- Owner: ユーザー
- Next action: 自動実行を維持するか、`workflow_dispatch`だけへ戻すかを選ぶ。選択後にworkflowと方針文書を同じ内容へそろえ、`docs/DECISIONS.md`へ記録する。
- Resolution: none
