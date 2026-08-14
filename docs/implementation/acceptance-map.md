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

## Iteration 10の実証範囲

- 二重読取: 商品ラベル、場所ラベル、版、対象workspace、現在地、人の確認をscan sessionで検査し、誤商品ラベルを拒否。
- 原子的移動: scan sessionとmovementを同じtransactionで確定し、使用済みscan、古い現在地/移動番号、直接の在庫状態更新を拒否。
- 同時格納: 容量1の場所へ2件を同時格納し、成功1件・拒否1件。在庫の二重格納0件。
- 同時引当: availableな同一現物を2注文へ同時引当し、成功1件・拒否1件。引当成功時だけreservedへ変更。
- 棚卸: initial counterとreconfirmer、requesterとapproverの分離、2人以上、resolution/resolved_atをDBで必須化。
- 実DB: PostgreSQL 18.6へ0001〜0007を適用し、`postgres-integration: PASS`。架空データ、127.0.0.1、外部費用0円。
- 全体検証: 16 test files / 72 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 残り: 全表/全roleのRLSマトリクス、API経由の在庫操作、オフライン競合復旧、実HTTPログイン、実iPhone PWA。

## Iteration 11の実証範囲

- Session workspace: login時に所属workspaceをDBで決め、署名Cookieとsession台帳へ固定。URLだけ別workspaceへ変えても403拒否。
- 格納API: 商品・場所ラベル、各ラベル版、二つの読取時刻、人確認、冪等キーを受け、scan・movement・auditを一つのtransactionで確定。同一内容の再送は同一結果、同じキーで内容変更は409拒否。
- PWA: ブラウザから同一URLのWeb中継を通って実API/実PostgreSQLへ格納。オンライン成功時だけ「サーバーへ格納しました」を表示。
- 圏外復旧: 必要最小項目だけをIndexedDB（ブラウザ内の保存領域）へ保留。復帰後に手動/onlineイベントで再送し、競合は自動上書きせず保留する。Service Workerは`/api/`と実中継の`/v1/`を保存しない。
- 実画面: 390×844のPCブラウザでオンライン格納と圏外保存→復帰同期を完走。各SKUでmovement 1件・audit 1件・在庫場所一致を実DB確認。証拠は`output/playwright/pwa-putaway-server-confirmed.png`、`pwa-offline-resync-complete.png`。
- 実DB: PostgreSQL 18.6の新規使い捨てDBへ0001〜0008を適用し、`postgres-integration: PASS`。
- 全体検証: 16 test files / 76 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 費用: 有料API、有料SaaS、外部CI、デプロイ、Apple Developer登録0件。Windows PC内のみ。
- 残り: 全表/全roleのRLSマトリクス、注文等の実API、写真原本Storage、実iPhone Safariのホーム画面追加/カメラ/圏外復帰。

## Iteration 12の実証範囲

- 全業務テーブル: workspaceを持つ21テーブルについて、RLS有効、強制RLS有効、`USING`/`WITH CHECK`のworkspace policyが各1件であることを実PostgreSQL catalogで確認。
- DB権限: 制限runtime roleが21業務テーブルへDELETE/TRUNCATE/REFERENCES/TRIGGERを持たないことを実DBで確認。ログイン成功時の失敗回数削除に必要な認証専用テーブルは対象外として区別。
- 外注role: `field_worker`の実credential/sessionを作り、role取得成功、SKU作成403、仕入確定409を確認。URLの別workspace指定403も継続確認。
- 結果: PostgreSQL 18.6の使い捨てDBで`postgres-integration: PASS (restricted role, 21-table RLS matrix, field-worker denial, ...)`。
- 費用: PC内だけ、外部費用・外部CI・公開0件。
- 残り: 場所枝/期限付き割当、住所期限、写真Storage、注文等の実API、実iPhone Safari。

## Iteration 13の実証範囲

- 外注割当: `work_assignment`へ担当者、場所枝の根、作業種類、開始、期限、取消を分離保存。ラベルを読んだだけでは権限を増やさない。
- 場所枝: 対象場所から親をたどり、担当枝の内側だけを許可。`field_worker`は格納担当なし403、担当外の棚403、担当内の棚だけ201。
- role分離: owner/inventory_managerは管理作業として格納可能。field_workerだけ期限付き割当を必須化し、仕入確定やSKU作成は引き続き拒否。
- DB: 0001〜0009、22業務テーブルRLS、同一操作再送、二重読取、容量、引当、棚卸を含む実PostgreSQL結合テストPASS。
- 全体検証: 16 test files / 77 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 費用: Windows PC内だけ、外部費用・外部CI・公開0件。
- 残り: 割当解除時の端末同期、場所写真の承認/取得、住所期限、注文等の実API、実iPhone Safari。

## Iteration 14の実証範囲

- 割当解除: 同期待ち再送時にsession/格納APIが401または403を返した操作は、割当解除・変更として端末outboxから消去。件数と理由を画面表示。
- 競合分離: 409の現在地/ラベル版競合は消去せず、自動上書きもせず、再読取を要求。5xx/通信不能は端末に保持。
- 実画面: 架空の同期待ち1件へ403を返し、「1件は担当解除・変更のため端末から消去」「残り0件」を390×844で確認。証拠は`output/playwright/pwa-assignment-revoked-cleared.png`。
- console: 意図的な`/v1/session/context` 403が1件。アプリ例外、画面崩れ、予期しない警告0件。
- 全体検証: 16 test files / 77 tests、format/lint/type/build合格。外部費用0円。
- 残り: 場所写真の承認/取得、住所期限、注文等の実API、実iPhone Safari。

## Iteration 15の実証範囲

- 原本: 場所写真ID、原本asset ID/SHA-256/非公開key/形式/容量/画素、撮影者/時刻を保存し、update triggerで変更を拒否。
- 審査: 撮影時は`pending`で派生なし。撮影者本人は承認不可。owner/inventory_managerが別assetの派生SHA/key、GPS EXIF 0件、人承認を揃えた場合だけ`approved`。
- 表示: 一覧APIは`approved`だけを返し、原本storage keyを返さない。field_workerは`photo`または`putaway`の有効な担当枝内だけ取得可能。
- 実DB/API: 担当外撮影403、担当内撮影201、審査中一覧0件、別担当承認200、承認後一覧1件、原本SHA変更拒否を確認。
- 全体検証: 16 test files / 79 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。0001〜0010結合テストPASS。
- 費用: Windows PC内だけ、外部費用・外部CI・公開0件。
- 未完了: 画像本体の無料PC内非公開Storage、実ファイルのEXIF除去/書出し失敗停止、PWA撮影UI、住所期限、注文等の実API、実iPhone Safari。

## Iteration 16の実証範囲

- 無料Storage: Node.js標準機能だけで、明示されたPC内絶対パス配下へ原本/表示用を分離保存。外部Storage/APIなし。
- 原本不変: 受信bytesのSHA-256一致、排他的作成、同一bytes再送は再利用、同じkeyの異なるbytesは拒否。`..`等のパス越境も拒否。
- EXIF除去: JPEGのEXIF/XMP系APP1、APP13、commentを除去。PNGはeXIf/text/time metadata chunkを除去。表示用は別ファイルで原本を変更しない。
- fail-closed: 壊れたJPEG、未対応変換、書出し失敗は表示ファイル0件。途中ファイルを削除。
- 自動検証: 17 test files / 83 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 費用: ライブラリ追加0件、外部費用・外部CI・公開0件。
- 未完了: upload API/PWA撮影との接続、HEIC/WebPの無料安全変換、実iPhone写真fixture、住所期限、注文等の実API。
