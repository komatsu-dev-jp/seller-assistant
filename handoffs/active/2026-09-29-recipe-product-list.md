# Handoff: レシピ選択と見本商品一覧

- Status: delivery
- Owner: Codex
- Updated: 2026-09-29 JST
- Branch: `codex/recipe-product-list`
- Worktree: `C:\Users\softt\Documents\Codex\2026-08-13\iphone-notion-google-research-ios-pc\_worktrees\recipe-product-list`

## 目的

公開確認版の「編集レシピを選ぶ」で選択が見えず保存されない問題を直し、商品タブから見本商品1点を一覧で確認できるようにする。

## 完了条件

- [x] 正面写真のレシピを切り替え、タグ・気になる箇所のレシピを追加選択できる
- [x] 選択状態が同じブラウザーに保存され、次画面と再読み込み後に表示される
- [x] 商品タブから見本商品1点の一覧を開き、詳細へ進んで戻れる
- [x] 本番用Web/APIビルドとPages用静的ビルドが成功する
- [ ] PR検証・マージ・公開版への反映（今回の`merge`依頼で実施中）
- [ ] 実iPhoneでの確認（公開後に利用者が実施）

## 変更禁止範囲

- 実商品、外部API、写真加工、出品、課金、本番データは対象外。GitHubへのpush/PR/merge/公開は今回の`merge`依頼に限る。
- 承認済みの既存75画面の並びは変更しない。

## 現在地

手元の専用ブランチに実装し、スマホ幅のブラウザーで操作確認済み。公開中のGitHub Pagesには未反映。今回の`merge`依頼により公開作業を進行中。既存の `main` と別作業の `work/` は変更していない。

## 変更済み・確認済みファイル

- `apps/web/src/components/approved-mobile/approved-mobile-demo.tsx` と同CSS: 商品タブ、見本商品一覧、レシピの選択表示
- `apps/web/src/components/approved-mobile/review-recipe-store.ts` とテスト: 見本商品のレシピ選択をブラウザー内に保存
- `apps/web/src/components/approved-mobile/mobile-back-navigation.ts` とテスト: 一覧から詳細を開いた後に戻る
- `apps/review/app/mobile/products/page.tsx`、`apps/web/src/app/mobile/products/page.tsx`: 商品一覧の入口

## 検証

- 実ブラウザー: レシピの選択・切替・組合せ・次画面への引継ぎ、商品一覧→詳細→一覧 PASS
- `npx vitest run` 対象2ファイル: 82件 PASS
- `npm run check`: 2026-09-29の再実行で全工程PASS（122ファイル・1035件）。以前の実行では既存API試験が時間超過したが、テスト条件を変えずに再実行して成功。
- `npm test -- --maxWorkers=2`: 122ファイル・1035件 PASS、coverage基準PASS
- `npm run security:check`: PASS
- `npm run build`: PASS
- `REVIEW_BASE_PATH=/seller-assistant npm run build --workspace @resale/review`: PASS、新しい `/mobile/products` を生成
- 別実行のAstra lowによる読み取り専用レビュー: P1/P2指摘0件。Pages生成HTMLのリンクも確認。

## 未解決事項・リスク

- 実iPhoneでは未確認。公開前にPR検証とPages反映後の端末確認が必要。
- 編集レシピの保存は架空商品の選択状態だけで、写真加工や実在庫への反映ではない。
- 初回のデフォルト並列試験では既存APIテストの時間超過があった。条件を変えない再実行の `npm test` と `npm run check` は全件成功した。

## 次の一手

1. 今回の`merge`依頼に沿って、PR検証・マージ・Pages公開とGitHub進捗管理を完了する。
2. 公開後に実iPhoneで商品タブとレシピ選択を確認してもらう。

## 参照

- Design: `docs/design/mobile-ios-redesign-b-revision-prompts-v6.md`、`docs/design/mobile-ios-redesign-slack-revisions-v6.md`
- Decision: `docs/DECISIONS.md` の2026-09-22公開モバイル確認版
- Issue: https://github.com/komatsu-dev-jp/seller-assistant/issues/28（Project #1のIn Progress）
- PR: 未作成

## Memory候補

- なし
