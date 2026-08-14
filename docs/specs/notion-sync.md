# Notion同期記録

- 状態: 在庫ロケーション反映版と独立再レビュー結果を4ページへ同期・再取得検証済み
- 確認日: 2026-08-14（JST）
- 同期方式: ローカルMarkdownを内容の作業正本とし、Notionへ仕様共有用ページを作成

## 親ページ

- 名称: メルカリ物販
- Page ID: `9698819d-f542-4d59-9939-cd76451cc17c`
- URL: https://app.notion.com/p/9698819df5424d599939cd76451cc17c?pvs=204

## MVP仕様書

- 名称: フリマ物販業務アプリ｜MVP仕様書（Goal開始前）
- Page ID: `3bb1548a-971b-81fc-9c03-db521b930b50`
- URL: https://app.notion.com/p/3bb1548a971b81fc9c03db521b930b50?pvs=204
- ローカル正本: `docs/specs/mvp-product-spec-v1.md`
- 再取得確認: 18章、P0/P1、M12/W10、在庫管理番号/場所階層/位置写真/二重読取/棚卸差異、AC-001〜AC-055、Slack承認TS `1786639062.761949`、対象外、子ページ参照を確認

## 技術設計

- 名称: 技術アーキテクチャ・データ境界 v1
- Page ID: `3bb1548a-971b-81ab-9ab0-d0246d7de566`
- URL: https://app.notion.com/p/3bb1548a971b81ab9ab0d0246d7de566?pvs=204
- ローカル正本: `docs/specs/technical-architecture-v1.md`
- 再取得確認: SwiftUI/DataScanner、Next.js、PostgreSQL、在庫/場所/ラベル/移動/棚卸model、外注の場所枝権限、オフライン競合、画像provider境界、財務/RLS/端末保護、固定上限、TA-001〜TA-037を確認

## Goal開始前の最終確認

- 名称: Goal開始前・最終確認事項 v1
- Page ID: `3bb1548a-971b-8185-bb0d-ecb105980aad`
- URL: https://app.notion.com/p/3bb1548a971b8185bb0decb105980aad?pvs=204
- ローカル正本: `docs/specs/goal-contract-v1.md`
- 再取得確認: 完成像、在庫番号/場所写真付きP0縦導線、P1高度在庫、MVP、対象外、AC-001〜AC-055/TA-001〜TA-037、外部開始条件、本番公開/PRマージ禁止を確認

## 旧実装資産監査

- 名称: 旧実装資産監査（51 tests）
- Page ID: `3bb1548a-971b-81c2-b4fb-df3c93ee62e6`
- URL: https://app.notion.com/p/3bb1548a971b81c2b4fbdf3c93ee62e6?pvs=204
- ローカル正本: `docs/specs/legacy-asset-audit.md`
- 再取得確認: 51 pass、ファイル単位の移植/破棄判断、秘密候補の隔離、Goal移植ゲートを確認

## 独立レビュー

- 名称: Goal開始前・独立レビュー結果（PASS）
- Page ID: `3bb1548a-971b-8129-8c0e-f5b65209abe3`
- URL: https://app.notion.com/p/3bb1548a971b81298c0ef5b65209abe3?pvs=204
- ローカル正本: `docs/specs/pre-goal-independent-review.md`
- 再取得確認: 2026-08-14在庫追補、AC-001〜AC-055、TA-001〜TA-037、AC-050/TA-032の2人確認条件、最終PASS、Critical 0 / High 0 / Medium 0 / Low 0を確認

## 更新ルール

1. Goal開始前はユーザーの最終承認を待つ。
2. 仕様変更は先にローカル正本と `docs/DECISIONS.md` へ記録し、その後Notionへ反映する。
3. 対象ユーザー、公式操作境界、税務AI境界、標準ホーム、課金区分、主要導線を変える場合は再承認する。
4. APIキー、トークン、住所、取得原価、利益、税務証憑などの機密情報は仕様ページへ保存しない。
