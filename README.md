# Resale Operations App

中古衣料を中心とした物販業務を、仕入証憑から在庫、出品準備、配送、会計ソフトへの受け渡しまで安全につなぐPWA/Webアプリです。PWAは、iPhoneのホーム画面へ追加してアプリのように使えるWebサイトのことです。

## 現在の段階

- Goal実装中。P0（試験SKU 1点の縦導線）を先に構築しています。
- 個人向け販売画面の自動出品・自動値下げは行いません。
- AIは文章・仕訳の候補を作り、人が確認した内容だけを確定します。
- 本番公開とPRマージは今回の範囲外です。

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

APIは `DATABASE_URL`（PostgreSQLの接続先）と、32バイト以上の `SESSION_SECRET`（認証Cookieを署名する秘密鍵）の両方が必要です。値は `.env.example` には書かず、自分のPCの環境変数だけに設定します。未設定の場合は起動を停止し、一時メモリへ勝手に保存しません。

認証は `HttpOnly; Secure; SameSite=Strict` の署名付きCookieだけを受け付けます。利用者IDを直接書いたヘッダー、localStorage、IndexedDB、Service Worker cacheを認証情報の保存先にしません。ログアウトはDBのsession失効成功後だけCookieとPWA端末データを消します。ログイン発行、実PostgreSQL接続、CSRF総合検証は未実装のため、本番利用はまだできません。

WebからAPIへ同一URLで安全に中継するときだけ `API_INTERNAL_ORIGIN`（Webサーバーから見たAPI接続先）を設定します。未設定時のログアウトは503で停止し、sessionと端末データを変更しません。

## 構成

- `apps/web`: PC画面とiPhone向けPWA
- `apps/api`: PWAとPC画面で共有するAPI
- `packages/domain`: 外部サービスに依存しない業務ルール
- `packages/contracts`: APIの入出力schema
- `packages/db`: PostgreSQL schemaとmigration
- `docs/specs`: 承認済み仕様
- `docs/implementation`: AC/TA対応表と評価Loopの証拠
