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

## 構成

- `apps/web`: PC画面とiPhone向けPWA
- `apps/api`: PWAとPC画面で共有するAPI
- `packages/domain`: 外部サービスに依存しない業務ルール
- `packages/contracts`: APIの入出力schema
- `packages/db`: PostgreSQL schemaとmigration
- `docs/specs`: 承認済み仕様
- `docs/implementation`: AC/TA対応表と評価Loopの証拠
