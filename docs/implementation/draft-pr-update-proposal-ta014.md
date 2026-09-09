# Draft PR #9 更新案 — TA-014通常バックアップ復元

> ローカル提案だけです。2026-09-08のGoalではGitHubへ送信していません。

## タイトル案

`fix: make checked-code helpers safe for normal PostgreSQL restore`

## 本文案

### 概要

- 既存migration 0015を変更せず、forward migration 0040で管理番号検査関数の`search_path`を固定し、内部呼出しを`public.`修飾しました。
- 架空データの通常`pg_dump`→空DBの`pg_restore --single-transaction`を再現可能なローカル試験として追加しました。
- 全テーブル値、関連、RLS、sequence、原本写真、監査、復元後runtime roleを照合します。
- 接続先をPC内IPv4 `127.0.0.1`へ限定し、継承`PG*`、接続文字列化、生stderr、写真symlink/junctionによる境界越えを拒否します。

### 主な変更

- `packages/db/migrations/0040_restore_safe_checked_code_helpers.sql`
- `packages/db/src/restore-safe-code-helpers.test.ts`
- `apps/api/src/postgres-restore-integration.ts`
- `apps/api/src/postgres-restore-safety.ts`と対応test
- `apps/api/src/postgres-upgrade-integration.ts`
- root/APIの`test:postgres-restore` scriptとmigration版期待値
- 復元証拠、AC/TA対応表、実iPhone確認表

### 検証

- 修正前: 通常restoreは`app_code_check_digit(text) does not exist`でFAIL。
- 修正後: 70 tables / 48 rows、全行SHA-256 `3570429b1b2780eaaef40068cf56ea9dc3b53841fed9f0af4a4595f3b28ca9c8`、244 FK、原本写真manifest SHA-256 `6b69dd2eadaa20d06cac61e97c6321994e95ec27894b9586790d7c64eecd5858`、監査SHA-256 `c8446a645a97016171dcbeb2e29ce98991a62dd3663175d6a1aaeea4a3c0edcc`が一致。
- fresh PostgreSQL: 39 migrationと全必須DB試験PASS。
- upgrade PostgreSQL: 0001〜0040、0040途中失敗rollback・再接続・再適用、既存履歴保持PASS。
- `npm.cmd run check`: 50 files / 431 tests、coverage lines 89.06% / branches 80.93%、format/lint/typecheck/API/Web build PASS。
- 独立Astra medium再レビュー: PASS、Critical 0 / High 0 / Medium 0 / Low 1。

### 残件と境界

- Low 1: IPv6 URLは現在のpostgres.jsで安全側に接続失敗するため、手順は検証済みIPv4 `127.0.0.1`限定です。
- TA-014はPASS。TA-026は実providerのバックアップ頻度・RPO/RTOが未計測です。
- 実iPhone、物理印刷、固定10商品pilot、実Money Forward取込は人手確認待ちです。
- モバイル内の固定`9:41`、Dynamic Island、電波/Wi-Fi/電池はローカル実装で削除済みですが、公開Pagesは今回更新していません。
- 外部API、課金、production DB、GitHub Pages、本番公開、PR ready化、PR mergeは含みません。

## 更新前の確認

1. リポジトリの公開範囲と送信許可を別Goalで再確認する。
2. 現在の未commit差分からPRへ含める対象を明示し、他担当の差分を勝手に混ぜない。
3. 最新候補で必要な検証を再確認し、Draftのまま更新する。
4. Pagesや実APIを「完成版」と表示しない。
