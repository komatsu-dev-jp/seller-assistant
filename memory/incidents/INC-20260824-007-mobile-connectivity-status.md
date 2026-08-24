---
id: INC-20260824-007
type: incident
category: offline-ux-integrity
status: candidate
created_at: 2026-08-24
verified_at: 2026-08-24
review_after: 2026-08-25
owner: Codex
scope:
  - apps/web/src/components/mobile-capture-workspace.tsx
  - apps/web/src/lib/capture-outbox.ts
evidence:
  - docs/specs/ui-evaluation-rubric-v1.md
  - docs/implementation/design-fidelity-evidence.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

端末がofflineへ変化したeventを受けたら、接続状態の文言と次の操作案内を画面へ即時反映し、online復帰後は端末内保持とretry状態を明示する。

# 実際の結果

offline eventを受けても接続状態の文言が変わらず、利用者が現在の送信状態を画面だけで判断しにくかった。データは端末内に保持され、勝手な送信や削除は発生しなかった。

# 影響

外部送信、データ消失、重複送信は0件。ただし、offline中の状態表示が古いままで、retry disabledの理由が初心者へ伝わりにくかった。

# 原因

offline/online eventの状態更新がcapture画面の表示用stateへ伝播しておらず、outboxの保存状態だけが更新されていた。

# 修正

接続eventを表示用stateへ反映し、offline文言、端末内保持、online復帰後のretry案内を日本語で表示する。外部送信は行わず、retryはonline時だけ有効にした。

# 検証

対象23 tests、Web typecheck/build、full `npm.cmd run check`（29 files / 202 tests）がPASSした。P05独立Terra 100/100でmobile online→offline→online、端末内保持、retry disabled、console 0、runtime request `127.0.0.1`のみを確認した。candidateは独立P08レビュー待ちで、memory INDEXには追加しない。

# 再発防止の候補

offline/online event、端末内保持、retry可否、状態文言を同一UI試験で確認し、consoleとnetwork境界も同時に記録する。

# 独立レビュー担当

未実施。Goal凍結後の独立レビューで確認する。
