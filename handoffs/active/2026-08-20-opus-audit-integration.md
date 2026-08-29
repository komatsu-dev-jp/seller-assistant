# Handoff: Opus第二次監査の統合

- Status: goal-v2-cost-optimized-evaluation-loop
- Owner: Codex / ユーザー
- Updated: 2026-08-29 JST
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
- seeded browser指定操作とP05独立最終評価100/100（Critical/High/Medium 0）は確認済み。P08 Solレビューは未完了。
- 実利用者pilot、実iPhone Safariのhome/camera/offline/HEIC-WebP、実Money Forward import。
- `docs/specs/pilot-protocol-v1.1.md`に従う実利用者の`WARMUP-01`＋固定10商品pilot。
- `docs/specs/ui-evaluation-rubric-v1.md`のP05独立最終採点は100/100 PASS済み。14 PNGとtarget SHAを同文書へ記録した。
- 実装・設計審査を担当していない別Sol maxによる凍結差分の最終独立レビュー。
- 実利用者pilot、実iPhone、実MF import、P08 Solレビューが未完了のためDraft PRは未作成。P1、本番公開、PR mergeも未実行。
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
- 最終review: 実装・設計審査をしていない別Sol maxが凍結差分をレビューする。

## 次の一手

1. P05独立UIスコアは100/100 PASS済み。実利用者pilotの準備・実施へ進む。
2. 上記UI gate合格後、実利用者が`docs/specs/pilot-protocol-v1.1.md`どおり`WARMUP-01`＋固定10商品を操作する。
3. 証拠を更新し、これまで実装・設計審査を担当していない別Sol maxが凍結差分を独立レビューする。
4. Critical/High 0、UI 90点以上、pilot合格後だけ、外部書込み権限を再確認してDraft PRを作成する。本番公開とmergeは行わない。

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
