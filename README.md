# Resale Operations App

中古衣料を中心とした物販業務を、仕入証憑から在庫、出品準備、配送、会計ソフトへの受け渡しまで安全につなぐPWA/Webアプリです。PWAは、iPhoneのホーム画面へ追加してアプリのように使えるWebサイトのことです。

## 現在の段階

- P0（試験SKU 1点の縦導線）は実装・ローカル検証済みで、独立レビューとDraft PR準備中です。
- 個人向け販売画面の自動出品・自動値下げは行いません。
- AIは文章・仕訳の候補を作り、人が確認した内容だけを確定します。
- 本番公開とPRマージは今回の範囲外です。

## 開発管理

作業依頼、進捗、モデル振り分け、Solレビュー、利用者承認は、共通の[AI App Delivery Project](https://github.com/users/komatsu-dev-jp/projects/1)で管理します。具体的な使い方は[GitHub Projects 運用](docs/implementation/github-projects-workflow.md)を参照してください。

## 必要なもの

- Node.js 24以上
- npm 11以上
- Windows PCと、確認用の一般的なWebブラウザがあれば開発できます。Mac、Xcode、Apple Developer契約は不要です。
- 外部の有料API、従量課金、クラウドCI、自動デプロイは使用しません。

## 開発コマンド

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run check
```

`npm.cmd run check` は書式、lint（コード規則検査）、型、テスト、ビルドを順に確認します。

## APIの安全な起動

APIは `DATABASE_URL`（PostgreSQLの接続先）、32バイト以上の `SESSION_SECRET`（認証Cookieを署名する秘密鍵）、`LOCAL_MEDIA_ROOT`（写真を非公開保存するPC内の絶対パス）、32バイトの `ADDRESS_ENCRYPTION_KEY`（発送先を暗号化する鍵）が必要です。`DATABASE_URL`はmigration 0006の`resale_app_runtime`を付与した制限LOGINロール専用です。管理者・RLS迂回権限・runtime未所属なら起動を停止します。値は `.env.example` には書かず、自分のPCの環境変数だけに設定します。未設定の場合も起動を停止し、一時メモリや公開フォルダへ勝手に保存しません。

認証は `HttpOnly; Secure; SameSite=Strict` の署名付きCookieだけを受け付けます。利用者IDを直接書いたヘッダー、localStorage、IndexedDB、Service Worker cacheを認証情報の保存先にしません。ログアウトはDBのsession失効成功後だけCookieとPWA端末データを消します。

ログインは外部の有料認証サービスを使わず、Node.js標準の `scrypt`（パスワードを元に戻せない形へ変換する仕組み）で照合します。平文パスワードはDBへ保存しません。5回の連続失敗は15分停止し、存在しないメールでも同じ失敗文を返します。初期オーナーは公開画面ではなく `npm.cmd run bootstrap:owner` をPCで一度だけ実行して作ります。使い捨てのローカルPostgreSQLでは、初期オーナー作成、ログイン、別事業所の拒否、試行回数制限、ログアウト後のsession拒否まで確認済みです。本番公開は今回の範囲外です。

WebからAPIへ同一URLで安全に中継するときだけ `API_INTERNAL_ORIGIN`（Webサーバーから見たAPI接続先）を設定します。`APP_ORIGIN`（利用者が開くWebアプリの正確なURL）も必須で、変更操作はブラウザの `Origin` と完全一致する場合だけ許可します。未設定・欠落・別サイトからの要求は停止し、sessionと端末データを変更しません。

## 構成

- `apps/web`: PC画面とiPhone向けPWA
- `apps/api`: PWAとPC画面で共有するAPI
- `packages/domain`: 外部サービスに依存しない業務ルール
- `packages/contracts`: APIの入出力schema
- `packages/db`: PostgreSQL schemaとmigration
- `docs/specs`: 承認済み仕様
- `docs/implementation`: AC/TA対応表と評価Loopの証拠
