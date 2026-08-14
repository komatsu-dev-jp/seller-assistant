# Database

PostgreSQLを確定データの正本として使います。`migrations/0001_p0_core.sql` がP0の初期migration（データベース構造を再現可能に変更するSQL）です。

自動テストは、必須テーブル・RLS・一意制約・監査禁止列がmigrationに含まれることを検査します。PostgreSQL 18.6の使い捨てDBで0001〜0007の適用、制限ロール、owner作成、login、別workspace拒否、商品/場所の二重読取、使用済みscan拒否、1枠への同時格納、同一現物への同時注文引当、棚卸の別担当確認、rate limit、logoutを結合確認済みです。

APIの`DATABASE_URL`は、`resale_app_runtime`を付与されたLOGINロールを使います。PostgreSQL管理者、`SUPERUSER`、`BYPASSRLS`、runtime未所属の接続ではAPIが起動を拒否します。migrationと初期owner作成だけは別の管理用接続を使い、通常APIへ管理者URLを渡しません。

通常APIは在庫の場所・状態・移動番号を直接更新できません。未格納の現物を作り、商品ラベルと場所ラベルを人が確認した`scan_session`と`inventory_movement`を同じtransaction（全部成功か全部取消にする処理単位）へ保存した場合だけ、DB triggerが在庫を移動します。
