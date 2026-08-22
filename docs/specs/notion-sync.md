# Notion同期記録

- 状態: 修正版AとGoal再開確認をNotion共有ミラーへ追補し、再取得検証済み
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
- 再取得確認: 前版18章と子ページ参照を保持したまま、2026-08-20追補、M13/W11/M14/W12、AC-056〜AC-061、Slack承認TSを確認。

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
- 再取得確認: 前版を保持したまま、Goal再開契約v2、AC-001〜061、TA-001〜043、無料PWA、Draft PR/merge禁止を確認。

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

1. ユーザーは2026-08-20にGoal契約v2を確認し、P0実装再開を指示した。Goal管理機能の旧表示はpausedかつ旧契約のままなので、実装判断には使わず、承認済みのローカル契約v2を正本とする。現行P0合格前にP1を開始しない。

## 2026-08-20 Goal再開確認の同期結果

- Goalページへ「Goal再開確認」を追記し、ユーザー確認文、A〜AA 27列、旧Objectiveを履歴扱いにする境界を再取得した。
- 実装計画へIteration 26を追記し、AC-056〜061/TA-038〜043、基準測定、未確認の実iPhone、P1/公開/merge禁止を再取得した。

## 2026-08-20 修正版A 同期結果

- ローカル正本: `mvp-product-spec-v1.md`、`technical-architecture-v1.md`、`financial-formulas-v1.md`、`goal-contract-revised-a-v2.md`、`acceptance-map.md`。
- 変更範囲: 1人時の即時・可逆な紛失候補、2人以上の別担当確認、P0不可逆操作禁止、会計profile/mapping、Money Forward/汎用CSV分離、用語help、AC-039/056〜061、TA-038〜043。
- Slack証拠: 親TS `1787203224.255009`、承認返信TS `1787203707.087749`。
- 更新先: MVP `3bb1548a-971b-81fc-9c03-db521b930b50`、技術 `3bb1548a-971b-81ab-9ab0-d0246d7de566`、Goal `3bb1548a-971b-8185-bb0d-ecb105980aad`、実装計画 `3bc1548a-971b-81fd-9ddc-c17dfacb34eb`。
- 既存本文・子ページを削除せず末尾追補した。初回再取得では4ページの修正版見出し、現行AC/TA、当時の25列表現、外部送信0件、Goal契約/Iteration 25を確認した。その後、公式A〜AA 27列へ訂正した。
- 独立review修正後、Money Forward A〜AA 27列/汎用19列、P0必須AC/TA、`missing_candidate → restored`限定、3秒keyboard同等確認、二段階重複規則へ再同期した。4ページを再取得し、旧25列表現を現行追補から除去したことと修正語を確認した。
- 独立再review最終PASS（Critical 0 / High 0 / Medium 0 / Low 0）をGoal/実装計画へ追補し、再取得でPASS、A〜AA 27列、ユーザー最終確認待ちを確認した。
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
- 場所写真: 原本metadata不変、撮影者と承認者分離、担当外撮影403、審査中一覧0、GPS 0件派生の別担当承認、承認後一覧1、原本key非返却、0001〜0010、79テスト、画像本体Storage未完了、外部費用0円を実装計画へ追記し、再取得確認済み。秘密情報形状0件。
- 無料PC内MediaStore: Node.js標準機能だけの原本不変保存、JPEG/PNG位置metadata除去、同一再送、異bytes/越境拒否、失敗時表示0件、83テスト、upload/PWA/HEIC未接続、外部費用0円を実装計画へ追記し、再取得確認済み。秘密情報形状0件。
- Iteration 17〜19: 管理画面のserver session/role保護、SKU別capture割当、実bytes upload、API算出SHA/key、別担当承認、GPS除去済みcontent API、0001〜0011、23業務テーブルRLS、86テスト、外部費用0円を実装計画へ追記。`Iteration 17–19`、`23業務テーブルRLS`、`17 test files / 86 tests`、`P0ゲート未達`を再取得確認済み。
- 外部費用: 有料API、有料SaaS、従量課金、外部CI、デプロイ0件。
