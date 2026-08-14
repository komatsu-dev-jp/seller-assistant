# Database

PostgreSQLを確定データの正本として使います。`migrations/0001_p0_core.sql` がP0の初期migration（データベース構造を再現可能に変更するSQL）です。

自動テストは、必須テーブル・RLS・一意制約・監査禁止列がmigrationに含まれることを検査します。PostgreSQL 18.6の使い捨てDBで0001〜0006の適用、制限ロール、owner作成、login、別workspace拒否、rate limit、logoutを結合確認済みです。

APIの`DATABASE_URL`は、`resale_app_runtime`を付与されたLOGINロールを使います。PostgreSQL管理者、`SUPERUSER`、`BYPASSRLS`、runtime未所属の接続ではAPIが起動を拒否します。migrationと初期owner作成だけは別の管理用接続を使い、通常APIへ管理者URLを渡しません。
