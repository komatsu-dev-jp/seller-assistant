---
id: INC-20260829-012
type: incident
category: implementation-fidelity
status: candidate
created_at: 2026-08-29
verified_at: null
review_after: 2026-09-05
owner: Codex
scope:
  - approved-ui
  - runtime-integration
  - acceptance-evidence
evidence:
  - apps/web/src/app/mobile/screens/[screen]/page.tsx
  - apps/web/src/app/pc/[screen]/page.tsx
  - docs/implementation/approved-ui-fidelity-audit-2026-08-27.md
  - docs/implementation/acceptance-map.md
duplicate_of: null
promoted_to: null
---

# 期待した結果

Slackで承認されたP0画面が見た目を忠実に再現し、主要ボタンと状態が既存の認証済みAPI・PostgreSQLへ接続される。P1の確認用画面は「準備中」と明確に分離され、見た目の合格と機能の合格を別々に追跡できる。

# 実際の結果

モバイル75画面とPC52画面は操作可能なHTMLとして視覚比較に合格した。一方、`mobile/screens/[screen]`は`ApprovedMobileDemo`、`pc/[screen]`は`ApprovedPcDemo`を静的に返し、承認UI component群から`/v1` API、workspace、server actionへの接続は0件だった。旧実運用画面と安全なbackendは残っているが、最新承認UIから同一SKUを一気通貫で処理した証拠にはならない。

# 影響

- Draft PR #9はUI確認用の下書きとしては有効だが、Goal全体の合格証拠にはできない。
- AC-001、AC-002、AC-025、AC-028、TA-015、TA-036の証拠が弱い。
- 見た目のP0/P1差異0件だけで、保存・権限・状態遷移まで完成したと誤認する可能性がある。

# 再現方法

1. `apps/web/src/app/mobile/screens/[screen]/page.tsx`と`apps/web/src/app/pc/[screen]/page.tsx`を確認する。
2. 承認UI component群で`fetch(`、`/v1/`、`workspaceId`、server actionを検索する。
3. 視覚監査の127/127合格と、`docs/implementation/acceptance-map.md`のP12〜P14待ち・主要E2E未更新を照合する。

# 原因

暫定原因は、視覚忠実度gateを「承認画像と同じ見た目」に限定した一方、最新画面を実運用APIへ接続する別gateと同一SHAの主要E2Eを実装順へ明示しなかったこと。原因は修正・独立再検証後に確定する。

# 修正

一部完了。P12-Aで検品結果と気になる箇所の追記履歴、同一SKU写真、別担当者確認、最新状態の完全一致、担当権限とRLSを`0034`と公開contractへ追加した。静的review routeは回帰比較用として維持する。P12-B API・非公開写真、P12-C実運用画面、P13/P14は未完了。

# 検証

一部完了。P12-Aはfresh/upgrade PostgreSQL 18.6、2接続の同時訂正、34 files / 253 tests、coverage、build、独立Sol review Critical/High/Medium/Low 0をPASSした。承認デザインからの実API主要E2E、P12-B/C、同一commit SHAの最終画面比較と外部runtime通信0件は未完了。

# 再発防止の候補

- UI忠実度gateとruntime接続gateを別の必須列としてAC/TAごとに記録する。
- 「操作可能なHTML」を、保存先と状態遷移があるという意味に使わない。
- 承認画面を追加・置換した後は、同じ画面からのAPI契約テストと主要E2Eがない限り完成扱いにしない。

# 独立レビュー担当

2026-08-29、実装担当ではない別Sol maxが読み取り専用監査を行い、Critical 0、High級ブロッカーとして本件を報告した。P12-Aの修正後再レビューはCritical 0 / High 0 / Medium 0 / Low 0でPASSしたが、本incident全体はP12-B/Cと主要E2Eが未完了のためcandidateを維持する。

秘密情報、個人情報、生ログ、実データ行は記録していない。
