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
