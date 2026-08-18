# Claude Code向け申し送り: P0実装の現在地

- Status: ready-for-follow-up
- Updated: 2026-08-18 JST
- Branch: `feat/p0-resale-operations`
- Worktree: `C:\Users\softt\Documents\Codex\2026-08-13\iphone-notion-google-research-ios-pc\_worktrees\goal-implementation`
- Product: 無料・ローカル実行を前提にしたフリマ物販業務PWA/Web。APIは同じPC上のWebとDBをつなぐ内部窓口で、Mercari/Notion/Slack/OpenAI等へruntime接続しない。

## 今回までに実装したこと

- 棚卸開始時の在庫snapshotを固定し、開始後に正規移動した現物を`post-start movement`として別表示し、紛失候補へ混ぜない。
- 棚卸で、正常読取・重複読取・未知の在庫番号・ラベル破損/読取不能を全て観測記録として保存する。未知番号の生入力は固定コード形式だけを保存し、自由記述や個人情報は保存しない。
- pickと返品隔離で、古い在庫ラベルを拒否したときも`inventory.scan.rejected`監査を残す。監査には操作名・ラベル版・参照IDだけを持ち、住所等を含めない。
- 撮影途中の写真、採寸値、再測定理由、商品タグ候補をIndexedDB（ブラウザ内の無料保存領域）へ一時保存し、通信失敗時に再送できる。担当解除時は該当SKUの一時データを消去する。
- 撮影outboxの実IndexedDB動作、401（ログイン期限切れ）は保持、403（担当解除）は消去、保存キャッシュ消去を実動作テストで確認する。
- `fake-indexeddb`はテスト専用の無料OSS依存で、実行時の外部通信には使わない。

## 主な変更ファイル

- `packages/db/migrations/0019_stocktake_post_start_movement.sql`
- `packages/db/migrations/0020_stocktake_observation_completeness.sql`
- `apps/api/src/stocktake-repository.ts`
- `apps/api/src/order-repository.ts`
- `apps/api/src/postgres-integration.ts`
- `packages/contracts/src/index.ts`
- `apps/web/src/components/stocktake-workspace.tsx`
- `apps/web/src/components/mobile-capture-workspace.tsx`
- `apps/web/src/lib/capture-outbox.ts`
- `apps/web/src/lib/capture-outbox.test.ts`
- `apps/web/src/lib/offline-outbox.test.ts`
- `packages/db/src/schema.test.ts`
- `package.json` / `package-lock.json`

## 検証済み

- `npm test`: 21 files / 118 tests passed。
- `npm run lint`: passed。
- `npm run build`: domain/contracts/API/Web production build passed。
- `npm run test:postgres`: PostgreSQL 18.6の空DB（template0）へ0001〜0020を適用し、38-table RLS、P0一気通貫、棚卸観測、開始後移動分離、pick/返品隔離の古いラベル監査までpassed。
- 外部サービス、GitHub Pages、本番公開、Mercari出品/値下げは未実行。

## 次に行うこと

1. GitHub PRのCIで`npm ci`と`npm run check`の実行結果を、PR head SHA一致で確認する。
2. PRマージ後のmain CIとPages設定を確認する。現時点の`.github/workflows/ci.yml`は`workflow_dispatch`（手動実行）だけで、PR/pushトリガーとPages deploymentは未確認。mergeスキルの必須条件に不足があれば、CI変更の承認をユーザーへ確認する。
3. 実iPhone Safariでホーム画面追加、カメラ、圏外復帰を手動確認する（Windowsだけでは未確認）。
4. Claude Codeが作業するときも、APIキー・住所・Cookie・実商品データをコミットしない。自動出品、スクレイピング、非公開API、無人値下げは対象外。

## 注意

- PostgreSQL接続先はローカル検証用のみ。管理者接続はmigration/test専用で、通常APIには渡さない。
- Notionは共有ミラーであり、確定データの正本ではない。
- 税務は記録整理・CSV候補まで。個別の税務判断や申告完了をアプリが行わない。
