# Notion同期記録

- 状態: 在庫ロケーション版に加え、完全無料PWAへの方針変更と実装進捗を同期・再取得検証済み
- 確認日: 2026-08-15（JST）
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
- 再取得確認: 18章、P0/P1、M12/W10、在庫管理番号/場所階層/位置写真/二重読取/棚卸差異、AC-001〜AC-055、完全無料PWA方針、対象外、子ページ参照を確認

## 技術設計

- 名称: 技術アーキテクチャ・データ境界 v1
- Page ID: `3bb1548a-971b-81ab-9ab0-d0246d7de566`
- URL: https://app.notion.com/p/3bb1548a971b81ab9ab0d0246d7de566?pvs=204
- ローカル正本: `docs/specs/technical-architecture-v1.md`
- 再取得確認: ローカル正本はNext.js PWAへ更新済み。Notion親仕様と実装計画は完全無料PWAへ同期済み。技術設計子ページの全文置換は行わず、次回の正本一括同期対象とする

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

1. Goalは開始済み。P0合格前にP1を開始しない。
2. 仕様変更は先にローカル正本と `docs/DECISIONS.md` へ記録し、その後Notionへ反映する。
3. 対象ユーザー、公式操作境界、税務AI境界、標準ホーム、課金区分、主要導線を変える場合は再承認する。
4. APIキー、トークン、住所、取得原価、利益、税務証憑などの機密情報は仕様ページへ保存しない。

## 2026-08-15 PWA同期

- 親MVP仕様: 状態、対象、モバイル見出し、検証、リスク、未確認事項をPWA/Mac不要へ更新し、再取得確認済み。
- 実装計画: SwiftUI/macOS ActionsをPWA/Windowsローカル検証へ更新し、P0一気通貫画面、47テスト、会計CSV、Service Workerの進捗を追記し、再取得確認済み。
- タスク: `Build: iOS P0現場導線` を `Build: モバイルPWA P0現場導線` へ変更し、進捗を `進行中` に更新。Page ID `3bc1548a-971b-811c-9aad-fc9bcb44317a`。
- タスク本文: SwiftUI固有のObjective/Acceptance Criteria/Technical DetailsをPWAへ置換し、47テストとP0画面完走、残るAPI/DB/iPhone実機項目を再取得確認済み。
- 写真・採寸API: 原本変更不可、別SKU証拠拒否、再測定警告、50テスト、実Storage/実PostgreSQL未確認を実装計画へ追記し、再取得確認済み。
- 認証・ログアウト: 署名Cookie、server session失効、失効成功後だけのPWA端末データ削除、57テスト、API未接続503停止を実装計画へ追記し、再取得確認済み。
- CSRF/Origin: APP_ORIGIN完全一致、cross-site拒否、Web中継の固定Origin、60テスト、実配置未確認を実装計画へ追記し、再取得確認済み。
- 無料ログイン: Node.js標準scrypt、平文保存0件、5回/15分停止、署名Cookie、一回限りowner CLI、69テスト、PC/390×844画面、実PostgreSQL未確認を実装計画へ追記し、再取得確認済み。
- 実PostgreSQL: 0001〜0006、制限runtime role、管理者接続拒否、初期owner、login、workspace越境拒否、rate limit、logout後拒否、71テストを実装計画へ追記し、再取得確認済み。
- 在庫不変条件: 0007、商品/場所の二重読取、scan再利用拒否、同時格納/同時引当の1件だけ成功、棚卸の別担当確認、72テストを実装計画へ追記し、再取得確認済み。
- PWA格納/圏外復旧: session固定workspace、0008、格納API、同一操作再送、PWAオンライン保存、圏外保留→復帰同期、API cache除外、実DBの移動/監査各1件、76テスト、外部費用0円を実装計画へ追記し、再取得確認済み。秘密情報形状0件。
- RLS/外注割当: 22業務テーブルRLS、破壊的業務grant 0件、field_workerのSKU/仕入拒否、場所枝/作業/期限付き担当、担当なし/担当外403・担当内201、0001〜0009、77テスト、外部費用0円を実装計画へ追記し、再取得確認済み。秘密情報形状0件。
- 割当解除後の端末消去: 401/403の同期待ち消去、409競合/5xx保持、実画面で消去1・同期0・残り0、77テスト、外部費用0円を実装計画へ追記し、再取得確認済み。秘密情報形状0件。
- 外部費用: 有料API、有料SaaS、従量課金、外部CI、デプロイ0件。
