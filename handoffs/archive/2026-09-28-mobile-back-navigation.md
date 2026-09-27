# Handoff: モバイル版の戻る矢印（実装・検証から公開へ）

- Status: review（実装・検証完了時点の記録。公開確認は未了）
- Owner: Codex
- Updated: 2026-09-28 01:16 JST
- Branch: `codex/mobile-back-navigation`（`origin/main` の `1ee7b44` から分離）
- Worktree: `C:\Users\softt\Documents\Codex\2026-08-13\iphone-notion-google-research-ios-pc\_worktrees\mobile-back-navigation`

## 目的

スマホの画面左上の戻る矢印を、画面番号順ではなく実際の直前画面へ戻す。

## 完了条件

- [x] 作業一覧から会計設定へ進んだ後、矢印で作業一覧へ戻る
- [x] 直接リンクで開いた場合は、アプリ外や無関係な番号へ飛ばずホームへ移動する
- [x] 公開形式の75画面を生成し、対象導線をブラウザーで確認する
- [x] 公開版の入口と、現在のフッター項目を再タップした場合も正しい画面へ戻る
- [x] 全75画面IDを使った参照元判定の回帰テスト
- [x] 全体checkと独立レビューを通す
- [ ] GitHub上の公開版へ反映する（利用者がPR作成・マージ・Pages公開を許可済み）

## 現在地

公開中の旧版では `05`（作業一覧）→`44`（会計設定）→戻る矢印で `43`（売上の事実）へ誤遷移した。修正版では同じ操作が `05` に戻る。公開入口 `/mobile/app/` から `44` へ進んだ場合も元の入口へ戻る。同じフッター項目を押しても画面を再読込せず、戻り先を保持する。直接 `44` を開いた場合は `04`（ホーム）へ移動する。画面の見た目と業務データ保存処理は変更していない。

## 変更済みファイル

- `apps/web/src/components/approved-mobile/approved-mobile-demo.tsx`: 矢印の遷移先を実際の履歴に変更し、現在のフッター項目の再読込を防止
- `apps/web/src/components/approved-mobile/mobile-back-navigation.ts`: 同じ公開アプリ内の参照元と公開版入口だけを許可
- `apps/web/src/components/approved-mobile/mobile-back-navigation.test.ts`: 戻り先と安全な代替先の回帰テスト
- `apps/web/src/components/approved-mobile/mobile-screen-data.ts`: 未使用になった番号順の前画面関数を削除

## 検証

- `npm run check`: PASS、121ファイル・1031テスト、整形・lint・型・秘密情報・依存関係・Web/API build
- `REVIEW_BASE_PATH=seller-assistant npm run build --workspace @resale/review`: PASS、モバイル75画面とPC52画面を生成
- 公開中の旧版で誤遷移を再現。修正版のローカル配信をブラウザーで操作し、`05`→`44`→フッター`44`再タップ→戻る矢印→`05`、`/mobile/app/`→`44`→戻る矢印→`/mobile/app/`、`43`→フッター`44`→戻る矢印→`43`、直接リンク`44`→ホーム`04`を確認
- 別実行のAstra lowによる凍結差分レビュー: PASS、修正必須の指摘なし
- 全75画面IDのテストは判定関数の検査であり、75画面を一つずつ実機でタップした証拠ではない
- iPhone実機Safari: NOT RUN。公開後に利用者の実機で要確認

## 変更禁止範囲

- `main`、他の作業フォルダ、実データ、外部APIを触らない
- 許可済みの戻る矢印修正に範囲を限定し、無関係な変更を含めない

## 次の一手

1. 変更差分とcheck結果を再確認してPRへ進める。
2. CI合格後にマージし、Pagesの反映を確認する。
3. 公開URLで `05`→`44`→戻る矢印、直接`44`→ホームを確認し、iPhone Safari実機の結果を依頼する。
