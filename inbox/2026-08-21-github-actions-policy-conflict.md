# 2026-08-21 — GitHub Actionsの自動実行方針

- Status: resolved
- Question: GitHub Actionsを手動実行だけに固定できているか。
- Context: 過去には自動実行との食い違いがあったが、現HEADの`.github/workflows/ci.yml`と`.github/workflows/pages.yml`はいずれも`workflow_dispatch`だけである。`AGENTS.md`、`docs/implementation/zero-cost-guard.md`、`docs/DECISIONS.md`の2026-08-20判断も、無料優先のため手動実行だけとする内容で一致している。
- Owner: none
- Next action: 利用者への再質問は不要。GitHub Issue #6の外部状態は別途整理するまで未変更のままにする。
- Resolution: 2026-09-08の現HEAD照合で、手動実行だけに統一済みと確認した。
- Superseded: 2026-09-09に利用者がPR作成・mergeと、自動CI・Pages公開を明示承認した。公開リポジトリの標準`ubuntu-latest`だけを使う0円境界で、Pull Requestと`main`へのpushを自動実行する。詳細は`docs/DECISIONS.md`の同日判断を正本とする。
