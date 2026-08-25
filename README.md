# Resale Operations App

中古衣料を中心とした物販業務を、仕入証憑から在庫、出品準備、配送、会計ソフトへの受け渡しまで安全につなぐPWA/Webアプリです。PWAは、iPhoneのホーム画面へ追加してアプリのように使えるWebサイトのことです。

## 現在の段階

- P0（試験SKU 1点の縦導線）は実装・ローカル検証済みで、独立レビューとDraft PR準備中です。
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

APIは `DATABASE_URL`（PostgreSQLの接続先）、32バイト以上の `SESSION_SECRET`（認証Cookieを署名する秘密鍵）、`LOCAL_MEDIA_ROOT`（写真を非公開保存するPC内の絶対パス）、32バイトの `ADDRESS_ENCRYPTION_KEY`（発送先を暗号化する鍵）が必要です。`DATABASE_URL`はmigration 0006の`resale_app_runtime`を付与した制限LOGINロール専用です。管理者・RLS迂回権限・runtime未所属なら起動を停止します。値は `.env.example` には書かず、自分のPCの環境変数だけに設定します。未設定の場合も起動を停止し、一時メモリや公開フォルダへ勝手に保存しません。

認証は `HttpOnly; Secure; SameSite=Strict` の署名付きCookieだけを受け付けます。利用者IDを直接書いたヘッダー、localStorage、IndexedDB、Service Worker cacheを認証情報の保存先にしません。ログアウトはDBのsession失効成功後だけCookieとPWA端末データを消します。

ログインは外部の有料認証サービスを使わず、Node.js標準の `scrypt`（パスワードを元に戻せない形へ変換する仕組み）で照合します。平文パスワードはDBへ保存しません。5回の連続失敗は15分停止し、存在しないメールでも同じ失敗文を返します。初期オーナーは公開画面ではなく `npm.cmd run bootstrap:owner` をPCで一度だけ実行して作ります。使い捨てのローカルPostgreSQLでは、初期オーナー作成、ログイン、別事業所の拒否、試行回数制限、ログアウト後のsession拒否まで確認済みです。本番公開は今回の範囲外です。

WebからAPIへ同一URLで安全に中継するときだけ `API_INTERNAL_ORIGIN`（Webサーバーから見たAPI接続先）を設定します。`APP_ORIGIN`（利用者が開くWebアプリの正確なURL）も必須で、変更操作はブラウザの `Origin` と完全一致する場合だけ許可します。未設定・欠落・別サイトからの要求は停止し、sessionと端末データを変更しません。

## 同じWi-Fi内のiPhone表示

認証Cookieの`Secure`設定を弱めず、`scripts/start-lan-preview.mjs`のローカルHTTPS中継を使います。PC用WebとAPIは`127.0.0.1`のままにし、許可したiPhoneのIPv4アドレス1件だけを通します。証明書や秘密鍵はGitへ保存しません。詳しい準備、iPhone操作、停止・削除は`docs/implementation/secure-lan-preview-guide.md`を参照してください。

```powershell
npm.cmd run lan:preview
```

必要な環境変数が1件でもない場合、loopback以外の上流、`0.0.0.0`待受、接続元IP未指定の場合は起動を停止します。これは本番公開機能ではなく、信頼済みの同一Wi-Fiで実機確認する間だけ使う開発用機能です。

## GitHub Pages公開レビュー版

GitHub Pages（GitHubの静的Web公開機能）には、`.github/pages`のレビュー専用PWAを手動で公開します。画面・文言・導線をスマホで確認するためのページで、架空データだけを使い、ログイン、API、PostgreSQL、写真保存、出品、価格変更、会計CSV出力はありません。操作も保存されません。

公開先は公開リポジトリのPages URL `https://komatsu-dev-jp.github.io/seller-assistant/` です。iPhoneのSafariで開き、「共有」→「ホーム画面に追加」を選ぶとアプリ風に起動できます。実運用版はPC内のloopback環境を使い、GitHub Pagesへ実データを入力しないでください。

## 構成

- `apps/web`: PC画面とiPhone向けPWA
- `apps/api`: PWAとPC画面で共有するAPI
- `packages/domain`: 外部サービスに依存しない業務ルール
- `packages/contracts`: APIの入出力schema
- `packages/db`: PostgreSQL schemaとmigration
- `docs/specs`: 承認済み仕様
- `docs/implementation`: AC/TA対応表と評価Loopの証拠
