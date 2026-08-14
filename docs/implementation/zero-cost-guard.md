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
