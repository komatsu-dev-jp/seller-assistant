---
status: candidate
date: 2026-10-01
area: api-test-validation
---

# 既存APIテスト2件が全体実行時に時間切れ

## 確認したこと

商品単位の出品準備を提出する前の `npm run check` で、124ファイル1060テストのうち既存APIテスト2件が5000msで時間切れになった。1058件は合格した。今回の実装差分にAPIやそのテストの変更はない。

- `apps/api/src/published-product-page.test.ts`: reads and registers only authenticated same-workspace requests
- `apps/api/src/sales-check.test.ts`: requires authenticated workspace and returns private noncached observations

制限時間・設定・ソースを変更せず2ファイルを単独実行すると、12テストすべて合格した（実行全体1.43秒）。PR #29にも、初回の既存APIテスト2件の時間切れと条件を変えない再実行での合格が記録されている。

## 原因・予防策

原因は未確定。起動時や並列実行時の負荷との関係は未検証であり、原因と断定しない。全体実行の失敗を単独実行の成功だけで合格に置き換えず、同じ条件で必須チェックを再実行する。理由なく制限時間を延長しない。

## 未完了

- 再発原因の特定と予防策の実証
- 独立レビューを含むlesson昇格の確認

## 出典

- 今回の作業: `handoffs/active/2026-09-29-product-preparation.md`
- 既存の類似記録: https://github.com/komatsu-dev-jp/seller-assistant/pull/29
- 個別再実行: `npx --no-install vitest run apps/api/src/published-product-page.test.ts apps/api/src/sales-check.test.ts`

候補記録であり、`memory/INDEX.md`の有効なlessonへは追加しない。
