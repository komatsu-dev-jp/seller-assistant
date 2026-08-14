# 評価Loop記録

## Loop 1 — 2026-08-15 基盤開始

- 基準値: 実装コード、package manifest、テスト、Gitリポジトリが存在しない。
- 最大の問題: 承認済み仕様を安全に実装・検証する共通基盤がない。
- 原因仮説: 企画・設計・承認工程を先に完了し、Goal開始まで実装を意図的に止めていたため。
- 変更範囲: private GitHub、専用worktree、npm monorepo、Web/API/domain/contracts、品質コマンド、CI準備。
- 実行した検証: GitHub認証、秘密形状scan、初回commit/push、依存版とNode互換性の公式npm確認。
- 結果と証拠: `komatsu-dev-jp/resale-ops-app` private作成、Goal開始、実装branch作成。依存導入後の `npm run check` が合格。
- 残る問題: domain実装、DB制約、P0導線、iOS、全AC/TA検証。
- 次の一手: 依存を固定し、lint/type/test/buildの基準を測定する。

## Loop 2 — 2026-08-15 在庫・安全境界の縦切り

- 基準値: 画面、domain、DB migrationがなく、在庫ACを実行できない。
- 最大の問題: 在庫番号、場所、二重読取、棚卸の二人確認、金額/監査境界がコード化されていない。
- 原因仮説: 共通基盤を先に確定する必要があったため。
- 変更範囲: inventory/finance/audit domain、PostgreSQL初期migration、W10在庫Web画面、ホーム導線。
- 実行した検証: `npm run check`、Playwright desktop、mobile 390×844、ホーム→格納作業遷移、ブラウザconsole。
- 結果と証拠: 5 test files / 15 tests合格、行96.66%・分岐80.68%、型/lint/build合格、`/inventory`生成、再読込後console error 0件。スクリーンショットは `output/playwright/`。
- 残る問題: SQLは静的契約検査のみで実PostgreSQL未検証。API永続化、撮影/採寸、注文/発送、会計CSV、iOS、権限E2Eが未実装。
- 次の一手: P0のAPI/業務状態遷移を実装し、iOS現場導線とサーバー契約を接続する。

## Iteration 3 — 2026-08-15 PWA・完全無料への変更

- ユーザー判断: Mac未保有のためネイティブiOSをやめ、iPhoneのホーム画面へ追加できるPWAへ変更。外部費用は絶対0円。
- 実装: manifest、Service Worker、オフライン画面、モバイル現場ホーム、商品→場所→人確認の格納導線、IndexedDB同期待ちschemaを追加。
- 安全境界: `/api/`をService Workerへ保存しない。端末同期待ちは在庫番号、場所コード、操作ID、日時だけ。住所、token、原価、証憑本文、税務情報を拒否する。
- 検証: PWA/0円契約を含む36テスト合格。静的検査のService Worker global設定を修正後、全品質ゲートを再実行する。
- 残る問題: ログアウト時のserver session失効接続、同期待ちのサーバー送信、P0全画面、実PostgreSQL/RLS E2E、iPhone Safari実機確認。
- 次の一手: 全品質ゲートとproduction PWAの実画面を検証し、P0 API/DB接続を続ける。

## Iteration 4 — 2026-08-15 P0一気通貫ワークスペース

- 基準値: PWAの格納導線は動くが、仕入から会計CSVまでを同じ試験SKUで確認できる画面とAPI全工程テストがなかった。
- 最大の問題: 画面デモ、domain状態遷移、APIの順序制約、DB契約が別々で、一気通貫の整合を証明できなかった。
- 実装: `/workflow`、8操作のP0 domain/API契約、冪等性、順序/人確認/証拠の拒否、PostgreSQL migration、架空データの会計CSVローカル出力を追加。
- 発見と修正: 写真カード内部の文字がチェック操作を遮る問題を、透明入力をカード全面へ広げて修正。取引貢献利益カードの未定義色を共通濃紺へ修正。
- 自動検証: `npm.cmd run check` と `git diff --check` が合格。11 test files / 47 tests、行91.36%、分岐81.31%、関数100%。型、lint、format、本番buildも合格。
- 実画面検証: Playwrightで仕入確認→写真4種→採寸4項目→説明候補→本人引渡し→注文→二重確認→梱包→発送→仕訳候補承認→CSV保存を完走。説明候補の採寸値4件一致、console error 0件、CSV内容一致。
- 画面証拠: `output/playwright/p0-workflow-purchase.png`、`p0-workflow-mobile.png`、`p0-workflow-accounting.png`、`p0-workflow-accounting-mobile.png`。CSV証拠は架空データの `test-journal-candidate.csv`。
- 残る問題: Web画面はまだAPI/DBへ接続していない。SQLは静的契約検査のみ。実PostgreSQL/RLS、認証/ログアウト、写真原本アップロード、PWA同期待ち送信、iPhone Safari実機は未確認。
- 次の一手: P0のサーバー正本接続、権限/監査/メディア契約を実装し、実DBがなくても安全境界を自動検査できる範囲を拡張する。

## Iteration 5 — 2026-08-15 写真原本・採寸証拠API

- 基準値: 写真4種と採寸4項目は画面状態だけで、サーバー契約とDB保存制約がなかった。
- 実装: 原本メタデータ登録、採寸試行登録、撮影採寸サマリーAPIを追加。写真ID、役割、SHA-256、workspace原本prefix、形式、容量、画素を固定し、採寸へ定義版、基準、状態、測定者、証拠写真、試行、確認者を保存する。
- 安全境界: 同じ写真IDの変更不可項目が変わる登録を409拒否。別SKUの写真を採寸証拠に使う操作を403拒否。2cm超の再測定差は値を消さず`requiresReview`へする。
- DB契約: `media_asset` と `measurement_attempt`、複合FK、原本prefix、変更不可hash、採寸範囲、人確認、workspace RLSをmigrationへ追加。
- 検証: 11 test files / 50 tests合格、行91.36%、分岐81.81%、関数100%。typecheck、lint、`git diff --check`合格。
- 残る問題: 実オブジェクトStorageと署名URLは未実装。実PostgreSQLがないためmigration実行、RLS越境、transactionは未確認。Web画面からAPIへの接続も未完了。
- 次の一手: 認証sessionとworkspace/role境界をAPI入口へ追加し、秘密情報をPWA storageへ置かないことをテストする。

## Iteration 6 — 2026-08-15 署名付きsession入口

- 基準値: APIテスト用actor headerと本番認証の境界が分離されておらず、そのままでは利用者IDを偽装できた。
- 実装: HMAC-SHA-256署名session、期限/未来時刻/改ざん/重複Cookie拒否、32バイト未満の秘密鍵拒否、HttpOnly・Secure・SameSite=Strict Cookieを追加。
- 本番fail-closed: `DATABASE_URL`と`SESSION_SECRET`を両方必須にし、未設定時はAPI起動停止。`buildApp`の既定認証は全拒否し、サーバーだけがCookie認証を明示注入する。
- 追加実装: server-only `auth_session` 台帳、logout失効、Cookie削除、PWA端末データ削除、同一URLのNext.js中継口を追加。API失効204を確認できない場合は端末データを消さない。
- 検証: 未署名actor headerは401、署名Cookieは201。失効後の同じCookieは401。12 test files / 57 tests合格、typecheck、lint、本番build、`git diff --check`合格。
- 実画面: PC/iPhone幅でログアウト表示、横overflow 0。API未接続は503で停止し、エラー表示する。
- 残る問題: ログイン発行、実PostgreSQL上のsession失効、CSRF総合確認は未実装。本番利用不可。
- 次の一手: ローカル専用の初期owner作成/ログイン手順とCSRF・role境界を実装する。

## Iteration 7 — 2026-08-15 変更操作の送信元制限

- 基準値: SameSite Cookieはあったが、APIが変更操作の送信元URLを独立確認していなかった。
- 実装: `APP_ORIGIN`の完全一致、http(s) originだけ、資格情報/パス付き設定拒否、`Sec-Fetch-Site`のcross-site拒否を追加。GET/HEAD/OPTIONS以外へ適用。
- Web中継: ブラウザURLと`APP_ORIGIN`を照合し、一致後だけCookieと固定Originを内部APIへ転送。API接続先/公開URLは環境変数以外から受け取らない。
- 検証: Origin欠落、攻撃者origin、似たドメインを403拒否。正確なoriginだけ201。13 test files / 60 tests合格、typecheck、lint合格。
- 残る問題: 実リバースプロキシ構成、ログイン発行、実DB membership/RLSは未確認。
- 次の一手: 初期ownerとログイン発行を実装し、role別の許可/拒否をsessionからDBまで通す。

## Iteration 8 — 2026-08-15 無料ログイン発行

- 基準値: 署名済みsessionの検証と失効はあったが、利用者がpasswordでsessionを発行する入口がなかった。
- 最大の問題: 外部認証SaaSなしで平文passwordを保存せず、総当たりを抑止する必要があった。
- 根拠: Node.js公式`crypto.scrypt`とOWASP Password Storage Cheat Sheetを確認し、scrypt N=2^17/r=8/p=1、16-byte random saltを採用した。
- 実装: `auth_credential`、HMAC化した`auth_login_bucket`、password hash/verify、共通401、5回/15分rate limit、8時間session発行、同一URLのWeb中継、`/login`を追加した。公開bootstrap APIは作らず、DB lock付きの対話型CLIで最初のownerを1人だけ作る。
- 安全境界: passwordをURL、localStorage、sessionStorage、IndexedDB、Service Worker cache、応答本文、ログへ保存しない。API/Origin未接続は503で停止する。
- 自動検証: `npm.cmd run check`と`git diff --check`が合格。15 test files / 69 tests、line 91.36%、branch 81.81%、function 100%。
- 実画面: PCと390×844で表示・入力・未接続エラーを確認。`role=alert`あり、横あふれなし。証拠は`output/playwright/login-desktop.png`、`login-mobile.png`、`login-mobile-api-error.png`。
- 残る問題: 実PostgreSQLがないためbootstrap/credential/session/rate-limitの結合動作は未確認。認証後の画面保護も未実装。
- 次の一手: 無料の実PostgreSQL検証方法を確保し、sessionからmembership/RLSまで結合確認する。

## Iteration 9 — 2026-08-15 実PostgreSQLと制限ロール

- 基準値: migrationは文字列検査だけで、管理者接続でもAPIが起動でき、実DBのRLS/session/loginは未確認だった。
- 最大の問題: PostgreSQL管理者と`BYPASSRLS`は強制RLSを迂回するため、誤った接続URLがworkspace越境を起こし得た。
- 実装: `resale_app_runtime`をNOLOGIN/NOSUPERUSER/NOBYPASSRLSで作り、必要操作だけをgrant。API起動時に管理者、BYPASSRLS、runtime未所属を拒否する。
- 実DB: PostgreSQL公式Windowsページから案内されたEDB 18.6 ZIPを一時領域へ取得。SHA-256 `FBE23DA234EE31547BF8A36D29DFD81E82B849DF2D2B78D2EECB43D360252F8C`。実行ファイルのWindows署名はなしのため、127.0.0.1限定・架空データ・検証後停止に限定した。
- 検証: 0001〜0006 migration実適用。管理者接続拒否、制限LOGIN許可、owner bootstrap、実login、SKU作成、別workspace 403、5回失敗429、logout後401が`postgres-integration: PASS`。
- 失敗と修正: 最初のZIP展開が5分上限で途中終了し、`postgres.bki`不足でinitdbが安全停止。公式ZIPを同じ一時領域へ再展開し、必要ファイル確認後に再実行した。
- 残る問題: 全RLS表/全roleの越境マトリクス、同時格納/引当、在庫不変条件の実DB検査、実HTTP経由のWebログイン。
- 次の一手: P0で重要な在庫二重読取、場所制約、同時操作、監査の実DB fixtureを追加する。

## Iteration 10 — 2026-08-15 在庫不変条件の実DB検証

- 基準値: 場所容量と注文引当の制約はSQLにあったが、商品/場所scanから在庫更新までを1 transactionに固定せず、通常API roleが在庫状態を直接更新できた。
- 実装: 在庫現物は`putaway_pending`・場所なしでだけ作成可能にし、label対象/版、scan session、現在地、移動番号、idempotency key、payload hashを検査してからsecurity-definer triggerで移動を確定する。通常API roleからInventoryUnit/ScanSession/Movement等の直接更新権限を削除した。
- 同時操作: 容量1の場所への2件同時格納、同一現物への2注文同時引当を実行し、どちらも成功1件・拒否1件。棚卸差異はinitial counterとreconfirmer、requesterとapproverを分離し、2人以上を必須にした。
- 失敗と修正1: scan作成時の`FOR UPDATE`が最小権限roleで拒否された。権限を追加せず、scan時は参照、movement確定時にsecurity-definer内で再検査・行lockする方式へ修正した。
- 失敗と修正2: PostgreSQLの`bigint`がtest runnerへ文字列で返り、値1の比較だけが失敗した。fixture queryでintegerへ明示変換し、業務データやDB定義は変更していない。
- 検証: PostgreSQL 18.6の新規使い捨てDBへ0001〜0007を適用。誤ラベル、scan再利用、在庫直接更新、同一人物再確認を拒否し、`postgres-integration: PASS`。全体は16 files / 72 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 残る問題: API契約としての在庫操作入口、全role/RLS表のマトリクス、オフライン再同期競合、実HTTP経由Webログイン、iPhone実機PWAは未完了。
- 次の一手: 在庫API契約とrepositoryを追加し、同じDB関数をPWAの二重読取画面から呼ぶ。

## Iteration 11 — 2026-08-15 PWA格納APIと圏外復旧

- 基準値: 在庫不変条件は実DBで通ったが、PWAは端末内保存だけで、認証sessionのworkspaceと格納APIへ接続していなかった。
- 実装: login時のactive workspace固定、session context、格納repository/API、同一URLのWeb中継、オンライン優先送信、IndexedDB outbox、online復帰/手動同期、保留件数表示を追加した。
- 安全境界: URL指定workspaceとsession workspaceが一致しない操作を403拒否。格納は人の最終確認後だけ。端末保存は在庫番号、場所コード、ラベル版、冪等キー、読取/確認日時だけ。競合や入力エラーを自動上書きしない。
- 発見と修正1: Service WorkerのAPI除外が旧`/api/`だけで、実際の同一URL中継`/v1/`を含んでいなかった。両方をcache対象外にし、契約テストを追加した。
- 発見と修正2: IndexedDB upgrade時の旧版番号をrequestから参照して型検査が停止した。upgrade eventの`oldVersion`へ修正し、旧schemaの保留データを安全に消去する挙動を維持した。
- 実HTTP/実画面: 架空SKUをオンラインで格納し「SERVER CONFIRMED」を確認。別の架空SKUをbrowser offlineで保留し、online復帰後の手動再送で残り0件を確認。各操作のmovement/auditが1件だけであることをDB照合した。
- 証拠: `output/playwright/pwa-putaway-server-confirmed.png`、`output/playwright/pwa-offline-resync-complete.png`。390×844、横あふれなし。
- 自動検証: `npm.cmd run check`合格。16 test files / 76 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。PostgreSQL 18.6の新規DBへ0001〜0008適用後、結合テストPASS。
- 費用: PC内のNode.js、Next.js、PostgreSQL、Playwrightだけを使用。外部費用、Apple Developer、外部CI、公開、デプロイ0件。
- 残る問題: 全表/全roleのRLSマトリクス、注文等の実API、写真原本Storage、実iPhone Safari確認は未完了。
- 次の一手: role/RLS越境マトリクスを実DBへ追加し、P0の残る確定操作を同じsession境界へ接続する。

## Iteration 12 — 2026-08-15 全業務テーブルRLSと外注role

- 基準値: 代表テーブルの別workspace拒否は通っていたが、workspaceを持つ全業務テーブルと外注roleの実credential経路を一括検証していなかった。
- 実装: PostgreSQL catalogから21業務テーブルを固定一覧で照合し、RLS、強制RLS、workspaceの`USING`/`WITH CHECK` policyを各テーブルで必須化する結合assertを追加した。runtime roleの破壊的な業務テーブルgrantも0件に固定した。
- role検証: 架空の`field_worker` credentialで実login/session contextを通し、在庫現場roleであること、SKU作成403、仕入確定409を確認した。
- 発見と修正1: 最初のgrant検査が、login成功後に失敗回数を消す認証専用テーブルのDELETEも誤検出した。21業務テーブルだけへ対象を限定し、認証の正常な後片付けは維持した。
- 発見と修正2: postgres.jsの空結果はArray派生型のため`deepStrictEqual([])`が失敗した。件数0の明示比較へ変更した。
- 検証: PostgreSQL 18.6の使い捨てDBへ0001〜0008を適用し、21テーブル、外注role、既存の二重読取/容量/同時引当/棚卸/logoutを含む結合テストPASS。
- 費用: Windows PC内だけ。有料API、有料SaaS、外部CI、公開、デプロイ0件。
- 残る問題: 場所枝/期限付き割当、住所期限、写真Storage、注文等の実API、実iPhone Safariは未完了。
- 次の一手: 外注の場所枝/作業期限をsessionとAPIへ加え、割当外の在庫・写真取得を拒否する。

## Iteration 13 — 2026-08-15 外注の場所枝・作業・期限付き割当

- 基準値: field_workerのrole制限は通ったが、在庫作業の担当場所と期限をDBで限定していなかった。
- 実装: `work_assignment`、workspace RLS、場所枝を親方向へ照合する`has_active_work_assignment`を追加。field_workerの格納APIだけは、対象場所を含む枝、`putaway`作業、開始済み、期限内、未取消をすべて必須化した。
- 最小権限: runtime roleは割当を参照できるだけで作成/変更できない。ラベルpayloadやURLだけでは割当を作らず、owner/inventory_managerの管理権限と分離した。
- 実DB: 担当なし403、BIN-Bだけの担当でBIN-Aは403、BIN-Bは201。同じ格納再送は同じ結果、異なるpayloadは409。22業務テーブルのRLS matrixも継続PASS。
- 自動検証: 16 test files / 77 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。0001〜0009を新規DBへ適用して結合テストPASS。
- 費用: Windows PC内だけ。有料API、有料SaaS、外部CI、公開、デプロイ0件。
- 残る問題: 割当解除後の端末cache消去、場所写真の承認/取得、住所期限、注文等の実API、実iPhone Safariは未完了。
- 次の一手: 場所写真を原本/審査/位置EXIF除去済み派生へ分け、担当枝内だけ取得できる契約を追加する。

## Iteration 14 — 2026-08-15 割当解除後の端末データ消去

- 基準値: サーバーは担当なし/担当外を403拒否できたが、圏外中に作った同期待ちが担当解除後も端末に残った。
- 実装: 同期時の401/403を権限失効として分類し、該当outboxレコードを削除して件数を表示。オンライン即時操作では端末保存せず停止する。409競合と5xx/通信不能は削除しない。
- 実画面: IndexedDBへ架空の最小schema 1件を保存し、session contextを403へ固定して同期。表示が「消去1件・同期0件・残り0件」となり、同期待ち0件を確認した。
- console: 想定したHTTP 403のresource error 1件だけ。React例外、未処理Promise、画面崩れ0件。
- 証拠: `output/playwright/pwa-assignment-revoked-cleared.png`。
- 検証: 16 test files / 77 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 費用: Windows PC内だけ。外部費用、有料API、外部CI、公開、デプロイ0件。
- 残る問題: 場所写真の承認/取得、住所期限、注文等の実API、実iPhone Safariは未完了。
- 次の一手: 場所写真の原本・審査・GPS除去済み派生・担当枝内取得を実装する。

## Iteration 15 — 2026-08-15 場所写真の原本・審査・担当枝内表示

- 基準値: 在庫画面に部屋/位置写真のモックはあったが、実API/DBでは原本不変、審査中非表示、別担当承認、GPS除去済み派生、担当枝を一つに結合していなかった。
- 実装: 場所写真の原本/派生metadata、撮影者/承認者、審査状態をlocation_photoへ追加。原本変更拒否trigger、workspace内key、原本/表示用prefix分離、承認時GPS 0件と撮影者≠承認者をDB制約化した。
- API: 担当枝の`photo`作業だけ撮影登録、owner/inventory_managerだけ承認、担当枝内だけ承認済み一覧取得。審査中/差戻しは一覧0件で、原本storage keyも応答しない。
- 実DB: field_workerの担当外BIN-A撮影403、担当内BIN-B撮影201、pending一覧0、owner承認200、approved一覧1、原本SHA update拒否。0001〜0010を新規DBへ適用して結合テストPASS。
- 自動検証: 16 test files / 79 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 費用: Windows PC内だけ。有料画像API、SaaS、外部CI、公開、デプロイ0件。
- 未完了: 画像本体の無料PC内非公開Storage、実ファイルの位置EXIF除去と失敗時書出し0件、PWA撮影UI、住所期限、注文等の実API、実iPhone Safari。
- 次の一手: PC内private mediaディレクトリへ原本を不変保存し、無料の画像処理で位置EXIFを除去した表示派生だけを作るadapterを実装する。

## Iteration 16 — 2026-08-15 無料PC内MediaStoreと位置metadata除去

- 基準値: DB/APIは原本/派生metadataを守れたが、画像bytesを保存・除去する処理はなかった。
- 実装: `LocalPrivateMediaStore`をNode.js標準機能だけで追加。絶対private root、workspace別key、原本SHA照合、排他的作成、fsync、同一再送、異bytes競合、path traversal拒否を実装した。
- 派生: JPEGはAPP1/APP13/comment、PNGはeXIf/text/time chunkを除去し、別の表示用keyへ排他的copyする。原本は読み取りだけ。
- fail-closed: 壊れたJPEGの除去を拒否し、表示先/一時ファイル0件。HEIC/WebPは推測変換せず未対応として停止する。
- 検証: 合成GPS metadata入りJPEGで原本SHA不変、表示側にGPS文字0件、表示hash一致、容量減少を確認。再送、異bytes、越境、壊れた入力も確認。17 files / 83 tests、format/lint/type/build合格。
- 費用: 新しい依存0件、Windows PC内のみ。有料画像API、SaaS、外部CI、公開、デプロイ0件。
- 未完了: upload API/PWA撮影との接続、HEIC/WebPの無料安全変換、実iPhone写真fixture、住所期限、注文等の実API。
- 次の一手: 認証済みbinary uploadをLocalPrivateMediaStoreへ接続し、保存成功後だけlocation_photo metadataを登録する一体処理を追加する。

## Iteration 17 — 2026-08-15 Web画面のサーバー側role保護

- 基準値: APIはsession/roleを検査していたが、Webの管理画面はURLを直接開くと固定の全在庫・利益・会計候補を表示できた。
- 実装: `requirePageSession`でHttpOnly CookieをサーバーからAPIへだけ転送し、応答schemaとrole allowlistを検査。管理3画面からfield_workerを除外し、現場ナビもrole別にした。
- fail-closed: API接続設定、session応答、roleのいずれも確認できない場合は管理画面を返さない。保護画面を`force-dynamic`にし、build時の固定HTML化を禁止した。
- 検証: 全体buildで対象5画面がdynamic。Cookieなしの`/inventory`は307で`/login`へ転送。秘密値のログ/ブラウザ保存0件。

## Iteration 18 — 2026-08-15 外注の商品別・期限付き撮影割当

- 基準値: field_workerは場所作業だけ期限付きだったため、workspace内の任意SKUへ写真・採寸・撮影完了操作を送れた。
- 実装: RLS付き`sku_work_assignment`と`has_active_sku_work_assignment`を追加。SKU、作業、開始、期限、取消をDBで照合し、写真/採寸/サマリー/workflowへ共通適用した。
- 実DB: 未割当3操作は403。割当後の写真201、採寸201、撮影完了200。23業務テーブルのRLS/強制RLS/workspace policyと破壊的grant 0件を継続確認。
- 発見と修正: 使い捨て試験用LOGIN roleを誤ってNOINHERITで作り、capability roleの権限を使えずログイン500になった。実運用契約どおりINHERITの制限LOGINへ直し、全結合を再実行した。

## Iteration 19 — 2026-08-15 場所写真の実bytes upload・除去・認証付き取得

- 基準値: DB/APIは写真metadataを守ったが、SHA、保存key、GPS 0件をクライアントが自己申告でき、実MediaStoreはAPI未接続だった。
- 実装: JPEG/PNG binary parserと画像magic/dimension検査を追加。APIがSHA/key/容量/形式を決定して原本保存後だけDB登録する。担当外は保存処理より前に拒否する。
- 承認: repositoryでpending・管理role・撮影者との分離を先に確認し、MediaStoreが位置metadataを除去した後だけDBをapprovedへ更新。DB失敗時は同一hashの表示用だけを補償削除する。
- 取得: approvedかつ現在のrole/担当枝を再検査するcontent APIだけが表示bytesを返す。`private, no-store`、storage key非公開。pending/担当外は0件。
- 競合修正: 既存表示keyへの同一bytes再送は再利用し、異bytesなら既存を削除せず停止するよう排他処理を修正した。
- 検証: 合成GPS入りJPEGを実API→実ファイル→実PostgreSQLへ通し、外注担当外403、pending非表示、別担当承認、応答GPS文字0件、storage key 0件を確認。17 files / 86 testsと全check合格。
- 費用: Node.js標準機能、ローカルPostgreSQL、PC内ファイルだけ。外部費用・外部CI・公開0件。
- 残る問題: 注文/住所lease/返品隔離/会計exportの実API、P0画面のDB接続、PWA場所写真UI、実iPhone Safari。
- 次の一手: sales_order、scan/movement、financial_event、accounting_exportを同じSKU/注文IDでAPIへ接続する。

## Iteration 20 — 2026-08-15 P0実保存・注文配送会計・在庫写真PWA

- 基準値: workflow画面はReact内の固定状態、CSVは固定文字列、ホーム/在庫は架空表示で、注文・住所期限・返品・会計履歴の実APIがなかった。
- 実装: 0012〜0014、注文/住所暗号化/返品/会計repository、仕入証憑/P0商品/場所repository、実画像upload、場所写真確認一覧、実データホーム、在庫画面、PWA二重読取catalogを追加した。
- 役割: 管理画面はowner/inventory_managerだけ。field_workerは期限内の場所枝/SKU/作業だけ。撮影者と写真承認者を分離し、監査へreason/approverを保存する。
- 発見と修正1: 場所read modelの複合主キーGROUP BY不足を新規DBテストで検出し修正した。
- 発見と修正2: 商品写真upload応答に非公開storage keyが残り、strict schemaが停止した。公開応答を明示allowlistで再構築し、keyを返さないよう修正した。
- 発見と修正3: Next.js内部URLによる同一生成元判定が本番サーバーで誤判定した。変更要求はブラウザOrigin完全一致、読取はforwarded host/protocol照合へ変更し、欠落/cross-site否定テストを追加した。
- 発見と修正4: 390×844でPC用横ナビの在庫リンクが見えなかった。ホーム/P0/在庫/現場/ログアウトの固定下部ナビへ変更した。
- 実画面: 架空データでログイン、場所登録、場所写真原本upload、自己承認拒否、仕入登録、在庫番号発行、DB実数ホームを確認。証拠は`output/playwright/p0-final/.playwright-cli/page-2026-08-14T23-12-40-157Z.png`。
- 自動検証: `npm.cmd run check`合格、19 files / 96 tests。新規使い捨てPostgreSQLへ0001〜0014を適用し、32テーブルRLSと仕入〜返品/会計の結合テストPASS。
- 費用: 外部API、有料SaaS、外部CI、デプロイ、Apple Developer契約0件。PC内だけ。
- 残る問題: 実iPhone Safariはユーザー端末で未確認。P1、HEIC/WebP、Notion限定ミラー本実装はP0後。
- 次の一手: 最終全check、独立実装レビュー、必要修正、Draft PRを行う。本番公開とPRマージは行わない。
