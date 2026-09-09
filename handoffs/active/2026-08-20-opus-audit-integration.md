# Handoff: Opus第二次監査の統合

- Status: goal-v2-p15-mobile-header-verified-draft-pr-update
- Owner: Codex / ユーザー
- Updated: 2026-09-03 JST
- Branch: `codex/opus-audit-integration`
- Worktree: `C:\Users\softt\Documents\Codex\2026-08-13\iphone-notion-google-research-ios-pc\_worktrees\opus-audit-integration`
- Base: `origin/main` / `9c4033f09f60971aca5e4876f1ca21c31cb80738`

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
- 独立再reviewは最終PASS（Critical 0 / High 0 / Medium 0 / Low 0）。当時の残る停止gateは、25列理解を公式A〜AA 27列へ訂正した点を含むGoal再開契約v2のユーザー確認だけだった。その後、2026-08-20にユーザー確認済み。
- 2026-08-20、ユーザーは「この契約でGoalを再開してください」と回答し、Money Forward A〜AA 27列を含むGoal再開契約v2を最終確認した。P0実装と評価Loopを再開する。
- NotionのGoalページと実装計画へ再開確認/Iteration 26を追記し、A〜AA 27列、AC-056〜061/TA-038〜043、P1/公開/merge禁止を再取得確認した。
- migration 0021〜0024、可逆な棚卸差異、会計profile・承認済みmapping・27列/19列CSV、server-side pilot event、Home CのDB集計を実装した。
- Slack承認画像との再照合で、M12の比較route混同とM13/M14の全工程縦積みを検出した。在庫現場は`/mobile`・`/mobile/scan`、棚卸と会計はスマホ工程切替へ修正し、PCワークベンチを維持した。
- Iteration 27時点の`npm.cmd run check`は22 files / 143 tests、line 90.47%、branch 80.56%、functions 100%、production buildまでPASSした。
- Iteration 27時点のfresh PostgreSQLは0001〜0024、49-table RLS matrix、既存データupgradeは0001〜0024をPASSした。実10商品pilotではなく、1商品完了＋1商品意図的中断の計測基盤確認である。
- Iteration 27時点の本番相当ローカルブラウザで390×844、768×1024、1440×1000の横overflow 0px、対象6routeのconsole error 0件を確認した。証拠は`docs/implementation/design-fidelity-evidence.md`。
- migration 0027〜0031でsolo/dual承認、完全な承認metadata、mapping世代交代、同一場所復元、actor/movement snapshot競合を補強した。`c63eb5b`の全checkは25 files / 180 tests、fresh/upgrade PostgreSQL、別Sol最終実装reviewをPASSした。
- `c63eb5b`でUI 8 taskを独立実行し、暫定96/100、Critical 0、High 0、Medium 1。通常3 viewportのoverflow 0、console error 0、外部runtime通信0を確認した。
- `6c68980`で棚卸差異の復元フォームだけを44px以上へ修正した。旧commitの暫定結果は現行実装の最終合格に流用しない。
- pilot開始が旧migration`0028`を固定する不整合を検出し、`21fbff4`で新規`0032`、共通版定数、過去response互換、最新migration一致test、fresh/upgrade試験を追加した。
- `21fbff4`の`npm.cmd run check`は25 files / 181 tests、coverage、API/Web production buildまでPASS。fresh PostgreSQL 0001〜0032と既存データupgrade 0001〜0032もPASSした。
- 固定10商品pilotをv1.1へ更新し、`WARMUP-01`＋10商品×4 PNG、架空属性、カテゴリ別採寸template、CHECKLIST、生成・整合確認を追加した。manifest SHAは`a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`。
- 新しいrunを`listing_prep_pilot_v1.1.0`、migration `0033`、manifest SHAへ固定し、v1.0の履歴を保持した。写真の最新role、採寸の最新attempt、属性のappend-only revision、manual correction記録をコードへ追加した。
- fresh/upgrade PostgreSQLはmigration `0033`までPASSした。最新root `npm.cmd run check`はfixture 44 PNG/hash一致、format、lint、typecheck、29 files / 202 tests、coverage、API/Web production buildまでPASSした。
- UI評価seedはsolo棚卸、dual棚卸、会計、captureの4つの独立workspaceを作成し、同じDB/media rootへの再実行を安全に拒否する。captureはTOP/OUTER 4、PANTS 5、KNIT `unstretched` 4、候補自動確定なし文言、390/768/1440 overflow 0、console error/warn 0を確認した。
- solo/dual棚卸は写真、二重読取、3秒確認、復元、承認までUI PASS。dualは元担当者承認409と別managerの`approved dual_actor`を確認した。会計seeded UIは7/7 human mappingとCSV出力まで確認した。
- 初回のmobile主要操作44px未満はFAIL。CSS/JSX修正後は390pxで主要操作44px以上、overflow 0、200%相当390×720でもoverflow 0、console 0/warn 0、request loopbackのみを確認した。
- Web broad bind incident後、package scriptsと契約testへ`127.0.0.1`固定を追加し、修正版runtime netstatは`127.0.0.1:4173`だけ、targeted 24 testsとWeb buildはPASSした。外部request、課金、merge、公開は0件。

## 未解決事項

- 実iPhone Safariでのホーム画面追加、カメラ、圏外復帰。
- seeded browser指定操作、P05独立最終評価100/100、P13-B/P14実運用ブラウザ、全127画面の同一ビルド再比較、最終凍結差分のSol再レビューは確認済み。
- 実利用者pilot、実iPhone Safariのhome/camera/offline/HEIC-WebP、実Money Forward import。
- `docs/specs/pilot-protocol-v1.1.md`に従う実利用者の`WARMUP-01`＋固定10商品pilot。
- `docs/specs/ui-evaluation-rubric-v1.md`のP05独立最終採点は100/100 PASS済み。14 PNGとtarget SHAを同文書へ記録した。
- 最終独立Sol再レビューはPASS（Critical 0 / High 0 / Medium 1 / Low 1）。PC29文言は利用者再承認待ち、0039実DB境界試験の追加は非blocking候補。
- Draft PR #9はOPEN/Draft。最新差分のcommit・push・本文更新、ready化、PR merge、本番公開は未実行。
- Goal管理機能には旧契約がpaused表示で残る。製品判断は承認済みの`docs/specs/goal-contract-revised-a-v2.md`を正本とし、旧Objectiveを実装根拠にしない。

## モデル割当と切替ゲート

- 実装運転モード: `cost-optimized`。ユーザーが2026-08-21にコスト削減を明示指定した。
- 正本: `docs/implementation/model-routing-plan.md`。
- Luna max: fixture生成、固定テスト、画面証拠、結果文書。
- Terra high/xhigh: Webの限定統合、UI 8 taskの検証・レビュー。
- Sol max: DB/API、migration `0033`、金額・会計、認証・RLS・重要状態、昇格判断、最終独立レビュー。
- 現在のゲート: モデル設計は別Sol maxがCritical 0 / High 0 / Medium 0でPASS。`MODEL_SWITCH_REQUIRED` なし。モデル別の適格な委譲先は利用可能。
- P01: migration `0033`までのfresh/upgrade PostgreSQLと、最新root check 29 files / 202 testsはPASS。P05独立100/100も確認済み。
- P02: 承認済みUIへの修正と、44px修正を含むseeded browser指定操作の再確認は完了。P05独立採点100/100を確認済み。
- P04: fixture 44 PNG/hash、format/lint/typecheck、coverage、API/Web buildを含む最新full checkはPASS。targeted loopback 24 testsとWeb buildもPASS。
- P05: target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`で独立Terra 100/100 PASS。実利用者pilot・実iPhone・実MF import・P08 Solは未実施。
- P06: 実利用者の`WARMUP-01`＋固定10商品は未実施。モデルで代行しない。
- P05.5/P06R: target application SHA `a976d614819a662cca3be36c23989aecd9ca968e`限定で独立Terra GO、Critical/High/Medium/Low 0、H-P06R-02 Closed。合成preflightは人P06の代替ではない。
- 書込み: 共有worktreeのため常に1担当。並列化は読み取り専用レビューだけ。
- 人手gate: 実10商品pilotは人が実施し、モデルで代行・補完しない。
- 最終review: 実装・設計審査をしていない別Sol maxが凍結差分をレビューし、Critical 0 / High 0でPASSした。

## 次の一手

1. P14-R1合格差分を限定commit・pushし、既存Draft PR #9の本文だけを最新証拠へ更新する。ready化、本番公開、mergeは行わない。
2. PC29の販売金額を「必須」か「任意」か、利用者の再承認後に承認画像・実画面・仕様・テストを同時に揃える。
3. 人手gateとして、利用者が`docs/specs/pilot-protocol-v1.1.md`どおり`WARMUP-01`＋固定10商品、実iPhone、物理ラベル、実Money Forward取込を確認する。
4. P12-B/Cは`p12-product-template-proposal-v1.md`の2項目を利用者が判断した後に再開する。
5. GitHub Actionsを自動実行のままにするか、手動実行だけにするか、利用者判断後に方針を確定する。

## 2026-09-03 最終レビュー指摘の修正と再検証

- 最初の凍結差分レビューはCritical 0 / High 1 / Medium 1 / Low 1。未入力の販売手数料・梱包費を0円にするHigh、読取時刻を1ms差で合成するMedium、0037/0038の注入失敗rollback不足Lowを修正した。
- 登録時は原価だけを保存し、販売額・手数料・梱包費を欠損のまま保持する。会計summary、新規CSV、再出力は主要事実が揃うまで停止する。forward migration `0039_registered_order_missing_financial_facts.sql`を追加し、既存0037/0038は変更していない。
- 読取時刻は入力一致時の実時刻へ変更した。実ブラウザ再走では商品→場所17.962秒、場所→確定21.614秒。注文より前の発送時刻は409で拒否し、訂正後だけ発送済みになった。
- 最終DBは原価1件・選択送料1件、未知の販売額・手数料・梱包費0件、匿名住所行0件、住所表示許可0件。会計preflightは新規/再出力とも不可、summaryは409で、未知値を0円や利益へ変換していない。
- 最新full checkは45 files / 401 tests、coverage 84.66 / 80.56 / 100 / 90.68、fixture 44 PNG/hash、format/lint/typecheck、API/Web production buildをPASSした。
- fresh `resale_p14_final_fresh_20260903f`とupgrade `resale_p14_final_upgrade_20260903e`は0001〜0039、restricted role、65-table RLS、0037/0038/0039の注入失敗rollback・再適用、既存データ保持をPASSした。
- 修正後buildのroute/capture/compareはモバイル75/75、PC52/52、合計127/127、viewport 127/127、欠落0、外部runtime resource 0、比較25シート。証拠は`output/playwright/root-all-fidelity-p14-final-finance-20260903`と`output/playwright/approved-ui-comparison/p14-final-finance-20260903`。
- 実運用画面の証拠は`output/playwright/p14-final-live-finance-20260903/pc32-shipped-anonymous.png`。PC29の「販売金額 必須」と「未入力でも続行」の意味上の矛盾は承認文言の問題として残し、利用者の再承認なしに変更しない。
- 修正後差分は新しい別Sol maxが読み取り専用で再レビューし、Critical 0 / High 0でPASSした。次は限定commit・pushとDraft PR #9本文更新だけを行う。ready化、merge、本番公開は行わない。

## 2026-09-03 最終独立再レビューPASS

- 書込みを担当していない別Sol maxが、全未commit差分、契約、API、repository、0037〜0039、RLS、写真の読取後再認可、会計停止、全127画面、証拠文書を読み取り専用で確認した。
- 判定はPASS、Critical 0 / High 0 / Medium 1 / Low 1。過去H1/M2/L1はすべてClosed。
- 独立`npm.cmd run check`も45 files / 401 tests、coverage 84.66 / 80.56 / 100 / 90.68、fixture、format/lint/typecheck、API/Web build、Next 86 routesをPASSした。
- MediumはPC29承認文言の矛盾で利用者再承認待ち。Lowは0039の細かな不整合を実DBで各々拒否する回帰試験の追加候補で、現行SQLの不具合ではない。
- Draft PR #9はDraftのまま最新化可。次は限定commit・push・本文更新だけを行い、ready化、merge、本番公開は行わない。

## 2026-09-03 P14-R1追加Loop

- Draft PR #9はcommit `e56953c26b4872ec51753f88017f7172dd95ed82`へ更新済みで、OPEN/Draft/MERGEABLEを確認した。ready化、merge、本番公開は未実行。
- Goal継続では、最終レビューのLowだった0039実DB境界試験を先に解消する。対象は原価0/2件、販売額・手数料・梱包費各2件、別SKU、異なる税設定の7ケース。
- P14-R1は金額・発送・DB制約の重大領域としてSol max専任writer、別Sol max reviewerへ割り当てる。変更可能は`apps/api/src/postgres-integration.ts`だけで、production SQL/API/Webは変更しない。
- 7ケースを独立transaction内で一時作成し、意図した不正形、金額以外の全発送前提、0039固有message/23514拒否、別接続からの全rollbackを確認した。直後の正常発送とlegacy/P13互換も同じ実行で合格した。
- fresh `resale_p14r_fresh_20260903a`の`test:postgres`、upgrade `resale_p14r_upgrade_20260903a`の`test:postgres-upgrade`をPASSした。初回fresh実行は古い検証プロセス多数と空きメモリ約662MBの環境でWindows異常終了したが、業務行0件を確認し、対象整理後の同一DB再実行はPASSして再発しなかった。
- `npm.cmd run check`はfixture 44 PNG/hash、format/lint/typecheck、45 files / 401 tests、coverage 84.66 / 80.56 / 100 / 90.68、API/Web build、Next 86 routesをPASSした。変更は実DB試験と証拠文書だけで、UI差分0件。
- 別Sol maxはCritical 0 / High 0 / Medium 0 / Low 0でPASSし、以前の0039試験不足LowをClosed、限定commit・pushとDraft PR本文更新を可とした。ready化、merge、本番公開は引き続き禁止する。

## memory候補

`INC-20260824-002-local-web-broad-bind` はcandidateとして保持する。loopback固定・targeted test・runtime netstatは確認済みだが、独立review前のためactive lessonへ昇格しない。

## 2026-08-29 承認済みUI忠実再現の最終結果

- モバイル基本49画面、追加26画面、PC52画面の合計127画面を実装し、最終正本と比較した。
- 最終撮影 `output/playwright/root-all-fidelity-final-fix23-20260829` はviewport 127/127合格、外部runtimeリソース0件。
- 最終比較 `output/playwright/approved-ui-comparison/root-all-fidelity-final-fix23-20260829` は127/127取得、欠落0件、25比較シート。
- 別Solによる全画面の独立目視再監査はP0 0件、P1 0件で合格。P2は端末上部表示とブラウザ文字描画の軽微差だけ。
- 静的レビュー版はモバイル75＋PC52 routeを含む766ファイルをprecacheし、Chromeの通信を完全遮断した状態でモバイル49とPC52をcache-storageから表示。`review-offline-fix23-20260829/offline-report.json` は `passed: true`。
- デザイン忠実再現gateは完了。実iPhone Safari、実利用者pilot、実Money Forward取込は人手の別gateとして未確認のまま維持する。
- 有料サービス、外部API、外部CDN、公開、本番反映、PRマージは実施していない。

## 2026-08-24 最終証拠追補

- 会計seeded UIは7/7 human mapping、Money Forward 27列5行CSV（1649 bytes、SHA-256 `e833a060cc7fef30fa90140fd4330e5523579d34e871d2fc061aeed349dc1e01`）をローカルdownloadで確認。税未設定はUI/API停止、旧CSV不変、実MF import未実施。
- 会計responsiveは1440/768/390/720（200%相当）overflow 0、主要button 44px以上、console 0/warn 0、loopbackのみ。solo/dual棚卸、capture TOPS、workflow 390pxの具体的確認結果は`acceptance-map.md`と`design-fidelity-evidence.md`の追補を正本とする。
- full checkは29 files / 202 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、lint/typecheck/API/Web build PASS。fresh/upgrade PG 0001〜0033、49-table RLS/immutable reason fields、rollback/preservation PASS。使い捨てDB削除済み、外部/paid/deploy/merge 0。
- 未確認は実利用者WARMUP＋10商品、実iPhone Safari/home/camera/offline/HEIC-WebP、実MF import、P08最終Sol review、Draft PR ready。P05 PASSでもGoal完了扱いにしない。

## 2026-08-25 P06R安全preflight GO

- 更新日: 2026-08-25 JST。root full check 31 files / 209 tests、fresh/upgrade PostgreSQL、synthetic preflight、独立Terra GOを確認した。
- P05旧SHA `02c464...`は履歴であり、P06Rの対象SHAはa976だけ。a976限定で人P06は開始可能。
- 初心者向けの人手操作とHAR機密保護は`docs/implementation/p06-human-run-guide.md`に固定した。HAR原本は`C:\tmp`だけに置き、Git、Slack、Notion、PRへ保存しない。
- 人`WARMUP-01`＋固定10商品、実iPhone、P08 Sol、Draft PRは未確認。合成preflightで人手結果を補完しない。

## 2026-08-25 iPhone用ローカルHTTPS中継

- PC用Web `127.0.0.1:4273`とAPI `127.0.0.1:3200`は変更せず、iPhone実機確認用のIP限定HTTPS中継を追加した。安全境界と削除手順は`docs/implementation/secure-lan-preview-guide.md`を正本とする。
- unit 17/17、full check 32 files / 226 tests、PC自己実走のTLS/login/CA/private-key denial/origin denial/Secure Cookie/session/workflow/logout/revocationはPASS。
- 実iPhone IPが未入力のため専用Firewall規則は未作成。実Safari/PWA/camera/offline/HEIC-WebPは未確認で、人の結果を待つ。

## 2026-08-25 GitHub Pages公開レビュー版

- ユーザーはGitHub上でスマホから画面を確認し、後から修正点を伝える入口を希望した。実運用アプリを公開せず、`.github/pages`の架空データのみ静的PWAを追加した。
- `index.html`は4画面（今日の確認、在庫現場、棚卸差異、会計候補）、下部ナビ、修正依頼テンプレート、公開レビュー境界を含む。`manifest.webmanifest`、`sw.js`、`icon.svg`、`commit.txt`を追加した。
- `pages.yml`は`.github/pages`全体をPages artifactへコピーするよう更新し、`workflow_dispatch`（手動起動）のみ維持した。Pages siteはまだ未有効化、push・workflow実行・公開URL確認は未完了。
- ローカル静的HTTPとPlaywrightで、manifest/sw/icon/index、4画面切替、dialog、390×844スクリーンショット、console error/warn 0を確認した。`output/playwright/gh-pages-review-desktop.png`、`gh-pages-review-mobile.png`はローカル証拠であり公開データではない。
- Pages公開用変更は`codex/opus-audit-integration`へpush済み。Pagesはworkflow方式で有効化済み。既存`github-pages`環境がmain限定のため、保護を弱めず`github-pages-preview`環境へ切り替え、workflow run `32802062930`をsuccessにした。公開URLは`https://komatsu-dev-jp.github.io/seller-assistant/`で、実ブラウザ390×844の表示、manifest/sw/icon/commit、在庫画面切替を確認した。実iPhone Safariのホーム画面追加はユーザー確認待ち。PRマージ・本番API公開は行わない。

## 2026-08-24 P05最終PASS追補

- 14 PNG、full check 29 files / 202 tests、coverage、fixture hash、target SHAは`docs/specs/ui-evaluation-rubric-v1.md`を正本とする。
- INC-005はfresh P05で解消確認後もcandidateを維持する。INC-006は初回担当者の差異確認form送信でEnglish 409となった追加発見を統合し、API hard block、最終form非表示、manager未解決承認disabledをP05で確認済み。candidateは維持する。
- INC-007はoffline eventで接続状態文言が変わらなかった件としてcandidate記録する。P05で修正・検証済みだが、memory INDEXには載せない。

## 2026-08-29 Goal全体の再監査とP12-A再開

- 現HEAD/remote branchは`a42db0fdd67735857c130af1f58b73d883fcd460`。Draft PR #9 `https://github.com/komatsu-dev-jp/seller-assistant/pull/9` はOPEN/Draft/CLEANで、merge・本番公開は0件。
- モバイル75＋PC52の視覚gateはP0/P1差異0件で維持する。ただし承認routeは静的`ApprovedMobileDemo` / `ApprovedPcDemo`であり、実API/DB接続0件。独立Sol監査はCritical 0、High級ブロッカー8群でGoal全体を不合格とした。
- AC/TA対応表は欠番0だが、1 IDごとのtestファイル・証拠pathが不足する。P07で個別対応へ更新する。
- AC-065〜068/TA-046〜048は実機能として未完了。Sol設計により、最初の実装をP12-A（検品・気になる箇所のcontractsと新規0034 migration）へ限定した。
- P12-Aの実装担当は明示的な`gpt-5.6-sol` / `max`、確認は別Sol max。API/Web、発送、注文、価格調査は今回の書込み範囲外。
- candidate incidentは`memory/incidents/INC-20260829-012-approved-ui-static-runtime-gap.md`。修正と独立再検証前のためlessonへ昇格しない。
- 現環境にはPostgreSQL実行環境と必要なtest接続設定がない。contracts/static migration/root checkは実行できるが、fresh/upgrade PostgreSQLを再実行するまでP12-Aを合格扱いにしない。

## 2026-08-29 P12-A最終PASS

- `0034_inspection_concern_contract.sql`、公開contract、静的schema test、fresh/upgrade integrationを実装した。既存migration、API route/repository、Web、P13/P14は変更していない。
- 最新check／concernは遅延制約で同一transactionの最終状態を検査する。`concern_present`は全latest human-confirmed IDの完全一致、`no_issue_confirmed`は全latest concernがhuman-dismissedの場合だけ許可する。dismiss済みchainは再開不可。
- 権限helperはSKU IDだけを受け、workspace、identity、時刻をsessionから内部取得する。別workspace、別SKU、担当外、期限切れ・取消済み担当、自己確認を拒否する。
- 公式PostgreSQL 18.6は`C:\tmp\seller-assistant-pg18-20260829`の短期・loopback限定・架空データclusterを使用した。ZIP SHA-256は`FBE23DA234EE31547BF8A36D29DFD81E82B849DF2D2B78D2EECB43D360252F8C`。試験後は停止済み。
- freshは34 migration、53-table RLS、2独立接続の実Lock競合をPASS。競合は成功1／SQLSTATE 23505拒否1、最新chain 1本。upgradeは既存SKU/media/pilot/finance/export bytes/hash/auditの不変をPASS。
- root checkは34 files / 253 tests、coverage 84.66 / 80.56 / 100 / 90.68、format/lint/typecheck、API/Web build 86 routesをPASS。
- 実装していない別Sol maxの最終reviewはCritical 0 / High 0 / Medium 0 / Low 0。P12-A PASS、P12-B technical gate GO。
- 次の停止条件: 6商品種類の具体的な必須／任意項目が承認資料で未確定。`docs/implementation/p12-product-template-proposal-v1.md`の推奨A／代替Bとパンツ／スカート分岐を利用者が確認するまで、P12-Bの0036、seed、API、Webを書かない。
- Draft PR #9は引き続きOPEN/Draft。ready化、merge、本番公開、有料サービス、外部APIは行わない。

## 2026-08-29 P13設計GO・0035先行割当

- 承認済みPC08と全ページ忠実再現指示を再照合し、初回UIは`高額商品だけ撮る`を推奨選択、金額目安は空欄、写真使用時は商品写真と梱包後写真を各1枚以上と固定した。架空の30,000円は保存しない。
- 現行の販売額必須、ランダムUUIDの梱包証拠、写真policyなし、workspaceだけのmedia RLSとの差を別Sol maxが重大と判定した。
- P13-Aは`docs/implementation/p13-shipping-photo-contract-v1.md`を正本に、Sol maxの唯一writerが新規0035、contracts/API/DB/Storage、nullable販売額、権限・状態・競合を実装する。
- 未作成・未適用の0035はP13へ割り当てる。P12-Bは0036候補へ機械的に移すだけで、利用者確認まで項目、seed、API、Webを実装しない。
- P13-Aのfresh/upgrade PostgreSQL、全check、独立Sol reviewが合格するまでP13-B Webへ進まない。PR merge、本番公開、外部送信、有料serviceは行わない。

## 2026-08-30 P13-A実装・検証完了

- `0035_shipping_preflight_photo.sql`、contracts、order repository/API、private local storage、nullable販売額、Web既存callerのpack/ship request契約を実装した。承認済み静的review routeと見た目は変更していない。
- policyは`high_value_only / all / disabled`。初期30,000円を保存せず、販売額欠損は0円にせず、商品写真・梱包後写真、写真確認、梱包確認、発送確認を分離した。
- decision basisは有効saleの正確なUUID集合・合計・hashを追記保存する。後のsale/reversalで古くなった判断はpack/shipを止め、販売額・目安額・basis IDをshipping応答へ出さない。
- 写真upload・確認、decision、pack、shipの同時再送を実Lock競合で確認し、同一内容は同一結果、異内容は拒否、業務行・監査・workflow副作用は各1件だけとした。
- 旧版ですでに`packed`の未発送注文は、旧梱包行を自動昇格・変更せず、人の再確認を新しいserver行として追記して発送できる。旧行false1・新行true1を部分一意で固定する。
- fresh: `resale_p13_fresh_20260830f`、35 migration、64 public tables、`npm.cmd run test:postgres` PASS。upgrade: `resale_p13_upgrade_20260830d`、空DBから0001〜0035、`npm.cmd run test:postgres-upgrade` PASS。途中B/Cは0035前fixture不備で停止し、再利用せずDで再実行した。
- final check: 35 files / 271 tests、format/lint/typecheck、API/Web build、Next 86 routes PASS。別Sol maxはCritical/High/Medium/Low 0、P13-A PASS、P13-B GO。
- 次は`gpt-5.6-terra` / `high`でP13-Bの実運用Webだけを接続する。静的approved route、DB/権限/金額契約を変更しない。390/768/1440、keyboard、44px、loading/empty/error/retry、外部request 0を確認する。
- AC-066／TA-047全体はP13-Bと実iPhone確認が残るためpartial。P12-B/Cは利用者2項目確認待ち、P14も未実装。PR #9はDraftのまま、merge・本番公開・外部送信・課金なし。

## 2026-09-03 P13-B/P14実装・同一ビルド検証

- M34〜38とPC29〜32を認証済み`/shipping`へ接続し、注文登録、サーバー採番、商品・場所二重読取、選択式発送前写真、梱包確認、発送記録を実API/DBで動かした。承認済み静的routeも保持している。
- `0037_order_registration_shipping_method.sql`と`0038_order_address_mode.sql`を追加した。匿名配送は住所行0件、住所あり配送は暗号化行1件、表示許可は本人・注文単位・5分、旧未設定注文は`NULL`互換である。
- モバイル匿名注文は作成直後にM35へ直接遷移、PC住所あり注文はPC29〜32を発送済みまでローカル実ブラウザで完走した。取引IDと販売額は任意のまま、人の発送準備確認を必須にした。
- ownerの場所写真が403になる不具合を検出し、owner/inventory managerは有効membership、shipping担当は自分の有効な注文割当を要求する権限へ修正した。clean browserで最新承認済み場所写真を非公開object URLから実表示し、console error/warning 0を確認した。
- 最新full checkはfixture 44 PNG/hash、format/lint/typecheck、45 files / 396 tests、coverage 84.66 / 80.56 / 100 / 90.68、API/Web buildをPASS。fresh/upgrade PostgreSQLは0001〜0038、restricted role、65-table RLS、注文・住所・写真権限・並行操作・既存データ保持・rollbackをPASSした。
- 最新同一production buildのroute/capture/compareはモバイル75/75、PC52/52、合計127/127、viewport 127/127、欠落0、外部runtime resource 0、比較25シート。証拠は`output/playwright/root-all-fidelity-p14-final-20260903`と`output/playwright/approved-ui-comparison/p14-final-20260903`。
- 次: 変更を凍結し、実装・設計を担当していない別Sol maxが最終独立レビューする。Critical/Highがあれば修正と全回帰を繰り返す。合格後だけ限定commit、push、Draft PR #9本文更新を行う。ready化、merge、本番公開はしない。
- 人手待ち: 実iPhone Safari/home/camera/Code 128/offline、A4 24面ラベル物理確認、固定10商品pilot、実Money Forward取込。P12-B/Cは`docs/implementation/p12-product-template-proposal-v1.md`の2項目を利用者が決めるまで実装しない。

## 2026-09-03 P15 モバイル上部余白の先行修正

- 利用者の実機画像で、Web内の`9:41`、Dynamic Island、電波、Wi-Fi、電池`77`が実iPhoneのOS表示と重複していたため、全モバイル共通の高優先改善として先行した。
- Luna maxの唯一writerが、静的75画面、live login、live shippingの擬似表示だけを削除した。通常headerは56px、本文は可変残り高さ、ログインは上下safe-area対応。PC、業務本文、API、DB、権限は変更0件。
- 390×844の画面04は本文開始`y=93`から`y=56`となり37pxを回収した。全75 routeの横overflow、縦overflow、clipped interactive、external resourceは各0件。
- 対象17 tests、root full check 45 files / 403 tests、review production build 134 pages / 139 files / 766 precache filesをPASSした。
- 別Solは初回Critical 0 / High 0 / Medium 0 / Low 1。広すぎたCSS回帰testを`.header`と`.scrollArea`の宣言ブロックへ限定し、再確認はCritical / High / Medium / Low各0、Low Closed、最終PASS。修正後root full checkも45 files / 403 testsで再PASSした。
- 残りは限定commit/push、既存Draft PR #9とGitHub Pages確認版の更新。実iPhoneのsafe-areaとホーム画面表示は利用者確認待ち。PR ready化・merge、実API/DB公開は行わない。

## 2026-09-08 P16完成監査・現在の再開点

- 正本worktreeは`_worktrees/opus-audit-integration`、branchは`codex/opus-audit-integration`、開始HEADは`220d6266a3b0975a2af0c81fefde2b316576755b`。Draft PR #9はOPEN/Draft/CLEANで、mergeしない。
- 現行の新規モデル運用は`astra-centric`へ移行した。過去のLuna/Terra/Sol割当は履歴である。P16-A sourceは`gpt-6-astra` lowの`p16_ac067_handoff`だけが書き、別実行のAstraが凍結差分を読む。
- AC/TA完成監査で、判断不要の次パケットをAC-067の商品調査本人操作支援とした。検索語とCodex用質問文は端末内候補で、人が編集・コピーし、公式メルカリ検索は本人クリック時だけ開く。自動取得、自動送信、スクレイピング、RPA、Cookie共有、価格自動確定は0件とする。
- Actions方針は解決済み。`.github/workflows/ci.yml`と`pages.yml`はいずれも`workflow_dispatch`だけで、無料・手動方針と一致する。利用者への再質問はしない。
- 判断待ちはP12の「細部写真を必須にするか」「共通入口後にパンツ／スカートを分けるか」と、PC29の販売金額文言である。人手待ちは実iPhone、A4 24面物理印刷、固定10商品pilot、実Money Forward取込である。
- P16-A後の検証差分候補はTA-027 security coverage、TA-014/026 backup/restore、TA-017 secret scan、AC-039 legacy allowlist scan、AC-055 GS1非生成testである。一度に一パケットだけ閉じ、合格済みと未確認を混ぜない。
- P06操作票は古い対象SHAとmigration 0033を記載しているため、人手pilotを案内する前に最新凍結SHA・現行migrationへ更新し、再preflightする。実装・検証・独立レビュー後だけ限定commit/pushとDraft PR本文更新を行い、ready化・merge、本番API公開、有料サービスは行わない。

## 2026-09-08 P0終了監査・次回の再開点

- 正本: `docs/implementation/goal-closeout.md`。終了区分LIMIT_REACHED、P0未合格。
- 基準SHA+限定3修正はfull check、security coverage、fresh/upgrade PostgreSQL、base-path browser、独立reviewで合格相当。AC-067先行draftは対象外で、消さずに保持している。
- モバイル擬似status表示と上部圧迫は基準SHA`220d626`ですでに修正済み。実iPhone safe areaは利用者確認待ち。
- 最優先blocker: `0015_shipping_assignment_checked_codes.sql`の関数内で`app_code_check_digit`がschema未修飾かつ固定`search_path`なし。通常`pg_restore`はFAILし、TA-014/026は未達。次は既存migrationを書き換えずforward migration+通常restore回帰を1パケットで行う。
- 人手gate: 実iPhone、A4 24面物理印刷、WARMUP+固定10商品pilot、実Money Forward取込。仕様判断: P12写真必須/任意、パンツ/スカート分岐、PC29販売金額文言。
- GitHubは`PUBLIC`でprivate限定条件と不一致。push、Draft PR/Pages、Slack/Notionを更新しない。公開範囲変更、代替repo、ready化、merge、本番API公開、P1開始を行わない。

## 2026-09-08 TA-014限定Goalの完了申し送り

- 作業対象は開始HEAD `220d6266a3b0975a2af0c81fefde2b316576755b` + 保護された未commit差分。branchは`codex/opus-audit-integration`のまま。clone、branch切替、reset/clean、commit、push、PR/Pages更新は行っていない。
- 修正前再現: 専用PostgreSQL 18.6、`127.0.0.1:55444`、架空データで通常`pg_restore`が`app_code_check_digit(text) does not exist`によりFAIL。production/既存DBは未接触。
- 根本修正: 旧0015を変更せず、forward migration 0040で3 checked-code関数の`search_path`と`public.`修飾を固定。追加前にFAILするmigration回帰test、通常restore script、upgrade rollback試験を追加。
- 正常証拠: 70 tables / 48 rows、全行SHA-256 `3570429b1b2780eaaef40068cf56ea9dc3b53841fed9f0af4a4595f3b28ca9c8`、244 FK、原本写真manifest SHA-256 `6b69dd2eadaa20d06cac61e97c6321994e95ec27894b9586790d7c64eecd5858`、監査SHA-256 `c8446a645a97016171dcbeb2e29ce98991a62dd3663175d6a1aaeea4a3c0edcc`が通常一括復元後に一致。runtime role/RLS/追記監査拒否もPASS。
- 安全証拠: 同一DB、非空target、権限不足、loopback外、破損dump、写真junctionを拒否。継承`PG*`除去、接続文字列化の拒否、stderr行値秘匿を外部接続なしの実子process testで固定。
- 回帰証拠: fresh 39 migration PASS、upgrade 0001〜0040と0040注入失敗rollback/reconnect/reapply PASS。最終`npm.cmd run check`は50 files / 431 tests、coverage lines 89.06% / branches 80.93%、API/Web build、Next 86 routes PASS。
- 独立レビュー: Astra medium再レビューPASS。Critical 0 / High 0 / Medium 0 / Low 1。LowはIPv6 URLが安全側に接続失敗する互換性で、復元手順は実証済みIPv4 `127.0.0.1`だけを使う。
- 判定: TA-014 PASS。TA-026はDB/private Storage原本復元までPASSしたが、実providerの頻度・RPO/RTO未計測のためNOT_RUN/partial。P0全体は未合格、P1未開始、外部反映0件。
- モバイル: 固定`9:41`、Dynamic Island、電波/Wi-Fi/電池と上部圧迫はHEAD `220d626`ですでに修正済み。利用者画像は未更新の公開版。実iPhone safe areaとホーム画面表示は`real-iphone-api-verification-checklist.md`に従う人手確認待ち。
- 次の1件: PCとiPhoneのIPv4・機種・iOS版を確認後、IP限定HTTPS中継で実API版を人が一連確認する。外部トンネルや架空の完成URLを作らない。別の実装Goalは自動開始しない。
- Cleanup: 専用loopback PostgreSQLを正常停止し、確認済みの使い捨て試験root `C:\tmp\seller-assistant-ta014-restore-20260908-01`だけを削除済み。既存DB、実データ、PostgreSQL本体は未変更。

## 2026-09-09 P20 Codex側P0完了申し送り

- 正本worktree/branch/基準SHAは変更なし。大きな未commit差分を保護し、reset/clean/commit/push/merge/Pages更新は行っていない。
- 現行チェックリストは`docs/implementation/p0-progress-checklist.md`。83/94（AC 45/52、TA 38/42）、Codex側未完了0、`WAITING_HUMAN` 11。
- 最終`npm.cmd run check`は63 test files / 580 tests、coverage 83.93 / 81.06 / 92.06 / 89.50、format/lint/typecheck/security/build、Next 86 routesをPASS。
- fresh `resale_fresh_p20_20260909f`は45 migration、upgrade `resale_upgrade_p20_20260909f`は0001→0046をPASS。
- restoreは専用架空source/targetで73 tables / 316 rows / 253 FK / private files 23をPASS。商品、レシート、場所原本/派生、棚卸差異、発送を同じmanifestでDB・file・audit hash照合した。
- 承認UIは`output/playwright/p20-approved-ui-20260909/`に127画面、比較は`output/playwright/approved-ui-comparison/p20-final-20260909/`に25シート。liveは`output/playwright/p20-final-live/`で10 route×3幅の30/30を合格。
- 最終独立再レビューはCritical 0 / High 0 / P0阻害Medium 0 / Low 2。LowはIPv6 URL互換と未公開0043単独運用時の旧pending互換。正式運用のIPv4 `127.0.0.1`・0043〜0046一括適用ではblockerではない。
- 人の次作業: 実iPhone、物理A4/Code 128、固定10商品pilot、実Money Forward、商品別写真項目の最終判断。失敗した項目だけを限定修正する。
- GitHub更新用のローカル本文案は`docs/implementation/draft-pr-update-proposal-p20.md`。PRはDraftのままにし、利用者の明示依頼なしに外部反映しない。
- 既存Notion進捗表`3d61548a971b81058338cae0787b7ac0`だけを同期済み。再取得で94項目・完了83・未完了11、最終レビューCritical 0 / High 0 / P0阻害Medium 0を照合した。
- Cleanupは完了。検証用の3006/3105/4175 listenerとP20 Playwright daemonは0。復元証拠の架空DB・mediaと、`127.0.0.1:55439`のPostgreSQL試験環境は再検証用に保持した。

## 2026-09-09 PR #9 merge承認後の申し送り

- 利用者は既存PR #9の更新・mergeを明示依頼し、公開リポジトリの標準`ubuntu-latest`によるPull Request・`main`自動CIとGitHub Pages公開も承認した。以前の手動限定方針は同日の`docs/DECISIONS.md`で置き換えた。
- workflowはPR/`main` CIと`main` Pages triggerを追加し、`workflow_dispatch`を再実行用に維持した。larger/macOS runner、有料Action、有料API、外部runtime APIは0件のまま。
- 最終source凍結後のローカルgateは`npm test` 63 files / 580 tests、`npm run lint`、`npm run build` 86 routesを順番どおりPASSした。
- 次の必須gateはPR head SHA一致のCI、merge commit SHA一致の`main` CI・Pages、公開URL確認、local main同期、task worktree/branchの安全なcleanupである。
