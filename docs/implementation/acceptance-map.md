# 受け入れ条件・実装対応表

- 状態: 承認済みUI追補を統合し、P11バーコード実装中。旧P05 100/100は履歴として保持し、新差分後に再評価する
- 更新日: 2026-08-27（JST）
- 正本: `docs/specs/mvp-product-spec-v1.md`、`docs/specs/technical-architecture-v1.md`、`docs/specs/approved-ui-integration-addendum-v1.md`

## P0ゲート

P0の必須ACは AC-001、003〜008、013〜014、018〜023、025〜026、028〜034、039、042〜068。各行へ実装、テスト、実画面証拠を追加し、すべて合格するまでP1へ進まない。2026-08-27以前のP05/P06証拠は承認済みUI追補前の履歴であり、新しいP0の最終合格証拠にはしない。

| 範囲        | 実装先                                                     | 自動検証                      | 手動・画面証拠       | 状態                                                     |
| ----------- | ---------------------------------------------------------- | ----------------------------- | -------------------- | -------------------------------------------------------- |
| AC-001〜009 | domain/contracts、API、Web/PWA                             | unit/API                      | P0仕入・撮影・採寸   | P0対象合格、P1 AIは無効                                  |
| AC-010〜017 | media/listing/price adapters                               | unit/contract                 | 原本比較・本人引渡し | AC-013/014合格、P1は無効                                 |
| AC-018〜020 | inventory/order/shipping                                   | concurrency/API               | 二重読取・発送・返品 | 合格                                                     |
| AC-021〜024 | finance/accounting/Notion                                  | fixture/schema                | 収益・CSV・同期確認  | AC-021〜023合格、P1は無効                                |
| AC-025〜028 | UI/監査/品質                                               | a11y/security/all suites      | PC/PWA実画面         | P05独立100/100、Critical/High/Medium 0                   |
| AC-029〜041 | 財務・冪等・機密・CSV・旧資産                              | fixture/contract/security     | 出力内容確認         | P0対象合格、P1は無効                                     |
| AC-042〜055 | inventory/location/count                                   | DB/domain/concurrency         | M12/W10導線          | 合格                                                     |
| AC-056〜057 | solo/team discrepancy                                      | DB/domain/API/concurrency     | M13/W11導線          | 実装・DB・solo/dual・P05安全確認合格                     |
| AC-058〜060 | accounting/formulas/export                                 | fixture/contract/API          | M14/W12導線          | 実装・DB・会計7/7 UI/CSV・P05確認合格、実MF import未確認 |
| AC-061      | pilot/irreversible guards                                  | E2E/DB/API/UI                 | 10商品実測           | 計測基盤合格、10商品実測待ち                             |
| AC-062      | 承認済みモバイル/PCの用語・導線                            | route/UI contract             | 49/52画面対応表      | 追補統合済み、実画面再評価待ち                           |
| AC-063〜064 | 商品別Code 128/A4印刷/スマホ商品検索                       | Web unit/contract             | PC印刷/iPhone幅      | P11実装中                                                |
| AC-065      | 気になる箇所・全写真                                       | contracts/API/DB/Web          | 検品・写真導線       | P12 Sol設計待ち                                          |
| AC-066      | 選択式の発送前写真                                         | contracts/API/DB/Storage/Web  | 注文・発送導線       | P13 Sol設計待ち                                          |
| AC-067〜068 | 本人操作の調査/任意取引ID                                  | contract/Web/network          | PC/スマホ導線        | P14待ち                                                  |
| P0必須TA    | 001〜004、007〜009、011〜017、019〜023、025〜027、029〜048 | type/lint/test/build/contract | platform checklist   | TA-044〜048追加分の実装・再検証待ち                      |
| P1固有TA    | 005〜006、010、018、024、028                               | flag-off/禁止経路             | P1画面を公開しない   | P0では実装完了を要求しない                               |
| TA-038〜043 | revised A architecture                                     | DB/domain/API/a11y/fixture    | M13/W11/M14/W12      | 実装・DB・P05独立100/100合格                             |
| TA-044〜045 | local Code 128/印刷/読取UI                                 | Web unit/contract/network     | PC03 v4              | P11実装中                                                |
| TA-046〜048 | 写真・発送・本人操作追補                                   | DB/API/Storage/Web            | 承認済み最新画面     | P12〜P14待ち                                             |

## 合格条件

- 必須テスト100%合格。
- domain/security line coverage 80%以上、branch 75%以上。
- `docs/specs/ui-evaluation-rubric-v1.md`のUI評価90点以上かつ重大項目0点なし。
- Critical/High 0件。
- 独立レビュー後に影響範囲を再検証。

## 修正版Aの再開gate

- Core回帰: P0必須AC `001、003〜008、013〜014、018〜023、025〜026、028〜034、039、042〜055` とP0必須TA `001〜004、007〜009、011〜017、019〜023、025〜027、029〜037` の既存証拠を現行branchで再実行し、修正版migrationによる退行0件を確認する。P1固有条件はflag OFFと禁止経路を確認する。
- 差異: AC-056/057、TA-038、TA-042を実装し、1人可逆、2人別担当、復元、引当停止、offline停止、不可逆経路0件を確認する。
- 会計: AC-058〜060、TA-039〜041/043を実装し、未設定block、承認済みmapping、Money Forward 27列、汎用19列、schema/fixture hash、財務fixture、`?`のaccessibilityを確認する。
- Pilot: AC-061の新規runは`docs/specs/pilot-protocol-v1.1.md`の固定manifest、対象、環境、開始/終了、中断、wall-clock規則で10点を測り、中央値、欠損、差戻し、manual correction、誤格納を記録する。v1.0は履歴だけに使い、実機がない項目は未確認として分離する。
- 上記が全合格するまで、P1機能flag、Draft PRのready化、本番/mergeへ進まない。

## 2026-08-24 v1.1現行状態

- fixture kitは`listing_prep_pilot_v1.1.0`、migration `0033`、manifest SHA `a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`へ固定し、`WARMUP-01`＋10商品×4 PNGの生成・整合確認を実装した。
- UI評価seedは4つの独立workspaceを作成し、同じDB/media rootへの再実行を空状態ゲートで安全に拒否する。captureではTOP/OUTER 4項目、PANTS 5項目、KNIT `unstretched` 4項目、候補自動確定なしの文言、390/768/1440のoverflow 0、console error/warn 0を確認した。
- solo/dual棚卸は写真、二重読取、3秒keyboard確認、欠損候補DB停止、同一場所復元、不可変理由、最終承認まで確認した。dualのAPI hard blockは元担当者を409で拒否し、最終P05の画面は元担当者の確認formを非表示、承認buttonをdisabled、日本語handoff表示として409送信を防いだ。別manager経路は`approved dual_actor`まで完走した。会計seeded UIは7/7 human mappingとCSV出力確認まで完了した。
- CSS/JSX修正後は390pxでheader back 44x44、save 327x48、measurement input 303x44、bottom nav各122x49、overflow 0を確認し、200%相当の390×720でもoverflow 0、主要button 44px以上、console 0/warn 0、request loopbackのみを確認した。
- 最新のfull `npm.cmd run check`はfixture 44 PNG/hash一致、format、lint、typecheck、29 files / 202 tests、coverage（statements 84.66%、branches 80.56%、functions 100%、lines 90.68%）、API/Web production buildまでPASSした。fresh/upgrade PostgreSQLもmigration `0033`までPASSした。
- target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`のP05独立Terra最終評価は100/100（Critical/High/Medium 0）。`c63eb5b`の96/100は履歴であり、現行結果は14 PNGの最終報告を正本とする。
- Web broad bind incident後、`apps/web/package.json`のdev/startと契約testへ`127.0.0.1`固定を追加した。修正版runtime netstatは`127.0.0.1:4173`だけ、targeted 24 testsとWeb buildはPASS。外部request、課金、merge、公開は0件。
- 実利用者の`WARMUP-01`＋固定10商品pilot、実iPhone Safari、最終独立Solレビューは未実施。Draft PR、merge、本番公開も未実行。

## 2026-08-24 v1.1最終証拠追補

- 会計seeded UIは正常経路を7/7件で人がmapping確認した。Money Forward 27列・5行CSVはローカルdownload済みで、1649 bytes、SHA-256 `e833a060cc7fef30fa90140fd4330e5523579d34e871d2fc061aeed349dc1e01`。未設定税項目はUI/APIともblockし、mapping差し替え前の旧CSVは不変。実際のMoney Forward取込は未実施。
- 会計responsiveは1440/768/390/720（200%相当）でoverflow 0、主要button 44px以上、console error/warn 0、通信はloopbackのみ。
- solo棚卸は架空800×800・12KB写真、二重読取、3秒keyboard確認、候補欠損時のDB停止、同一場所復元を確認した。UI/API修正後の不可変な理由は`not_seen_during_count`と`found_in_place`を区別し、最終承認までPASS。dualはAPIで元担当者を409拒否しつつ、最終画面では元担当者の確認・承認操作を事前に無効化した。別managerの写真・二重読取・3秒確認・承認を経て`approved dual_actor`となった。
- capture TOPSは4写真・4採寸、OCR候補の自動確定なし、候補不一致を拒否。matching UIの`TEST BRAND`候補を人が`human_confirmed`し、brand/size/colorとbrand-tag根拠を保存した。出品文は未確認のまま出さず、人のcopy確認を要求した。全requestは`127.0.0.1`の2xx/201、console 0。
- workflow 390pxのresponsive不具合を修正し、summary childrenは334/111/111/111px、selectとnext linkは44px、overflow 0、表示文言は「格納待ち」とした。
- 最新full `npm.cmd run check`はPASS。fixture 44 PNG/hash `a44d25d...`、29 files / 202 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、lint/typecheck/API/Web buildを確認した。fresh PGは0033まで、49-table RLS等とimmutable reason fieldsを含む結合確認がPASS。upgrade integrationも0001〜0033 rollback/preservationがPASSした。使い捨てDBは削除済み。
- runtimeはloopbackのみ。外部通信、課金、deploy、mergeは0件。
- 未確認: 人の`WARMUP-01`＋固定10商品pilot、実iPhone、実際のMoney Forward取込、P08最終独立Sol review、Draft PR ready。P05はPASSだがGoalは完了扱いにしない。

## 2026-08-25 P06R安全preflight現行証拠

- 対象SHA: `a976d614819a662cca3be36c23989aecd9ca968e`。root `npm.cmd run check`はfixture 44/hash、format/lint/typecheck、31 files / 209 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、API/Web buildまでPASSした。
- 同SHAのfresh PostgreSQL 33 migrations、restricted LOGIN、49-table RLS、rerun tests、upgrade 0001〜0033 rollback/preservationはPASS。合成preflightのterminal failed案内/WARMUP、active run `917e2178-1c1c-4717-999b-0613f8b534a9`、一意readonly SKU/receipt、old summary 0、capture/listing disabled、未登録表示を確認した。
- category `tops` mismatch初回409を修正後、同run TOP-01は201（`INV-910006-4`）。console error/warn 0、全18 requestsはloopbackのみ、390/768/1440 overflow 0。証拠PNGは`output/playwright/p06r-preflight/final-a976-active-390x844.png`、`final-a976-active-768x1024.png`、`final-a976-active-1440x1000.png`。
- 独立Terra最終GOはa976限定、Critical/High/Medium/Low 0、H-P06R-02 preflight Closed。合成preflightは人P06の代替ではなく、人P06・実iPhoneは未確認。P08 Sol、Draft PRも未実施。

> 以下のIteration 4〜24は各時点の履歴であり、現行P0の最終合格証拠ではない。現行判定は本節と、同一実装commitのUI/pilot証拠を使用する。

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

## Iteration 17の実証範囲

- 画面保護: ホーム、全在庫、P0商品作業はサーバー側sessionでowner/inventory_managerだけを許可。未ログインは本文を返さず`/login`へ307転送。
- 現場画面: field_workerは`/mobile`と`/mobile/scan`だけを利用でき、全在庫・収支・会計へのリンクも表示しない。URL直打ちは`/forbidden`で停止。
- 本番build: 保護5画面は静的HTMLへ埋め込まず、アクセスごとに動的なsession/role判定を行う。
- 検証: Web契約テスト、型検査、本番build、Cookieなしの`/inventory`要求が`307 /login`を確認。

## Iteration 18の実証範囲

- SKU割当: `sku_work_assignment`へ外注担当、SKU、`capture`作業、開始、期限、取消を分離保存。workspace所属だけでは商品へ触れない。
- API: field_workerの写真登録、採寸、撮影サマリー、`confirm_capture`へ同じ共通割当検査を適用。
- 実DB: 未割当の写真・採寸・撮影完了をすべて403、期限内割当後だけ201/200。23業務テーブルのRLS matrixを継続PASS。

## Iteration 19の実証範囲

- Binary upload: 場所写真はJPEG/PNG本体だけを受け、APIがmagic bytes、25MB、各辺12,000px、SHA-256、保存keyを決定。端末自己申告のSHA/key/GPS件数を廃止。
- 非公開処理: 担当範囲を保存前に検査し、原本をPC内private rootへ不変保存。撮影者と別の管理者が承認した時だけ位置metadataを除去した表示用を生成。
- 取得: pending/担当外を拒否し、approvedだけ認証付きcontent APIから`private, no-store`で返す。原本/派生storage keyは公開応答0件。
- fail-closed: 壊れた画像、未対応形式、異bytes再送、派生競合、DB承認失敗は公開を停止。補償削除は同じhashの表示ファイルだけを対象にする。
- 検証: 17 files / 86 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。0001〜0011の新規DBと実ファイル結合テストPASS。
- 費用: 新しい外部依存0件、PC内のみ。有料API/SaaS、外部CI、公開0件。
- 未完了: PWA場所写真撮影UI、HEIC/WebP、住所期限、注文/返品/会計の実API、実iPhone Safari。

## Iteration 20の実証範囲

- P0実保存: 仕入証憑、SKU、在庫番号、場所、商品写真4種、採寸4項目、出品用候補、人の公式画面引継ぎ、注文、5分住所lease、商品＋場所のピッキング、梱包、発送、収支、会計CSV履歴、返品隔離/再入庫を同一IDでDB追跡。
- 在庫UI: 部屋/棚/位置の階層、場所ラベル、容量/混載設定、実在庫一覧、部屋全景/棚/正確な位置写真をWeb/PWAから登録。原本は非公開、管理者の確認待ち一覧を追加し、撮影者本人の承認を拒否。
- 安全な写真/住所: 画像bytesからAPIがSHA-256・形式・寸法を算出し、表示用位置metadata 0件。住所はAES-256-GCM暗号化、表示権限は最大5分、応答/監査へ平文を残さない。
- 実画面: 架空ownerで実HTTPログイン、場所`ROOM-A`、写真確認待ち、自己承認拒否、仕入商品、`INV-000001`発行を確認。390×844でDB実数ホームと固定下部ナビを確認。
- Web防御: 変更要求はブラウザ`Origin`と`APP_ORIGIN`の完全一致を必須化。欠落/cross-siteを拒否し、読取要求はforwarded host/protocolを検査。
- 検証: 19 files / 96 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。0001〜0014、32業務テーブルRLSの新規使い捨てPostgreSQL結合テストPASS。
- 費用: Node.js、Next.js、PostgreSQL、PC内ファイル、ローカルPlaywrightだけ。外部API/SaaS/CI/デプロイ/Apple契約0件。
- 未確認: 実iPhone Safariでのホーム画面追加、カメラ撮影、圏外復帰。HEIC/WebP。P1は未着手。

## Iteration 21の実証範囲

- AC-004/005、TA-003/004: metadataだけの旧写真登録routeを削除。画像bytesのサーバー検査、非公開保存、位置metadata除去、別担当承認、表示時SHA再照合を自動テスト。DB登録失敗時の孤児原本0件も確認。
- AC-013: 同じSKUの写真4種、最新採寸4項目、撮影確認、出品候補と根拠をDB read modelから再構築し、ブラウザ再読込後も採寸入り文章を表示。
- AC-019/048、TA-002: 配送担当は管理者が割り当てた有効期限内の注文だけを取得し、住所lease、pick、pack、shipの全操作で再照合。利益、原価、税務候補は配送画面へ0件。
- AC-023/029、TA-011/012/022: 注文・発送とP0進捗、会計CSV履歴とP0進捗を同一transactionで更新。直接workflow完了を拒否し、再読込後もCSVのhash、ファイル名、作成者、時刻を復元。
- AC-053: 在庫番号と場所コードをchecked codeへ変更し、1文字変更、古い版、異なるcatalogをWeb/API/DBで拒否。
- TA-019/020: 新規DBの33業務テーブルすべてでRLS/force RLS/workspace policyを検査。制限runtime roleの破壊的grant 0件、監査payloadの秘密値0件。
- 品質ゲート: 20 files / 101 tests、line 91.36%、branch 81.81%、functions 100%。format、lint、typecheck、本番build合格。PostgreSQL 0001〜0015、33-table RLS、P0実結合PASS。
- 実画面: `output/playwright/iteration-21-login.png`、`iteration-21-workflow-reloaded.png`、`iteration-21-mobile-390x844.png`、`iteration-21-shipping-role.png`。外部downloadなし、PC内Chromeだけ。
- 外部境界: runtimeは同一生成元`/v1`とPC内DB/ファイルだけ。Mercari/Notion/Slack/OpenAI/Photoroom等への送信route 0件。有料サービス0件。
- 手動未確認: 実iPhone Safari、ホーム画面追加、カメラ、圏外復帰。これはDraft PRへ未確認事項として残し、成功扱いにしない。

## Iteration 22の実証範囲

- 外注運用: オーナーがPC内アカウントを作り、撮影・InventoryUnit・場所・場所写真・配送を対象IDと24時間以内の期限で割当/解除できる。解除後は対象APIを403拒否する。
- 撮影PWA: field_workerは割当SKUだけを取得し、写真4種、採寸、理由付き再測定、端末内で得たタグ文字候補を途中保存/再送できる。原価、利益、購入者、税務資料は応答と画面へ0件。
- 人による商品調査: OCR文字は候補に限定し、管理者が採用/修正/不明を確定する。販売済み比較は利用者が公式画面で確認したHTTPS URL・表示価格・状態・送料・採否理由だけを保存し、3件未満は根拠不足とする。外部巡回/自動取得は0件。
- 棚卸・ラベル: 在庫画面から棚卸開始、観測、別担当の再確認、差異解決/承認、ラベル再発行を実APIで操作し、前後値・理由・承認者を監査する。
- 移行: 既存の`INV-000001`をデータ付きDBで`INV-000001-7`へ更新し、ラベルguardを安全に一時停止して同じtransaction内で再有効化することを確認した。
- 自動検証: `npm.cmd run check`合格。20 files / 108 tests、statements 84.09%、branch 81.81%、functions 100%、lines 91.36%。format、lint、typecheck、本番build合格。
- 実DB: 新規DBへ0001〜0017を適用し、36業務テーブルRLS、全外注割当、仕入〜会計、5分住所、checked code、撮影/調査/出品根拠、場所写真、二重読取、返品隔離、棚卸、ラベル再発行、logoutを含む結合テストPASS。
- 実画面: 在庫・棚卸、外注割当、390×844の撮影PWA、PC商品調査をChromeで確認。横あふれ0、console error 0、外部リンク0。通信要求は同一生成元`/v1`だけ。
- 証拠: `output/playwright/iteration-22-inventory-stocktake.png`、`iteration-22-team-assignments.png`、`iteration-22-mobile-capture-390x844.png`、`iteration-22-product-research.png`。
- 未確認: 実iPhone Safariのホーム画面追加、カメラ、圏外復帰、HEIC/WebP。P1、push、Draft PR、公開、Notion/Slack追加送信は未実行。

## Iteration 24の実証範囲

- 棚卸時点固定: 棚卸開始時の対象現物、場所、在庫番号、ラベル、状態、移動番号を`count_session_inventory_snapshot`へ保存。開始後に別商品が入っても対象へ加えず、開始時にあった未読取品だけを差異候補にする。
- 撮影途中保存: 4枚すべてを通信前にIndexedDB（ブラウザ内の端末保存領域）へ保存する。同一写真判定は名前・容量・更新日時ではなく、実bytesのSHA-256で行う。取得した最新割当一覧にないSKUまたは403の割当解除、ログアウト時は撮影保留を消去し、401のログイン期限切れだけでは消去しない。
- 格納途中保存: 401はログイン期限切れとして端末に保持し、403の担当解除だけを消去する。409の状態競合と通信不能も自動上書き・自動削除しない。
- 監査: 原本写真登録に安全なbefore/afterを保存。古いラベル版の格納を409拒否した事実も、現在版・入力版・対象場所・理由を別transactionで監査する。
- UI: PCの外注担当、場所登録、場所写真、現物在庫、棚卸フォームを専用gridへ分離。1440×1000の実ブラウザで入力欄、選択欄、ファイルボタン、解除ボタン、一覧の切断0件を原寸確認した。
- 自動検証: `npm.cmd run check`合格。20 files / 112 tests、statements 84.09%、branch 81.81%、functions 100%、lines 91.36%。format、lint、typecheck、本番build合格。
- 実DB: 新規DBへ0001〜0018を適用し、37業務テーブルRLS、棚卸snapshot、開始後移動の非混入、古いラベル拒否監査、主要P0一気通貫を含む結合テストPASS。
- 実画面: `output/playwright/iteration-24-team-assignments.png`、`iteration-24-inventory-stocktake.png`。console error 0件。PC内`127.0.0.1`以外への通信0件。
- 未確認: 実iPhone Safari、ホーム画面追加、実カメラ、圏外復帰、HEIC/WebP。外部push、Draft PR、公開、Slack/Notion追加送信は未実行。
