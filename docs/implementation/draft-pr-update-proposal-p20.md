# PR #9 最終本文 — P0 Codex側完了候補

> 2026-09-09に利用者がPR作成・mergeを明示承認し、無料の自動CI・Pages公開も確認後に承認しました。

## タイトル案

`feat: complete the local-first P0 resale operations workflow`

## 本文案

### 概要

- 承認済みモバイル75画面・PC52画面を保持し、P0 90画面を認証済みlive routeへ対応づけました。
- 仕入証憑、商品写真、採寸、商品調査の手動受け渡し、内部在庫番号、場所と写真、二重読取、注文、発送写真、返品、棚卸、担当変更、会計候補をローカルAPI/PostgreSQLへ接続しました。
- 原本と住所を非公開にし、人の確認、役割・期限付き担当、RLS、冪等性、追記監査を維持しました。
- 外部API、自動出品、自動値下げ、スクレイピング、RPA、有料サービスを追加していません。

### 最終検証

- `npm.cmd run check`: 63 test files / 580 tests PASS
- merge直前の必須ローカルgate: `npm test`、`npm run lint`、`npm run build` PASS
- Coverage: statements 83.93%、branches 81.06%、functions 92.06%、lines 89.50%
- Fresh PostgreSQL: 45 migrations through `0046` PASS
- Existing-data upgrade: `0001`→`0046`、履歴保持・rollback・再適用 PASS
- Normal restore: 73 tables / 316 rows / 253 FK / private files 23、DB・file・audit hash一致
- Live browser: 10 routes × 3 viewports = 30/30、overflow / console / page error / external request各0
- Approved UI: mobile 75 + PC 52 = 127/127、missing 0、external resource 0、比較25 sheets
- Secret scan: 449 text files、未承認0。オフライン依存監査0 vulnerabilities
- Independent final review: Critical 0 / High 0 / P0-blocking Medium 0 / Low 2

### P0チェックリスト

- 完了: 83 / 94（88.3%）
- AC: 45 / 52
- TA: 38 / 42
- Codex側の未完了: 0
- WAITING_HUMAN: 11

人手待ちは、実iPhone Safari・カメラ・ホーム画面追加・オフライン復帰、実Code 128、A4 24面物理印刷、固定10商品pilot、Money Forward公式取込、商品別写真項目の最終判断です。自動試験の合格で代用していません。

### 既知のLow

1. 復元接続は実証済みIPv4 `127.0.0.1`を正式手順とし、IPv6 URL互換は未確認です。
2. 未公開migration 0043単独版のpending担当変更は0046後に互換問題となり得ます。今回の一括適用候補には該当しません。

### Rollback

- 適用前にDBと非公開media rootを同じ時点で保存します。
- DBは通常`pg_dump --format=custom --no-owner`、復元は空DBへ`pg_restore --exit-on-error --single-transaction --no-owner`を使います。
- 商品、レシート、場所原本/派生、棚卸差異、発送の全private fileをDB参照と同じmanifestで保存・SHA-256照合します。
- 問題時は既存環境を上書きせず、空の別DB・別media rootへ復元してから切替判断を人が行います。

### PR境界

- PR headに一致するCIが成功してからready化・mergeする。
- merge commitに一致する`main` CIとGitHub Pagesが成功するまで公開完了としない。
- 実データ、秘密情報、検証用DB・media、`output/`をPRへ含めない。
- 公開リポジトリの標準`ubuntu-latest`だけを使い、larger runner、macOS runner、有料Action、外部runtime APIを使わない。
- force push、管理者override、required checkの迂回、remote branch削除を行わない。
