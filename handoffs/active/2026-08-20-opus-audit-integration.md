# Handoff: Opus第二次監査の統合

- Status: goal-v2-cost-optimized-evaluation-loop
- Owner: Codex / ユーザー
- Updated: 2026-08-21 JST
- Branch: `codex/opus-audit-integration`
- Worktree: `C:\Users\softt\Documents\Codex\2026-08-13\iphone-notion-google-research-ios-pc\_worktrees\opus-audit-integration`
- Base: `origin/main` / `f5fd9f3bda1ec2b82ba17e673f6d1715e7c1795a`

## 目的

Claude Codeの `claude/opus-spec-audit-proposals` を現main、既存仕様、承認済みモック、実装証拠と照合し、採用分だけを安全に仕様・モック・Goalへ反映する。

## 完了条件

- ユーザーが統合方針を一つ承認する。
- 承認済み範囲だけの高精度モックを生成し、必要な場合はSlackで再承認する。
- ローカル仕様、技術設計、数式正本、AC/TA、Goal契約、decision、Notion共有ミラーを整合させる。
- Goal再開前の完成契約をユーザーが確認する。
- 受け入れ条件、必須検証、重大・高重要度0件、独立レビュー、Draft PRまで進める。
- PRマージ、本番公開、有料サービス利用は行わない。

## 変更禁止範囲

- 承認前の画像生成、Slack投稿、仕様本文、Goal、実装変更。
- Mercari等の外部サービスへのruntime接続、自動出品・自動値下げ、スクレイピング、RPA、非公開API。
- 税区分や申告方式の推測、自動税務判断。
- mainへの直接変更、既存worktreeの上書き、PRマージ、本番公開、有料化。

## 完了したこと

- app-development-orchestratorと必須参照文書を再読した。
- 監査ブランチ `8e70673` を取得し、基点が実装前の `c6ed4e6` であることを確認した。
- 現main `f5fd9f3` の仕様、実装、AC対応表、画面証拠、承認済みモックと18件を再照合した。
- `docs/reviews/2026-08-20-opus-audit-reconciliation-v1.md` に再判定、推奨3案、必要モック、反映先を保存した。
- `inbox/2026-08-20-opus-audit-decisions.md` に次工程を止める判断だけを保存した。
- 2026-08-20、ユーザーが推奨Aを明示承認した。同一SKU複数個体と既存在庫移行はP1、古物台帳生成はP0対象外、10商品pilot中央値5分以下は当面の効率目標とする。
- M13/W11/M14/W12を生成し、原寸目視、寸法、bytes、SHA-256を確認した。W11は選択行と詳細の状態矛盾を限定修正し、v3だけを承認対象とした。
- Slack `#メルカリ自動化` の親TS `1787201164.618709` へ説明を送り、同じthreadへ4画像を添付した。再取得で親1件・画像4件を確認した。
- Slack返信TS `1787201696.138589` を再取得した。これは承認ではなく、24時間待機、Money Forward向けCSV、勘定科目候補の自動入力、用語ヘルプに関する質問・修正希望である。
- ユーザーは会話内で「修正版Aでお願いします」と明示した。24時間待機を廃止し、同一sessionでの即時・可逆な紛失候補、Money Forward指定CSV、勘定科目候補の自動入力、用語ヘルプを採用する。
- 修正版M13 v2、W11 v4、M14 v2、W12 v2を各1回だけ生成し、原寸目視、寸法、bytes、SHA-256を確認した。再生成・編集は不要と判定した。
- `docs/design/revised-a-approval-v2.md` に承認対象、固定内容、検証結果を記録した。
- Slack `#メルカリ自動化` の新しい親TS `1787203224.255009` へ修正版Aの説明を送り、同じthreadへM13 v2、W11 v4、M14 v2、W12 v2を添付した。再取得で親1件・画像4件を確認した。
- ユーザー本人がSlack返信TS `1787203707.087749` で「修正版4画面で承認」と明示した。修正版AのUI/UX承認ゲートは完了した。
- ローカルのMVP仕様、技術設計、財務数式正本、AC/TA、Goal再開契約、design index、review、decision、実装対応表を修正版Aへ更新した。旧Goal契約v1は履歴として残し、v2を現行契約にした。
- 既存NotionのMVP/技術/Goal/実装計画へ修正版Aの追補を行い、再取得でAC-056〜061、TA-038〜043、外部送信0件、Iteration 25を確認した。初回の25列表現は、公式再確認後にA〜AA 27列へ訂正した。既存本文と子ページは削除していない。
- 独立仕様review初回のCritical 1 / High 4 / Medium 4を受け、P0/P1範囲、紛失候補遷移、重複規則、数式、Money Forward A〜AA 27列/汎用19列schema・fixture/hash、3秒/keyboard確認、membership lock、pilot手順、UI採点表を修正した。Notionも訂正し再取得した。
- 独立再reviewは最終PASS（Critical 0 / High 0 / Medium 0 / Low 0）。残る停止gateは、25列理解を公式A〜AA 27列へ訂正した点を含むGoal再開契約v2のユーザー確認だけである。
- 2026-08-20、ユーザーは「この契約でGoalを再開してください」と回答し、Money Forward A〜AA 27列を含むGoal再開契約v2を最終確認した。P0実装と評価Loopを再開する。
- NotionのGoalページと実装計画へ再開確認/Iteration 26を追記し、A〜AA 27列、AC-056〜061/TA-038〜043、P1/公開/merge禁止を再取得確認した。
- migration 0021〜0024、可逆な棚卸差異、会計profile・承認済みmapping・27列/19列CSV、server-side pilot event、Home CのDB集計を実装した。
- Slack承認画像との再照合で、M12の比較route混同とM13/M14の全工程縦積みを検出した。在庫現場は`/mobile`・`/mobile/scan`、棚卸と会計はスマホ工程切替へ修正し、PCワークベンチを維持した。
- `npm.cmd run check`は22 files / 143 tests、line 90.47%、branch 80.56%、functions 100%、production buildまでPASSした。
- fresh PostgreSQLは0001〜0024、49-table RLS matrix、既存データupgradeは0001〜0024をPASSした。実10商品pilotではなく、1商品完了＋1商品意図的中断の計測基盤確認である。
- 本番相当ローカルブラウザで390×844、768×1024、1440×1000の横overflow 0px、対象6routeのconsole error 0件を確認した。証拠は`docs/implementation/design-fidelity-evidence.md`。

## 未解決事項

- 実iPhone Safariでのホーム画面追加、カメラ、圏外復帰。
- `docs/specs/pilot-protocol-v1.md`に従う実際の10商品pilot。
- `docs/specs/ui-evaluation-rubric-v1.md`の8 task独立完走と最終採点。
- 上記が未完了のためDraft PRは未作成。P1、本番公開、PR mergeも未実行。
- Goal管理機能には旧契約がpaused表示で残る。製品判断は承認済みの`docs/specs/goal-contract-revised-a-v2.md`を正本とし、旧Objectiveを実装根拠にしない。

## モデル割当と切替ゲート

- 実装運転モード: `cost-optimized`。ユーザーが2026-08-21にコスト削減を明示指定した。
- 正本: `docs/implementation/model-routing-plan.md`。
- Luna max: 承認済みUI/CSS、固定テスト、画面証拠、結果文書だけ。
- Terra high/xhigh: Home内訳のような限定された複数層統合、UI 8 taskの検証専任。
- Sol max: pilot/migration 0025、金額・会計、認証・RLS・重要状態、昇格判断、最終独立レビュー。
- 現在のゲート: モデル設計は別Sol maxがCritical 0 / High 0 / Medium 0でPASS。`MODEL_SWITCH_REQUIRED` なし。モデル別の適格な委譲先は利用可能。
- P01: Sol maxが0021〜0025を変更せず0026を追加。targeted 37 tests、全typecheck、fresh PG 49-table RLS/P0結合、既存データ0001〜0026 upgradeをPASS。P01は完了。
- 書込み: 共有worktreeのため常に1担当。並列化は読み取り専用レビューだけ。
- 人手gate: 実10商品pilotは人が実施し、モデルで代行・補完しない。
- 最終review: 実装・設計審査をしていない別Sol maxが凍結差分をレビューする。

## 次の一手

1. P02の最新画面比較をLuna maxへ直列委譲する。
2. P04の全自動検証、P05のUI 8 task、P06の実10商品pilotを順に行う。
3. 証拠更新後に別Sol maxが凍結差分を独立レビューする。
4. Critical/High 0、UI 90点以上、pilot合格後だけ、外部書込み権限を再確認してDraft PRを作成する。本番公開とmergeは行わない。

## memory候補

なし。監査ブランチが古い基点だった事実は今回固有で、現時点では再利用可能なlessonへ昇格しない。
