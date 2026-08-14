# 受け入れ条件・実装対応表

- 状態: Goal開始・基盤実装中
- 更新日: 2026-08-15（JST）
- 正本: `docs/specs/mvp-product-spec-v1.md`、`docs/specs/technical-architecture-v1.md`

## P0ゲート

P0の必須ACは AC-001、003〜008、013〜014、018〜023、025〜026、028〜034、042〜055。各行へ実装、テスト、実画面証拠を追加し、すべて合格するまでP1へ進まない。

| 範囲        | 実装先                         | 自動検証                      | 手動・画面証拠       | 状態                      |
| ----------- | ------------------------------ | ----------------------------- | -------------------- | ------------------------- |
| AC-001〜009 | domain/contracts、API、Web/PWA | unit/API                      | P0仕入・撮影・採寸   | 原本/採寸APIまで実装      |
| AC-010〜017 | media/listing/price adapters   | unit/contract                 | 原本比較・本人引渡し | 未着手                    |
| AC-018〜020 | inventory/order/shipping       | concurrency/API               | 二重読取・発送・返品 | 注文〜発送縦導線実装済    |
| AC-021〜024 | finance/accounting/Notion      | fixture/schema                | 収益・CSV・同期確認  | 収支/会計CSV部分実装      |
| AC-025〜028 | UI/監査/品質                   | a11y/security/all suites      | PC/iPhone PWA実画面  | ログイン/署名Cookie部分済 |
| AC-029〜041 | 財務・冪等・機密・CSV・旧資産  | fixture/contract/security     | 出力内容確認         | 財務/冪等/API部分実装     |
| AC-042〜055 | inventory/location/count       | DB/domain/concurrency         | M12/W10導線          | domain/SQL/W10部分実装    |
| TA-001〜037 | architecture/CI/security       | type/lint/test/build/contract | platform checklist   | 実DB/RLS部分まで実装      |

## 合格条件

- 必須テスト100%合格。
- domain/security line coverage 80%以上、branch 75%以上。
- UI評価90点以上。
- Critical/High 0件。
- 独立レビュー後に影響範囲を再検証。

## Iteration 4の実証範囲

- 自動検証: 47/47テスト合格、line 91.36%、branch 81.31%、function 100%。
- 実画面: 試験SKU 1点で仕入からCSV保存まで完走し、console error 0件。
- 未接続: 実PostgreSQL、実RLS、認証セッション、写真原本Storage、Notion投影。
- 未実機: iPhone Safariのホーム画面追加、カメラ、オフライン復帰。PCブラウザの390×844表示確認は実機確認の代替にしない。

## Iteration 5の実証範囲

- 原本: 同一ID・同一変更不可情報は再利用し、hash/役割/保管先変更は409拒否。
- 採寸: 証拠写真必須、別SKU証拠は403拒否、2cm超差は再確認、AI確認経路なし。
- サマリー: 写真4役割と必須採寸4項目が揃い警告0件のときだけ人レビュー可能。
- DB: `media_asset` / `measurement_attempt` のRLSと複合FKを静的検査。実DB実行は未確認。

## Iteration 6の実証範囲

- 本番API: 署名Cookie以外のactor指定を拒否し、認証なしは401。
- Cookie: 改ざん、期限切れ、未来発行、重複を拒否。HttpOnly / Secure / SameSite=Strictを固定。
- 起動: DB接続先または32バイト以上のsession秘密鍵がなければ停止。
- Logout: DB session失効→Cookie削除→PWA同期待ち/cache削除の順序を固定。失効未確認なら削除しない。
- 未完了: 初期owner作成、実DB session/membership/RLS。

## Iteration 7の実証範囲

- 変更API: `APP_ORIGIN`完全一致とsame-originだけを許可。欠落/cross-site/類似domainは403。
- Web中継: browser origin照合後だけCookieを内部APIへ渡す。接続先はserver環境変数限定。
- 未完了: 実配置でのproxy/Origin確認、実DB role/RLS。

## Iteration 8の実証範囲

- Password: Node.js標準scrypt、N=2^17/r=8/p=1、16-byte random salt、32-byte hash。平文保存なし。
- Login: 同一の汎用401、5回失敗で15分停止、HttpOnly/Secure/SameSite=Strict Cookie発行。
- Web中継: URL/ブラウザ保存領域へpasswordを置かず、API未接続は503で停止。
- 自動検証: 15 test files / 69 tests、line 91.36%、branch 81.81%、function 100%、format/lint/type/build合格。
- 実画面: PCおよび390×844で横あふれなし。未接続エラーを`role=alert`で表示。
- 初期owner: 公開APIを設けず、対話型CLIで一度だけ作成。passwordは非表示、同時実行はDB lock、2人目は拒否。
- 未完了: 実PostgreSQLでのbootstrap/hash/session/rate-limit、認証後の画面保護。

## Iteration 9の実証範囲

- PostgreSQL: 公式案内のEDB Windows ZIP 18.6を一時領域へ展開し、0001〜0006 migrationを実適用。
- 制限ロール: `NOLOGIN/NOSUPERUSER/NOBYPASSRLS` capability roleと必要操作だけのgrant。管理者URLはAPI起動前に拒否。
- 結合導線: owner bootstrap、実scrypt login、session Cookie、SKU作成、別workspace 403、5回失敗429、logout後401がPASS。
- 一時DB: 127.0.0.1:55432限定、架空データのみ、外部費用・外部CI・公開0件。
- 残り: 全RLS表/全roleの越境マトリクス、同時transaction、不変条件、実サーバー経由Webログイン。
