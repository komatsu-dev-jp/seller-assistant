# Database

PostgreSQLを確定データの正本として使います。`migrations/0001_p0_core.sql` がP0の初期migration（データベース構造を再現可能に変更するSQL）です。

自動テストは、必須テーブル・RLS・一意制約・監査禁止列がmigrationに含まれることを検査します。PostgreSQL 18.6の使い捨てDBで0001〜0011の適用、制限ロール、23業務テーブルすべてのRLS/強制RLS/同一workspace policy、破壊的な業務テーブル権限0件、owner作成、login、sessionへ固定したworkspace、別workspace拒否、外注現場担当による仕入確定拒否、場所枝/作業/期限付き担当、SKU/撮影作業/期限付き担当、場所写真の担当外拒否/実bytes検査/審査中非表示/別担当承認/GPS除去/認証付き取得/原本メタデータ不変、商品/場所の二重読取、API経由の格納と同一操作再送、使用済みscan拒否、1枠への同時格納、同一現物への同時注文引当、棚卸の別担当確認、rate limit、logoutを結合確認済みです。

APIの`DATABASE_URL`は、`resale_app_runtime`を付与されたLOGINロールを使います。PostgreSQL管理者、`SUPERUSER`、`BYPASSRLS`、runtime未所属の接続ではAPIが起動を拒否します。migrationと初期owner作成だけは別の管理用接続を使い、通常APIへ管理者URLを渡しません。

通常APIは在庫の場所・状態・移動番号を直接更新できません。未格納の現物を作り、商品ラベルと場所ラベルを人が確認した`scan_session`と`inventory_movement`を同じtransaction（全部成功か全部取消にする処理単位）へ保存した場合だけ、DB triggerが在庫を移動します。格納APIはsessionへ署名されたworkspace以外を拒否し、同じidempotency key（同じ操作の再送を見分ける番号）と同じ内容は同じ結果を返し、内容が変わる再利用は409で拒否します。

場所写真の画像本体は、Node.js標準機能だけの`LocalPrivateMediaStore`でPC内の絶対パス配下へ保存します。APIが受信bytesからJPEG/PNG、縦横、容量、SHA-256を判定し、端末からSHA、保存先、GPS件数を受け付けません。原本は排他的作成で不変にし、別担当の承認時だけ表示用へ位置metadataを除去します。承認済み画像は認証・担当範囲を再確認するAPIからだけ返し、非公開保存先は応答しません。未対応形式・壊れた画像・書出し失敗は表示ファイル0件で停止します。PWAの場所写真撮影UIは未完了です。
