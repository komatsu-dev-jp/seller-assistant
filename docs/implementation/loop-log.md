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

## Iteration 21 — 2026-08-15 独立レビュー指摘の解消と外部接続監査

- 基準値: 独立レビューはCritical 0 / High 4 / Medium 3。写真metadataだけで撮影完了を作れる旧入口、配送担当が任意注文へ住所表示権限を作れる問題、再読込後に採寸・出品根拠を復元できない問題、在庫/場所コードのcheck digit未実装がHighだった。
- 写真: 旧metadata登録APIを削除し、画像本体の受信、API側hash・形式・寸法検査、PC内private保存、位置metadata除去、人の承認を唯一の経路にした。表示時もDBのSHA-256と実bytesを再照合し、DB登録失敗時は新規原本を補償削除する。
- 配送: `order_assignment`を追加し、管理者が担当者と期限を割り当てる。配送担当は自分の有効な注文だけを表示し、住所表示、ピッキング、梱包、発送も同じ割当を必須にした。住所表示期限は最大5分。
- 再読込: 商品写真4種、最新採寸4項目、撮影確認、出品候補、確認根拠、最新会計CSV履歴をP0 read modelへ含め、再読込後も同一SKUから文章候補と進捗を復元する。古い・不足・別SKUの根拠は確定できない。
- コード: 在庫番号と場所コードへcheck digit（入力誤りを検出する末尾の検査数字）を追加し、Web、PWA、API、DBの全層で検証する。既存コードはmigrationで新形式へ移行する。
- 原子的な進捗: 注文確認、ピッキング、梱包、発送、会計CSV承認は、注文処理とP0進捗を同じDB transactionで更新する。汎用workflow APIから直接完了状態を作る経路は拒否する。
- 外部接続監査: runtimeコードにMercari、Notion、Slack、OpenAI、Photoroom等のSDK/URL/routeはない。ブラウザは同一生成元の`/v1`だけを呼び、APIはPC内PostgreSQLとprivate media directoryだけを使用する。`.env.example`の外部credentialは空。外部送信、課金、deploy、CI、追加downloadは0件。
- 自動検証: 最終`npm.cmd run check`合格。20 files / 101 tests、line 91.36%、branch 81.81%、functions 100%。新規使い捨てPostgreSQLへ0001〜0015を適用し、33業務テーブルRLS、配送割当、5分住所、checked code、撮影/出品根拠再読込、注文〜会計の原子的進捗を含む結合テストPASS。
- 実画面: インストール済みChromeをローカルだけで使用し、owner login 204、P0再読込、390×844、配送担当画面、収支情報非表示を確認。証拠は`output/playwright/iteration-21-*.png`。Playwright wrapperは外部registry取得を要求したため使用せず、権限昇格もdownloadもしていない。
- 未確認: 実iPhone Safariのホーム画面追加、カメラ、圏外復帰はユーザー端末での手動確認が必要。外部へのpush、Slack、Notion、Draft PRはユーザーのAPI確認中につき停止。

## Iteration 22 — 2026-08-16 外注・撮影調査・棚卸のP0完成

- 基準値: 独立レビューで、既存データ入りmigration、配送解除、InventoryUnit単位の格納割当、確認後の撮影変更、アプリ内の外注作成/割当、撮影の再送/再測定/商品候補、棚卸/ラベル再発行、監査の前後値にHigh相当の不足があった。
- 実装: migration 0015〜0017、team/stocktake/capture/research API、外注・棚卸PC画面、撮影PWA、安定した写真outbox、旧outboxの再読取待ち移行、厳密な対象/期限/役割検査を追加した。
- 承認版固定: `confirm_listing`後は写真・採寸の追記を409拒否する。文章候補は確認済み写真/採寸revisionだけから再構築し、確認後の内容差替えを承認済み表示にしない。
- 監査: 主要変更は主体、日時、対象、before、after、理由、承認者をallowlist payloadへ保存する。住所、token、証憑本文、AI/OCR全文は監査へ保存しない。
- 実画面: 架空のfield_workerでログインし、割当SKU 1件だけを390×844で表示。原価/利益/購入者/税務資料0件、横あふれ0、console error 0。同じブラウザでオーナーの商品調査、在庫棚卸、外注割当も確認した。
- 外部境界: ブラウザ通信は`127.0.0.1`の同一生成元`/v1`だけ。Mercari/Notion/Slack/OpenAI/Photoroom等のruntime URL、SDK、route、外部リンクは0件。
- 検証失敗と修正: 既存の使い捨てDBを再利用した初回結合テストは「初期ownerが存在する」で安全停止した。データを削除せず新しいDBを作り、専用の制限LOGIN roleで全migrationと結合テストを再実行してPASSした。
- 検証: `npm.cmd run check`は20 files / 108 tests、statements 84.09%、branch 81.81%、functions 100%、lines 91.36%、本番buildまでPASS。PostgreSQLは0001〜0017、36-table RLS、代表一気通貫をPASS。
- 証拠: `output/playwright/iteration-22-*.png`、`docs/implementation/p0-e2e-evidence.md`、本Loop。
- 残る問題: 実iPhone Safari、ホーム画面追加、実カメラ、圏外復帰、HEIC/WebPは未確認。P1、外部push、Draft PR、公開は未実行。
- 次の一手: 差分をlocal commitへ固定し、別担当の読み取り専用レビューでCritical/High 0を確認する。

## Iteration 24 — 2026-08-16 最終独立レビューHigh 7件の解消

- 基準値: 独立レビューはCritical 0 / High 7 / Medium 4 / Low 1。棚卸対象を開始後に再検索、撮影4枚の全件事前保存なし、割当解除後の撮影cache残存、401で格納outbox消去、古いラベル拒否監査なし、写真原本監査のbefore/after不足、PCフォーム崩れがHighだった。
- 棚卸: 0018で開始時snapshotを新設し、観測と差異作成はsnapshotだけを参照。開始後に別商品を対象場所へ移動する実DB試験で、その商品が差異候補へ入らないことを確認した。
- 端末保存: 撮影は全ファイルをSHA-256付きで先に保存してから送信。最新割当一覧にないSKUと403のcapture権限失効だけ撮影cacheを消去し、401では保持する。格納も401を再ログイン待ち、403を担当解除として分離し、401時に端末レコードを保持する純粋関数testを追加した。
- logout: Service Workerが未制御でも、`resale-ops-`で始まるCache Storageをページ自身が削除する。IndexedDBと撮影DBも従来どおり削除する。
- 監査: `media.original.registered`へ安全なbefore/afterを追加。古い在庫/場所ラベルの入力は、業務transactionをrollbackした後に専用監査を保存し、409で再読取を要求する。
- UI: 4列採寸gridの誤流用をやめ、外注、場所、写真、棚卸に専用responsive gridを追加。一覧行の列幅、場所ツリー、解除ボタンも補正し、1440×1000の原寸画像で確認した。
- 失敗と修正: 初回DB試験は、snapshot後の移動を1点専用棚へ入れようとしてDBが正しく拒否した。容量競合試験は別の専用棚に保持したまま、snapshot試験棚を同一SKU2点までに変更し、新しい空DBで全試験を再実行した。
- 検証: `npm.cmd run check`は20 files / 112 tests、statements 84.09%、branch 81.81%、functions 100%、lines 91.36%、本番buildまでPASS。PostgreSQL 0001〜0018、37-table RLS、P0結合PASS。
- 外部境界: 検証先はPC内Web/API/PostgreSQLだけ。外部API、SaaS、CI、deploy、Slack、Notion、GitHub pushは0件。
- 次の一手: local commitへ固定し、別担当の読み取り専用再レビューでCritical/High 0を確認する。

## Iteration 25 — 2026-08-20 修正版Aの承認と再開契約

- 入力: Claude Code第二次監査と現mainの照合、ユーザーのA案選択、修正版M13 v2/W11 v4/M14 v2/W12 v2。
- Slack証拠: 親TS `1787203224.255009`、ユーザー本人の承認返信TS `1787203707.087749`、「修正版4画面で承認」。
- 仕様変更: 1人運用は24時間待機/別sessionを廃止し、同じonline作業の二重読取・非公開証拠・理由・最終確認で可逆な`missing_candidate`だけを確認する。2人以上は別担当確認を維持する。P0の不可逆な紛失/廃棄/数量調整を禁止する。
- 会計変更: `accounting_profile`、承認済み`account_mapping_rule`、用語ヘルプ、Money Forward向けA〜AA 27列adapter、汎用19列adapter、出力停止・重複警告・取込確認履歴をP0へ追加する。外部API/自動送信は0件。
- 数式: `docs/specs/financial-formulas-v1.md`を新設し、`financial_formula_v1.0.0`、二重控除防止、月次指標、必須fixtureを正本化した。
- Gate: AC-039をP0へ追加し、AC-056〜061/TA-038〜043を新設した。旧P0合格は基礎証拠として保持するが、現行gateは再オープンした。
- Notion: 既存MVP/技術/Goal/実装計画へ追補し、子ページを削除せず再取得検証した。
- 独立仕様review初回: Critical 1 / High 4 / Medium 4。P0/P1完了範囲、`missing_candidate`のgeneric `resolved`、重複停止/警告、月次貢献利益の二重式、Money Forward列仕様、3秒確認、membership競合、pilot/UI採点、solo証拠写真の表現を検出した。
- 修正: P0必須AC/TAを明示し、P1固有条件はflag OFF/禁止経路だけとした。紛失候補は`restored`だけで閉じる。重複を同一batch hard block/過去batch明示確認へ分離し、月次式を取引合計へ一本化した。
- CSV: 2026-08-20の公式ページ再確認でMoney ForwardがA〜AA 27列であることを確認し、汎用19列と分離したschema/fixture JSON、SHA-256、serializer規則を正本化した。公式ページに文字コード指定がないため、UTF-8 BOMは本アプリの決定的契約と明記し、実import互換性を未確認扱いにした。
- 測定: server `not_before`付き3秒/keyboard同等確認、membership lock、10商品pilot手順、100点UI採点表を追加した。
- 独立再review: pilotの製品起因invalid除外とUI配点に残ったMedium 2件を修正し、最終 **PASS — Critical 0 / High 0 / Medium 0 / Low 0**。
- 実装: Goal再確認前のためコード・migration・testは未変更。25列理解を公式A〜AA 27列へ訂正した点を含め、ユーザーの最終契約確認で停止した。

## Iteration 26 — 2026-08-20 Goal契約v2確認・実装再開

- 再開入力: ユーザー回答「この契約でGoalを再開してください」。Money Forward A〜AA 27列、完全無料PWA、修正版A、P0/P1境界を含む契約v2を確認済みとした。
- 正本: `docs/specs/goal-contract-revised-a-v2.md`。Goal管理機能に残るnative iOS前提の旧Objectiveは履歴であり、実装判断へ使わない。
- 基準値: 現行mainのmigrationは`0020`まで。旧P0実装は基礎として保持するが、AC-056〜061/TA-038〜043と全P0回帰が合格するまで現行P0を完了扱いにしない。
- 最大の問題: 未測定。依存導入後に全checkとPostgreSQL migrationを実行し、最初の失敗または最大の仕様差分を一つ選ぶ。
- 変更範囲: まず承認状態と進捗記録だけを更新。コード変更は基準測定後に開始する。
- 次の一手: 現行コード、migration、テスト構成を照合し、無料ローカル環境で基準品質ゲートを実行する。

# 2026-08-20 承認済みデザイン忠実度修正

- Slack承認済みのB+Cハイブリッド、ホームC、在庫W10/M12、棚卸W11v4/M13v2、会計W12v2/M14v2と実装画面を原寸比較した。
- 大きな濃紺サイドバーと縦長フォーム中心の初期UIは不合格と判断し、白い高密度ワークベンチへ再構成した。
- 在庫と棚卸差異を別routeへ分離し、ホームのモバイル表示は「今日の確認」を先頭へ移した。
- 390×844でホーム・在庫・棚卸・会計の横overflow 0pxを測定した。
- `npm.cmd run check`: 22 files / 139 tests、coverage、lint、typecheck、Next.js buildをPASSした。
- fresh PostgreSQL 23 migrationsとexisting-data upgrade 0001〜0023をPASSした。
- 詳細証拠: `docs/implementation/design-fidelity-evidence.md`。

## Iteration 27 — 2026-08-20 Slack承認画像との再照合と1画面1目的への修正

- 再開入力: ユーザーから、実装画面がSlack承認画像とかなり異なり、承認イメージどおりを希望するとの指摘を受けた。
- 原因: `/inventory` のPC管理画面を390pxへ縮めた表示と、M12の現場用 `/mobile`・`/mobile/scan` を同じ比較対象として扱っていた。また棚卸と会計は全工程を1ページへ縦積みし、M13/M14の1画面1目的を満たしていなかった。
- 修正: M12は `/mobile`・`/mobile/scan` を正しい実装routeとして固定。棚卸は運用モード・商品読取・差異確認・ラベル、会計は出力形式・会計設定・科目候補・CSV確認の工程切替を追加した。PCのW10/W11/W12高密度作業台は維持した。
- 表示値: モック内の架空値へ合わせず、ホームKPI、在庫数、場所、会計履歴はローカルDBの保存値を表示する。未取得値は空状態または `—` とする。
- 操作領域: 5項目のモバイル下部ナビが4列指定で折り返していた不具合を修正した。主要リンク・ボタン・入力欄を44px以上にし、非表示file inputと標準checkboxは表示ラベル/操作行から操作する。
- 実ブラウザ: 390×844、768×1024、1440×1000のホーム・在庫・棚卸・会計で横overflow 0px。`/`、`/inventory`、`/inventory/stocktake`、`/accounting`、`/mobile`、`/mobile/scan` の再読込でconsole error 0件。
- 自動検証: `npm.cmd run check`は22 files / 143 tests、line 90.47%、branch 80.56%、functions 100%、lint、typecheck、production buildまでPASS。
- DB証拠: migration 0001〜0024、49-table RLS matrix、既存データupgrade 0001〜0024は直前の同一API/DB実装でPASS。今回の最終差分はWeb表示/CSS/証拠文書でありDB挙動は変更していない。
- 未完了: UI評価表の8 task独立完走、実際の10商品pilot、実iPhone Safari。これらを完了するまでGoal/Draft PRを完了扱いにしない。

## Iteration 28 — 2026-08-24 UI暫定評価とpilot migration版の整合

- UI暫定評価: `c63eb5b`で8 taskを独立実行し、報告値96/100、Critical 0、High 0、Medium 1。通常390×844、768×1024、1440×1000の横overflow 0、console error 0件、外部runtime通信0件を確認した。
- 発見と修正1: 棚卸差異の復元フォームに21〜25pxの操作が残った。`6c68980`で同フォームのbutton、checkbox以外のinput、select、textareaだけを44px以上へ限定修正した。
- 発見と修正2: 10商品pilotの開始payloadと契約が`0028`を固定し、実DBは`0031`まで進んでいた。実測環境の証拠が誤るため、新規migration`0032`で過去版を保持したまま許容版を拡張し、新runを`0032`へ一本化した。
- 再発防止: 最新migration名とpilot定数が一致しなければ自動testを失敗させる。API応答は過去`0023`〜`0032`を読め、開始要求は現行`0032`だけを受け付ける。過去runのupdate/deleteは行わない。
- 自動検証: `21fbff4`で25 files / 181 tests、statements 84.38%、branches 80.56%、functions 100%、lines 90.47%、format、lint、typecheck、API/Web production buildをPASS。
- 実DB: 既存の一時PGへ接続できなかったため触らず、別の空の一時clusterを使用した。migration 32本の適用、fresh 49-table RLS/P0結合、既存データ0001〜0032 upgradeをPASSした。
- 透明性: fresh結合の最初のrunは、今回未変更の3秒確認で`human confirmation must follow both scans`となり停止した。コードを変えず新しい空DBで全件を最初から再実行してPASSし、一時clusterは検証後に停止した。
- 未完了: `21fbff4`の実ブラウザUI 8 task、44px実測、実利用者10商品pilot、実iPhone Safari、最終独立review、Draft PR。旧UI暫定結果で代用せず、merge・本番公開・有料サービス利用は行わない。

## Iteration 31 — 2026-08-24 最終seeded証拠・DB回帰追補

- 会計: 正常経路7/7件のhuman mapping、Money Forward 27列5行CSV（1649 bytes、SHA-256 `e833a060cc7fef30fa90140fd4330e5523579d34e871d2fc061aeed349dc1e01`）をローカルdownloadで確認。税未設定はUI/APIで停止し、旧CSV不変。実MF importは未実施。
- 会計UI: 1440/768/390/720（200%相当）overflow 0、主要button 44px以上、console 0/warn 0、loopback requestのみ。
- 棚卸: soloは800×800・12KB架空写真、二重読取、3秒keyboard確認、欠損候補DB停止、同一場所復元、不可変理由`not_seen_during_count`/`found_in_place`、最終承認をPASS。dualは元担当者承認409、別manager経路で`approved dual_actor`をPASS。
- capture/workflow: TOPS 4写真4採寸、OCR自動確定なし、不一致候補拒否、`TEST BRAND` human_confirmedとtag根拠保存、copyは人確認必須。390px summary 334/111/111/111、select/next link 44px、overflow 0、「格納待ち」。通信は127.0.0.1 2xx/201、console 0。
- 回帰: full `npm.cmd run check` PASS（44 PNG/hash `a44d25d...`、29 files / 201 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、lint/typecheck/API/Web build）。fresh PG 0001〜0033、49-table RLS/immutable reason fields、upgrade rollback/preservation 0001〜0033 PASS。使い捨てDBは削除済み、外部/paid/deploy/merge 0。
- 未完了: 実利用者pilot、実iPhone Safari/home/camera/offline/HEIC-WebP、実MF import、最終Sol/UI review、Draft PR ready。Goal完了扱いにしない。

## Iteration 29 — 2026-08-24 固定fixture付きpilot v1.1

- 発見: v1.0は10個のfixture IDとカテゴリを固定していたが、各商品の画像、架空属性、カテゴリ別採寸値、warm-up素材を再現するkitがなく、実利用者が同じ入力で10商品を測れなかった。
- fixture: `WARMUP-01`と固定10商品へ各4枚の800×800ローカルPNG、架空brand/size/color、tag text、採寸template/値、CHECKLISTを追加した。manifest SHAは`a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`である。
- protocol: 新しいrunを`listing_prep_pilot_v1.1.0`、migration `0033`、上記manifest SHAへ固定した。v1.0は履歴として保持し、写真は最新role、採寸は最新attempt、属性はappend-only revisionで訂正し、手動訂正を`manual_correction`へ数える。
- 自動検証: root checkはfixture整合、format、lint、typecheck、26 files / 192 tests、API/Web buildまでPASS。
- 外部境界: 架空データとPC内ファイルだけを使用し、外部network、外部AI、有料service、実データ、公開、mergeは0件。
- 未完了: migration `0033`のfresh/upgrade PostgreSQL、現行commitの実ブラウザUI 8 task、実利用者の`WARMUP-01`＋10商品pilot、実iPhone Safari、最終独立Solレビュー、Draft PR。静的testだけで本pilotを開始しない。

## Iteration 30 — 2026-08-24 v1.1 DB・seed・部分UI評価とloopback固定

- DB: fresh PostgreSQLと既存データupgradeをmigration `0033`までPASSした。`0032`までの過去証拠で代用せず、v1.1対象として実走した。
- UI評価seed: `ui-evaluation-v1`はsolo棚卸、dual棚卸、会計、captureの4つの独立workspaceを作成する。同じDB/media rootでの再実行は空状態ゲートにより安全に拒否する。
- capture seeded browser: TOP/OUTERは4項目、PANTSは5項目、KNITは`unstretched` 4項目をPASS。候補自動確定なしの文言、390/768/1440のoverflow 0、console error/warn 0を確認した。
- stocktake seeded browser: solo/dualそれぞれの1人/2人mode選択と不足候補生成までPASS。ただしChrome拡張のlocal file upload権限不足で架空証拠写真を選べず、3秒確定・復元・最終承認は未確認。会計seeded UIはブラウザ接続切断で未確認。
- 44px再測定: 初回のmobile主要操作44px未満はFAIL。CSS/JSX修正後、390pxでheader back 44x44、save 327x48、measurement input 303x44、bottom nav各122x49、overflow 0を確認した。200% zoom、capture全属性採否、全network捕捉は未確認で、現行UI全体のPASS・最終点数ではない。
- root検証: 最新`npm.cmd run check`はfixture 44 PNG/hash一致、format、lint、typecheck、27 files / 196 tests、statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、API/Web production buildまでPASSした。
- loopback: broad bind incident後、Webのdev/startと契約testへ`127.0.0.1`固定を追加。修正版runtime netstatは`127.0.0.1:4173`だけ、targeted 24 testsとWeb buildはPASSした。外部request、課金、merge、公開は0件。
- 未完了: seeded browserの未確認操作と8 task最終採点、200% zoom、capture全属性採否、全network捕捉、実利用者の`WARMUP-01`＋固定10商品pilot、実iPhone Safari、最終独立Solレビュー、Draft PR。部分PASSを最終PASSへ繰り上げず、本pilotを開始しない。

## Iteration 32 — 2026-08-24 P05独立最終PASS

- 対象: target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`、fresh production、独立Terra。
- 結果: P05 100/100 PASS。Critical/High/Medium 0、8 task 40/40、安全25/25、responsive15/15、a11y15/15、初心者5/5。
- 確認: 390/768/1440 overflow 0、CSS zoom 2 fallbackで390/390/390・selector overflow 0、主要操作44px以上、console 0、runtime requestは127.0.0.1のみ。dual初回担当のform非表示/承認disabled/日本語handoff/409なし、manager写真・二重読取・keyboard 3秒→hold→承認成功status、mobile online→offline→onlineの端末内保持/retry disabled、会計profile・7/7履歴・CSV停止・27列5行preview/downloadをPASS。
- 自動回帰: full `npm.cmd run check` 29 files / 202 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、fixture hash `a44d25d...`。14 PNGは`docs/specs/ui-evaluation-rubric-v1.md`に列挙した。
- 未完了: 人のWARMUP＋固定10商品pilot、実iPhone、実MF import、P08最終Sol、Draft PR。P05合格をGoal完了やDraft PR readyへ拡張しない。

## Iteration 33 — 2026-08-25 P06R安全preflight GO

- target application SHA `a976d614819a662cca3be36c23989aecd9ca968e`限定で独立Terra最終GO。Critical/High/Medium/Low 0、H-P06R-02 preflight Closed。
- full checkは31 files / 209 tests、coverage 84.66/80.56/100/90.68、fixture 44/hash、format/lint/typecheck/API/Web build PASS。fresh PG 33 migrations/restricted LOGIN/49 RLS/rerun、upgrade 0001〜0033 rollback/preservation PASS。
- synthetic preflightでterminal failed案内/WARMUP、active run `917e2178-1c1c-4717-999b-0613f8b534a9`、readonly SKU/receipt、old summary 0、capture/listing disabled、未登録表示、category `tops` mismatch修正後TOP-01 201（`INV-910006-4`）を確認。console 0/warn 0、18 requests loopbackのみ、390/768/1440 overflow 0。PNG 3点をdesign evidenceへ記録した。
- 合成preflightは人P06の代替ではない。人`WARMUP-01`＋固定10商品、実iPhone、P08 Sol、Draft PRは未確認。a976を対象SHAとして人P06は開始可能。

## Iteration 34 — 2026-08-25 人P06の初心者向け操作固定

- `docs/implementation/p06-human-run-guide.md`へ、WARMUPの架空入力値、390×844設定、固定10商品順、各商品の操作、即時停止条件、終了証拠を一枚に固定した。protocolと食い違う場合はprotocolを優先する。
- HAR原本はCookie等を含み得るため`C:\tmp`だけに保存し、Git、Slack、Notion、PRへ添付しない。人P06完了後に、このPC内でURL一覧だけへ機密除去してから証拠化する。
- target application SHAは引き続き`a976d614819a662cca3be36c23989aecd9ca968e`。a976から現HEADまで`apps`、`packages`、`scripts`、`fixtures`、`package.json`の差分0を確認し、操作票追加で監査済みアプリ本体を変更していない。
- 人P06は未実施。WARMUPと固定10商品をモデルで代行せず、利用者結果が届くまでP08とDraft PRへ進めない。

## Iteration 35 — 2026-08-25 iPhone用IP限定HTTPS中継

- 平文LAN公開やSecure Cookie解除を採用せず、PC用Web/APIをloopbackのまま保つ別HTTPS中継をNode標準機能だけで追加した。接続元iPhone IP、Host、Origin、Referer、method、転送header、upstream、redirect、CA取得pathをfail closedで固定した。
- test 17/17、full check 32 files / 226 tests、coverage 84.66/80.56/100/90.68、fixture 44/hash、format/lint/typecheck/API/Web build PASS。
- PC自身限定の実走はTLS署名、login 200、CA 200、private key 404、wrong Origin 403、Secure Cookie、session/workflow 200、logout 204、revoked session 401をPASSした。外部サービス・課金・Gitへの秘密情報保存0件。
- Windowsに以前から存在するNode.js Public全ポート許可2件は変更しない。別コピーのNodeとiPhone IP限定Firewall規則を使う。実iPhone IPが未入力のため外部端末向け規則は未作成で、実Safari/PWA/camera/offline/HEIC-WebPも未確認。

## Iteration 36 — 2026-08-25 GitHub Pages公開レビューPWA

- 方針変更: ユーザーの画面確認入口として、実運用APIを公開せず、`.github/pages`に架空データのみの静的レビューPWAを追加した。GitHub Pagesの公開範囲は画面レビューに限定し、ログイン、DB、写真、出品、価格更新、会計CSV出力、外部送信はない。
- 画面: 「今日の確認」「在庫現場」「棚卸差異」「会計候補」を下部ナビで切り替え、修正版Aの在庫番号、場所階層、可逆差異、会計候補・停止理由を確認できる。修正依頼テンプレートはコピーだけで、サーバー保存しない。
- PWA: 相対パスの`manifest.webmanifest`、`sw.js`、SVGアイコン、Apple向けmetaを追加した。`pages.yml`は`.github/pages`全体をartifactへ含め、手動workflowのままにした。
- 自動確認: manifest JSON parse、Service Worker `node --check`、`git diff --check`、外部URL/機密パターンscan、静的HTTPでindex/manifest/sw/iconの200、missingの404を確認した。実ブラウザでconsole error/warn 0、390×844の縦表示、4画面切替、修正依頼ダイアログを確認した。証拠PNGは`output/playwright/gh-pages-review-desktop.png`と`gh-pages-review-mobile.png`。
- GitHub Pages siteをworkflow方式で有効化し、`github-pages`環境のmain限定保護を弱めず、レビュー専用`github-pages-preview`環境へ切り替えた。workflow run `32802062930`（head `47ec40a`）はsuccess、公開URL `https://komatsu-dev-jp.github.io/seller-assistant/` をHTTPSで確認した。
- 公開URLの実ブラウザ390×844でconsole error/warn 0、ホーム、在庫現場切替、manifest/sw/icon/commitの200、missingの404を確認した。実iPhone Safariのホーム画面追加は未確認で、人の確認をP06/P08/Draft PRの代替にはしない。

## Iteration 37 — 2026-08-29 P12-A検品履歴・権限の最終PASS

- 承認済み127画面の視覚合格と実機能合格を分離し、P12-Aとして検品結果・気になる箇所の公開contractと新規0034 migrationだけをSol maxへ限定した。
- 初回独立reviewのHigh 4、再reviewのHigh 2を、別記録者確認、内容不変review、においmemo、最新concern完全一致、human dismissal、遅延制約、session固定権限helperで修正した。
- 最終reviewのMedium 1に対し、2つの独立runtime接続、別PID、実Lock待ち、成功1／23505拒否1、枝分かれ0を確認するattack testを追加した。
- 公式PostgreSQL 18.6のfreshとupgrade、root check 34 files / 253 tests、coverage 84.66 / 80.56 / 100 / 90.68、86 routes buildをPASS。独立Sol最終判定はCritical/High/Medium/Low 0。
- P12-AはPASS、P12-B technical gateはGO。ただし6商品種類の具体的な必須／任意項目は未承認のため、`p12-product-template-proposal-v1.md`へ提案として分離し、seed/API/Web実装を停止した。

## Iteration 38 — 2026-09-03 P13-B/P14実運用接続と全127画面の再検証

- 独立設計監査で、承認済み注文画面が実注文を作らないこと、匿名配送でも住所行を作ること、写真取得後の権限再確認が不足することを重大差異として検出した。実装担当をSol max、視覚再監査をLuna max、最終凍結差分レビューを別Sol maxとするcost-optimized割当を維持した。
- P13-B/P14: M34〜38とPC29〜32を認証済み`/shipping`へ接続した。注文登録はサーバー採番の`POST /orders`、配送方法はローカル定義、任意の取引IDと販売額は欠損のまま保存可能、人の発送準備確認は必須とした。作成直後は不要な更新要求を送らず、次工程へ直接進む。
- 住所保護: 匿名配送は住所行0件・表示許可0件、住所あり配送だけ暗号化行1件として保存し、本人・注文単位・5分の表示許可を使う。旧注文の未設定値は`NULL`互換とし、shipping担当へ住所の保存先、原価、利益、販売額、税務情報を返さない。
- 実ブラウザ: モバイルは匿名配送の注文登録から商品取出し画面まで、PCは住所あり配送の注文登録、商品・場所二重読取、選択式写真方針、梱包確認、発送記録まで架空データで完走した。最終DBは発送済み、梱包証拠1件、発送時の人確認1件で、console error/warning 0を確認した。
- 追加発見: ownerの場所写真APIが注文割当を必須にして403を返した。owner/inventory managerは有効membershipだけ、shipping担当は自分の有効な注文割当を必要とするよう修正した。修正後のclean browserで最新承認済み場所写真を非公開object URLから実表示した。
- 回帰: 最新同一差分の`npm.cmd run check`はfixture 44 PNG/hash、format、lint、typecheck、45 files / 396 tests、coverage 84.66 / 80.56 / 100 / 90.68、API/Web production buildをPASSした。
- PostgreSQL: fresh `resale_p14_final_fresh_20260903c`とupgrade `resale_p14_final_upgrade_20260903c`で0001〜0038、restricted role、65-table RLS、注文番号、配送方法、匿名/住所あり配送、場所写真権限、競合、既存データ保持、rollbackをPASSした。
- UI: route verifierはモバイル75/75、PC52/52、合計127/127。`root-all-fidelity-p14-final-20260903`はviewport 127/127・外部resource 0、`approved-ui-comparison/p14-final-20260903`は127画面・欠落0・25比較シートだった。
- 未完了: 最終凍結差分の別Sol maxレビュー、実iPhone Safari/home/camera/Code 128/offline、A4 24面ラベル物理確認、実利用者の固定10商品pilot、実Money Forward取込、P12-B/Cの2項目。Draft PR #9はDraftのまま、ready化・merge・本番公開・有料API利用は行わない。

## Iteration 39 — 2026-09-03 金額欠損・実読取時刻・migration rollbackの修正

- 最初の独立SolレビューはCritical 0、High 1、Medium 1、Low 1だった。Highは登録時の未入力手数料・梱包費を0円として保存すること、Mediumは商品・場所読取の時刻を1ms差で合成すること、Lowは0037/0038の注入失敗rollback試験不足だった。
- 注文登録は原価だけを既知事実として保存し、販売額・販売手数料・梱包費を欠損のまま保持する。隠れた非null値をcontract/repositoryで拒否し、会計summary・新規CSV・再出力は主要事実が揃うまで停止する。既存の複数sale revisionは壊さず、存在判定を使う。
- 追加のforward migration `0039_registered_order_missing_financial_facts.sql`で、登録注文の発送時に原価は正確に1件、販売額・手数料・梱包費は0〜1件、選択した送料は正確に1件、同一SKU・税設定を要求する。0037/0038は履歴を変更していない。
- 二重読取は各入力が一致した瞬間をブラウザから送信し、API/DBへその実時刻を保存する。修正後の実走では商品→場所17.962秒、場所→人の確定21.614秒で、1msの合成値ではない。
- PostgreSQLはfresh `resale_p14_final_fresh_20260903f`とupgrade `resale_p14_final_upgrade_20260903e`で0001〜0039をPASSした。0037/0038/0039へ注入した途中失敗は全変更をrollbackし、その後の再適用と既存データ保持もPASSした。
- 修正後のfull checkは45 files / 401 tests、coverage 84.66 / 80.56 / 100 / 90.68、fixture 44 PNG/hash、format/lint/typecheck、API/Web build、Next 86 routesをPASSした。
- 最新production buildはモバイル75/75、PC52/52、合計127/127、viewport 127/127、欠落0、外部runtime resource 0、比較25シートをPASSした。証拠は`root-all-fidelity-p14-final-finance-20260903`と`approved-ui-comparison/p14-final-finance-20260903`。
- 実ブラウザで匿名注文をPC29〜32まで完走し、注文より前の発送時刻は期待どおり409、訂正後は発送済み、匿名住所行・表示許可・未知金額の0円行は0件、会計preflightは新規/再出力とも不可、summaryは409を確認した。
- 書込みを担当していない別Sol maxの最終再レビューはPASS（Critical 0 / High 0 / Medium 1 / Low 1）。過去H1/M2/L1はClosed。独立full checkも45 files / 401 tests、全buildをPASSした。
- MediumはPC29承認文言の意味矛盾で、利用者の再承認まで変更しない。Lowは0039のcost 0/2件、各未知金額2件、SKU/tax不一致を実DBで個別に拒否する回帰試験の補強候補で、現行SQLの不具合ではない。
- Draft PR #9はDraftのまま最新化可と判定した。ready化・merge・本番公開を行わない。人手gateとP12-B/Cの2判断も未完了のまま分離する。

## Iteration 40 — 2026-09-03 migration 0039実DB境界試験の独立合格

- P14最終レビューでLowだった0039の個別境界試験を、金額・発送・DB制約の重大領域としてSol max専任writerへ限定し、別Sol maxを読み取り専用reviewerにした。production SQL/API/Web、承認済みUIは変更していない。
- `postgres-integration.ts`へ、原価0/2件、販売額・手数料・梱包費各2件、別SKU、異なる税設定の7ケースを追加した。各ケースは別transactionで意図した不正形だけを作り、他の発送前提が有効な状態で0039固有の23514拒否へ到達する。
- 各拒否後は別接続で、注文`packed`、発送確認0、送料事実0、fixture/SKU残骸0、元のsale 1/cost 1/fee 0/packaging 0、写真・readiness・住所lease有効を確認する。想定外に発送INSERTが成功した場合も試験を明示的に失敗させ、transactionをcommitしない。
- fresh `resale_p14r_fresh_20260903a`へ存在する38 migrationファイルを適用し、`npm.cmd run test:postgres`をPASSした。初回は古いAPI/Web/Playwright検証プロセスが多数残り空きメモリ約662MBの状態でWindows異常終了したが、業務行0件を確認し、対象プロセス整理後の同一DB再実行はPASSして再発しなかった。
- upgrade `resale_p14r_upgrade_20260903a`は空DBから0039まで、注入失敗rollback・再接続・再適用、既存履歴保持をPASSした。
- rootの`npm.cmd run check`はfixture 44 PNG/hash、format/lint/typecheck、45 files / 401 tests、coverage 84.66 / 80.56 / 100 / 90.68、API/Web build、Next 86 routesをPASSした。
- 独立reviewerは、7形状、0039固有message/23514、two-salesの一時snapshot/readiness、rollback残骸0、正常発送とlegacy/P13互換を確認し、Critical 0 / High 0 / Medium 0 / Low 0でPASS、以前のLowをClosedと判定した。
- 残る全体項目はPC29文言、P12-B/C、実iPhone、物理ラベル、固定10商品pilot、実Money Forward取込、GitHub Actions方針である。Draft PRはDraftのままとし、ready化・merge・本番公開を行わない。

## Iteration 41 — 2026-09-03 モバイル擬似ステータス表示の削除と上部余白改善

- 利用者の実機画像から、Web画面内の固定`9:41`、Dynamic Island、電波、Wi-Fi、電池`77`がiPhone本体の表示と重複し、本文を圧迫していることを確認した。内容確認より先に直すべき共通UI不具合としてP15を先行した。
- cost-optimized割当として、低リスクの共通モバイルUI・CSS・testだけをLuna maxの唯一writerへ限定した。静的75画面、live login、live shippingから擬似表示を削除し、通常ヘッダーを56px、本文を可変残り高さ、ログインを上下safe-area対応にした。PC、業務文言、API、DB、権限、外部接続は変更していない。
- 修正前の390×844では擬似表示29px＋アプリheader64pxで本文開始が`y=93`だった。修正後はheader `y=0 / h=56`、本文`y=56 / h=788`となり、37pxを操作領域へ戻した。ログインは本文`y=0 / h=844`、上下padding 8pxである。
- 全75モバイルrouteを再撮影し、75/75 viewport、横overflow 0、縦overflow 0、clipped interactive 0、external resource 0を確認した。対象17 testsとroot full check 45 files / 403 tests、format、lint、typecheck、API/Web build、review 134 pages / 139 files / 766 precache filesをPASSした。
- 別Solの初回判定はCritical 0 / High 0 / Medium 0 / Low 1。LowはCSS testが無関係な同じ値でも通り得る点だった。Luna maxが`.header`と`.scrollArea`の各宣言ブロックへ検査を限定し、別Solの再確認はCritical / High / Medium / Low各0、Low Closed、最終PASS。修正後のroot full checkも45 files / 403 testsで再PASSした。
- 実iPhone Safariの実safe-areaとホーム画面表示は利用者確認まで未確認として残す。GitHub Pagesは画面確認用の架空データ静的版だけを更新し、実API/DBは公開しない。Draft PR #9はDraftのまま、ready化・mergeを行わない。

## Iteration 42 — 2026-09-08 完成監査とAC-067開始

- 現HEAD `220d6266a3b0975a2af0c81fefde2b316576755b`を、別実行のAstra lowでAC-001〜068、TA-001〜048、保留gateへ読み取り専用で再照合した。過去のPASS記録を現HEADの再実行証拠へ自動昇格していない。
- P0必須52 ACのうち、コードまたは検証差分はAC-028、039、055、062、067、利用者判断待ちはAC-065、人手・実環境待ちは16件と分類した。TAはP0の検証差分として014/017/026/027、利用者判断待ちとして046、人手待ちとして016/037/043を確認した。
- 古い記録を訂正した。実運用home、workflow、shippingはAPIへ接続済みであり「全部未接続」ではない。一方、承認済みmobile/PC routeは静的demoで、127画面撮影だけを全機能完成の証拠にはしない。CSV adapter再送不足とActions自動実行待ちは現HEADに該当しない。
- 判断不要で閉じられる最大の機能差分としてP16-A AC-067を開始した。Astra lowの唯一writerは商品調査パネル・helper・testだけを担当し、ルートは別ファイルのルール・decision・handoff整合を担当する。
- 安全境界は本人クリック時だけの公式メルカリ検索と端末内コピーである。外部検索結果取得、Codex自動送信、スクレイピング、RPA、Cookie共有、価格自動確定、API/DB変更、P12項目実装は行わない。
- 次のgateは対象試験、full check、390/768/1440px、通常時/pilot時、外部request 0、独立レビュー。同一SHAで合格するまでP16-Aを完了扱いにせず、Draft PR ready化・merge、本番API公開を行わない。

## Iteration 43 — 2026-09-08 P0限定修正と終了監査

- 基準SHA`220d6266a3b0975a2af0c81fefde2b316576755b`をclean detached worktreeへ固定し、正本worktreeのAC-067先行draftを除外して検証した。
- 修正1: GitHub Pages確認入口でNext `Link`とexport後base pathが重なり、`/seller-assistant/seller-assistant/...`へ進む404を再現。通常`a`要素へ限定変更し、review 134-page buildとローカル実ブラウザでmobile/PC遷移をPASS。
- 修正2: Windowsの`core.autocrlf=true`で生成fixture bytesが変わる問題を、全text LF + CHECKLISTだけ`-text`で固定。生成hash、対象59 tests、full checkをPASS。
- 修正3: security coverageへauth/session/DB role/media/origin/proxy等8 moduleを追加し、認証とDB role否定分岐を補強。security lines 87.96%、branches 81.33%、46 files / 411 tests、全buildをPASS。
- fresh PostgreSQLは38 migration、65-table RLS、仕入/写真/採寸/在庫/注文/発送/返品/棚卸/会計をPASS。upgradeは0001〜0039、既存履歴保持と注入失敗rollback/再適用をPASS。
- 通常`pg_restore`は`0015`の未修飾`app_code_check_digit`解決でFAIL。段階復元+関数search path設定なら70 table / 856 row / mismatch 0、論理SHA-256`237c2f16f2d188232a4622e79a6abe2709a8079a0158f081c000bdf336595183`。修正上限3件到達後のため製品コードは直さず、TA-014/026をFAILで停止。
- 独立reviewは限定3修正をCritical 0 / High 0とし、通常復元をP0影響Medium 1、navigation実装文字列testとsecurity単独閾値をLow 2と判定。
- モバイル擬似`9:41`/Dynamic Island/電波/Wi-Fi/電池は基準SHAで削除済み。2026-09-08の390×844 direct routeでも重複なしを再確認。実iPhone safe areaはWAITING_HUMAN。
- 終了区分はLIMIT_REACHED、P0は未合格。GitHubはPUBLICでprivate限定条件と不一致のため外部書込み0件。検証用DB4個、LOGIN role、一時backupを削除し、loopback PostgreSQLを停止した。
- 詳細なAC/TA個別判定、証拠、人手gate、次の1件は`docs/implementation/goal-closeout.md`を正本とする。

## Iteration 44 — 2026-09-08 TA-014通常復元の根本修正

- Iteration 43の通常復元FAILを、専用のPostgreSQL 18.6、`127.0.0.1:55444`、架空データだけの新しい隔離環境で再現した。復元元は70 public tables / SKU 2 / media 1 / audit 3で、修正前の`pg_restore`は`inventory_unit` COPY中の`app_code_check_digit(text) does not exist`で終了コード1となった。
- 追加前に失敗する`restore-safe-code-helpers.test.ts`を固定し、過去の`0015_shipping_assignment_checked_codes.sql`は変更せず、forward migration `0040_restore_safe_checked_code_helpers.sql`を追加した。3関数は`search_path = pg_catalog, public`を固定し、内部関数を`public.`修飾する。
- 通常のcustom dumpから空DBへのsingle-transaction restoreをPASSした。全70 tables / 48 rowsと全行値SHA-256、244 foreign keys、RLS、sequence、media metadata/原本ファイルhash、audit履歴、runtime role/grant/tenant isolation/追記監査拒否が一致した。
- fresh PostgreSQLは存在する39 migrationを適用してrestricted role、65-table RLS、在庫・写真・注文・発送・会計等をPASS。upgradeは0001〜0040、0040注入失敗のrollback・再接続・再適用、既存SKU/media/finance/export/audit保持をPASSした。
- モバイル上部の固定`9:41`等は基準SHAですでに削除済みで、TA-014のためにUIを変更していない。外部push、Pages、PR、Slack、Notionは0件。

## Iteration 45 — 2026-09-08 復元安全境界の再レビューと終了

- 初回Astra mediumレビューはCritical 0 / High 1 / Medium 1 / Low 2。Highは継承`PGHOSTADDR`等により確認先とCLI復元先が分離し得る点、MediumはCOPY失敗のstderrに行値が出得る点、Lowは写真link脱出とsequence `is_called`未照合だった。
- 第2ラウンドで、接続URLを数値loopback・安全なdatabase/user名・query/hashなしへ限定し、子processの全`PG*`を除去して`PGPASSWORD`だけを渡した。stderrは読み捨てて行値を例外へ含めない。実子processを使う外部接続なしの回帰testで固定した。
- 写真root/fileは`lstat`と`realpath`で実体を確認し、symlink/junctionを復元前に拒否する。sequenceは`last_value`と`is_called`、RLS可視件数はworkspace単位で照合する。架空junctionは期待どおり拒否し、正常restoreは同じ全行・写真・監査hashで再PASSした。
- 最終`npm.cmd run check`はfixture 44 PNG/hash、format、lint、typecheck、50 files / 431 tests、coverage statements 83.56% / branches 80.93% / functions 92.06% / lines 89.06%、API/Web build、Next 86 routesをPASSした。
- 再レビューはPASS、Critical 0 / High 0 / Medium 0 / Low 1。Lowは`[::1]`形式を現postgres.jsが安全側に接続失敗するIPv6互換性で、今回の正式手順を実証済み`127.0.0.1`に限定する。2ラウンド上限後のため追加拡張しない。
- TA-014はPASS。TA-026はDB/private Storage原本復元まで証明したが、実運用providerの頻度・RPO/RTO未計測によりNOT_RUN/partial。P0全体は未合格、P1は未開始、外部反映0件で今回を終了する。
- 検証後は専用clusterを正常停止し、正規化した絶対pathが意図した試験rootと完全一致することを再確認してから、`C:\tmp\seller-assistant-ta014-restore-20260908-01`だけを削除した。既存DB、実データ、PostgreSQL本体は変更・削除していない。

## Iteration 46 — 2026-09-09 P0 Codex側完了監査

- 94項目の進捗を再監査し、Codex側で閉じられる8項目（AC-001/028/055/062/067、TA-017/026/048）を現在候補の証拠へ対応づけた。結果は83/94、AC 45/52、TA 38/42。残る11項目はすべて実機・物理・公式画面・利用者判断の`WAITING_HUMAN`である。
- 承認済みmobile 75＋PC52を最終buildから127/127再撮影し、route欠落0、外部resource 0、比較25シートを生成した。live 10 routeは390/768/1440の30条件でHTTP 200、横overflow、console warning/error、page error、外部request各0だった。
- role別の実ブラウザで、ownerの担当解除申請、自己承認不可、別inventory managerの承認、追記履歴を確認した。管理担当の掲載4写真取得が背面/タグで403になる問題を修正し、field workerの限定権限は広げなかった。
- 独立レビューで、商品写真以外のprivate fileが通常復元manifestへ入らないP0阻害Mediumを検出した。レシート、場所原本/派生、棚卸差異、発送を追加し、6種すべてを持つ架空DBで73 tables / 316 rows / 253 FK / private files 23のDB・file・audit hash一致を再実証した。
- 最終`npm.cmd run check`は63 files / 580 tests、coverage 83.93 / 81.06 / 92.06 / 89.50、format/lint/typecheck/security/build、Next 86 routesをPASS。fresh 45 migrations、upgrade 0001〜0046、通常restoreも同じ候補でPASSした。
- 最終独立再レビューはPASS。Critical 0 / High 0 / P0阻害Medium 0 / Low 2。LowはIPv6接続互換と、未公開0043単独運用時だけの旧pending互換であり、今回のIPv4・0043〜0046一括適用を止めない。
- GitHub/Pages/Slack/PR/本番への反映、commit、push、merge、課金、外部runtime APIは0件。利用者指定の既存Notion進捗表だけを最終チェック状態へ同期し、再取得で94項目・完了83・未完了11を照合した。

## Iteration 47 — 2026-09-09 無料CI・PR #9・merge準備

- 利用者がP0完了候補のPR作成とGitHub mergeを明示依頼し、既存の手動CI方針との衝突提示後、公開リポジトリの無料自動CI・Pages公開への変更を承認した。
- `.github/workflows/ci.yml`はPull Requestと`main`へのpush、`.github/workflows/pages.yml`は`main`へのpushを自動triggerに追加した。再実行用`workflow_dispatch`は残し、標準`ubuntu-latest`以外を使わない。
- 方針変更を`AGENTS.md`、`zero-cost-guard.md`、`technical-architecture-v1.md`、`docs/DECISIONS.md`、解決済みinboxへ反映し、旧手動限定判断を日付付きで置き換えた。
- merge直前のローカルgateは、一時的な5秒timeoutを対象単独実行で非再現と確認後、`npm test` 63 files / 580 tests、`npm run lint`、`npm run build` 86 routesを順番どおりPASSした。
- 次は全task-owned pathだけを明示stageし、既存PR #9を更新する。PR head CI、merge後`main` CI、Pagesを各commit SHA一致で確認するまで完了扱いにしない。
