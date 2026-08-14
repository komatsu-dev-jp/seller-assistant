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
