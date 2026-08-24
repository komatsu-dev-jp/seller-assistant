---
id: INC-20260824-002
type: incident
category: local-network-security
status: candidate
created_at: 2026-08-24
verified_at: null
review_after: 2026-08-25
owner: Codex
scope:
  - apps/web/package.json
  - apps/web/src/pwa-contract.test.ts
evidence:
  - docs/implementation/loop-log.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

完全ローカル運用のWeb画面は、`127.0.0.1`（このPC自身だけを示す住所）だけで待ち受ける。

# 実際の結果

`next start`をホスト指定なしで起動すると、検証用Webサーバーが`0.0.0.0`と`[::]`で待ち受けた。検証時のブラウザ通信はすべて`127.0.0.1`で、外部通信は0件だった。

# 影響

本番公開前の架空データだけの検証で発見したため、確認済みの情報漏えいは0件。OSのファイアウォールやネットワーク条件によっては、同じネットワークの別端末から到達できる余地があった。

# 再現方法

修正前の`apps/web/package.json`にある`next start`を、`--hostname`なしで起動して待受アドレスを確認する。

# 原因

ローカル専用という製品境界を、Next.jsの起動コマンドへ明示していなかった。

# 修正

Webの`dev`と`start`へ`--hostname 127.0.0.1`を固定し、package manifestの契約テストを追加した。

# 検証

修正版の検証起動で`127.0.0.1:4173`だけが待ち受け、Web応答200を確認した。最終差分の`npm.cmd run check`は29 files / 202 tests、lint、typecheck、coverage、API/Web buildまでPASSした。

# 再発防止の候補

ローカル専用サービスを追加するときは、起動コマンドのloopback固定と実待受アドレスの確認を受け入れ条件へ含める。

# 独立レビュー担当

未実施。Goal凍結後の独立レビューで確認する。
