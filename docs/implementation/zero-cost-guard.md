# 0円運用ガード

- 状態: 有効
- 根拠: 2026-08-15 ユーザー指示「絶対無料」

## 今回使用できるもの

- 手元のWindows PCで動くNode.js、npm、Git、ブラウザ。
- 無料のオープンソース依存。`package-lock.json`で版を固定する。
- ローカルのテスト用データと、外部へ公開しない開発サーバー。
- iPhone Safariの「ホーム画面に追加」によるPWA表示。

## 実行しないもの

- 有料API、有料SaaS、従量課金、無料期間後に自動課金される契約。
- GitHub Actions等の外部クラウドCI。workflowは手動起動だけにし、今回起動しない。
- Vercel等への本番・プレビューdeploy、App Store申請、Apple Developer契約。
- Photoroom Pro/API、外部AI、外部Storage、外部PostgreSQLへの接続。

## 実装上の扱い

- AI機能は候補/根拠/人確認の境界を実装し、P0では決定的な文章テンプレートを使う。
- DB/Storageはprovider契約を分離し、P0検証ではローカルadapterを使う。
- 外部サービスがなくても、試験SKUの代表導線と安全テストを完了できるようにする。
- 将来、外部接続や公開が必要になった場合は、費用と無料条件への影響を提示して再承認を待つ。

## 検証

- `.github/workflows/*.yml` に自動triggerとmacOS jobがないことをテストする。
- Draft PR作成前に外部CI run、deployment、課金契約が0件であることを確認する。
- 本書と実装が矛盾した場合は処理を停止し、無料側へ倒す。

## 2026-08-15 実行確認

- runtime（利用時に動く部分）の外部SDK、外部サービスURL、Mercari/Notion/Slack/OpenAI/Photoroom向けrouteは0件。
- Webブラウザは同じサイト内の`/v1`だけを呼び、APIはPC内PostgreSQLとPC内private media directoryだけを使用する。
- `.env.example`の外部credentialは空。住所暗号化keyも利用者がPC内で設定するまで起動を停止する。
- 無料のPlaywright CLIと既にPCへ入っているChromeを検証専用に使用した。アプリのruntime依存、外部サービス連携、従量課金は追加していない。
- 外部API呼出し、従量課金、有料契約、deploy、外部CI、App Store申請は0件。
- GitHub push、Slack、Notionへの追加書込みはユーザーの外部接続確認が終わるまで停止している。
