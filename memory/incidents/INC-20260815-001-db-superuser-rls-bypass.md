---
id: INC-20260815-001
type: incident
category: database-security
status: candidate
created_at: 2026-08-15
verified_at: null
review_after: 2026-08-16
owner: Codex
scope:
  - apps/api/src/server.ts
  - apps/api/src/db-security.ts
  - packages/db/migrations/0006_runtime_role.sql
evidence:
  - apps/api/src/postgres-integration.ts
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

APIは最小権限のDB利用者で接続し、全workspace業務表でRLSが必ず有効になる。

# 実際の結果

接続URLの存在だけを起動条件にしており、PostgreSQL管理者または`BYPASSRLS`権限の利用者でもAPIを起動できた。その接続ではRLSを迂回できる。

# 影響

実データ・本番公開前に検出したため、利用者データへの影響は0件。未修正で公開した場合はworkspace越境につながる可能性があった。

# 再現方法

PostgreSQL管理者の接続URLを`DATABASE_URL`へ設定すると、修正前はAPI起動前の権限検査がなかった。

# 原因

migrationでRLSを強制しても、PostgreSQL管理者と`BYPASSRLS`権限は迂回できることをAPI起動条件へ反映していなかった。

# 修正

`resale_app_runtime`を`NOLOGIN NOSUPERUSER NOBYPASSRLS`で作成し、必要な表操作だけを許可した。API起動時に管理者、`BYPASSRLS`、runtime未所属を拒否する。

# 検証

PostgreSQL 18.6の一時DBで、管理者接続の起動検査拒否、制限ロール許可、別workspace APIの403を確認した。

# 再発防止の候補

新規DB表・worker・migration追加時にruntime grantとRLS越境否定testを必須にする。管理者URLをアプリ実行環境へ設定しない。

# 独立レビュー担当

未実施。Goal凍結後の独立レビューで確認する。
