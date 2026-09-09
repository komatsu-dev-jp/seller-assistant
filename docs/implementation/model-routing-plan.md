# P0 cost-optimized モデル割当計画

- 状態: active
- 更新日: 2026-08-29 JST
- 対象Goal: `docs/specs/goal-contract-revised-a-v2.md`
- 対象branch: `codex/opus-audit-integration`
- 対象worktree: `C:\Users\softt\Documents\Codex\2026-08-13\iphone-notion-google-research-ios-pc\_worktrees\opus-audit-integration`

## 実装運転モード

- mode: `cost-optimized`
- chosen_by: ユーザーの2026-08-21依頼「実装難易度に合わせてサブエージェントを適切なモデルに振り分けるようにしてコストを削減」
- parent_model: ルートCodexは統合と利用者窓口を担当する。親セッションのモデル名を推測して記録せず、委譲時に明示したモデルだけを実行証拠とする。
- design_gate: PASS（2026-08-21、`gpt-5.6-sol` / `max` の独立担当、Critical 0 / High 0 / Medium 0）。
- worker_delegation: fixture生成・固定テスト・証拠文書を`gpt-5.6-luna` / `max`、Webの限定統合と実ブラウザ8 task検証を`gpt-5.6-terra` / `high`または`xhigh`、DB・migration・APIの重要状態を`gpt-5.6-sol` / `max`へ渡す。
- independent_sol_review: 実装を凍結した後、実装者でも設計審査担当でもない別の `gpt-5.6-sol` / `max` が最終レビューする。
- user_visible_pause: 承認済みMVP・デザイン・無料条件の変更、外部送信、公開、課金、データ損失、権限拡大、または必要能力を満たすモデルがない場合だけ停止する。
- independent_sol_review_required: true

`max` は推論量であり、LunaをSolと同じ能力にする設定ではない。下位モデルの自己承認を合格証拠にしない。

## 固定する正本と境界

- 製品・完了契約: `docs/specs/goal-contract-revised-a-v2.md`
- UI基準: `docs/design/selected-direction.md`、`docs/design/revised-a-approval-v2.md` とそこから参照するSlack承認画像
- 10商品試験: 新規runは`docs/specs/pilot-protocol-v1.1.md`。`docs/specs/pilot-protocol-v1.md`は履歴だけに使う。
- UI採点: `docs/specs/ui-evaluation-rubric-v1.md`
- 検証記録: `docs/implementation/acceptance-map.md`、`docs/implementation/design-fidelity-evidence.md`、`docs/implementation/loop-log.md`
- 禁止: P1、本番公開、PR merge、有料サービス、外部runtime連携、自動出品・自動値下げ、スクレイピング、非公開API、税務自動確定。
- 共有worktreeでは書き込み担当を必ず1人にする。別担当を同時に動かす場合は読み取り専用レビューに限る。

## モデル切替ゲート

- 設計: PASS。別Sol maxが初回指摘6件の修正後にCritical 0 / High 0 / Medium 0で承認した。
- 開始前: 低リスクはLuna max以上、中程度はTerra high以上、重大はSol maxだけを適格とする。
- 自動フォールバック: Luna不在ならTerra、Terra不在ならSolへ上げてよい。必要能力より下へは下げない。
- 昇格トリガー: 仕様・モック・テストの矛盾、原因不明の失敗、指定外ファイル、DB・migration、認証・権限、個人情報、金額・会計、重要状態、同時更新、外部副作用への波及。
- 停止時: `handoffs/active/2026-08-20-opus-audit-integration.md` へ証拠、変更範囲、必要な次モデル、再開条件を残す。
- 現在の判定: 利用可能なLuna/Terra/Solが明示されているため `MODEL_SWITCH_REQUIRED` は不要。製品判断の追加確認も不要。

## 実装パケット

### P00 モデル運用の正本化

- 目的と参照: 本書、`AGENTS.md`、`docs/DECISIONS.md`、active handoffへ、今回のモデル運用を一度だけ固定する。
- リスク: 低。製品挙動を変更しない文書整合。
- 実装担当: Sol max。今回の初稿はルートCodexが作成し、Sol maxの設計ゲート指摘だけを反映する。
- 確認担当: Sol max（設計ゲート）。
- 変更可能: Sol maxは本書、`AGENTS.md`、`docs/DECISIONS.md`、active handoff。Luna maxはSolが確定した文言による本書の進捗欄とactive handoffの定型更新だけ。
- 変更禁止: Luna/Terraによる`AGENTS.md`、`docs/DECISIONS.md`、モデル分類・停止条件の変更。コード、仕様本文、外部サービス。
- 受け入れ条件: モード、モデル別範囲、独立レビュー、停止条件、直列書込みが4文書で矛盾しない。
- 検証: Markdown構造、参照パス、秘密情報0件、`git diff --check`。
- 停止・昇格条件: 製品契約や既存承認を変更する必要が生じたらSolへ戻す。

### P01 pilot・金額・DB安全修正の重大レビュー（2026-08-21時点の履歴）

- 状態: 当時PASS（2026-08-21）。Sol maxが新規0026を実装し、targeted 2 files / 37 tests、全workspace typecheck、fresh PostgreSQL P0結合、既存データ0001〜0026 upgradeを合格。無言終了した一時試行は新しい一意DBで再実行してPASSし、試験DBを削除した。後続0032までの現行結果は本書末尾の「現在の完了・未完了」を参照する。

- 目的と参照: 直近レビューHighのpilot通信失敗、遅着例外、架空金額初期値を再照合する。AC-013、AC-026、AC-061、TA-023、TA-043。
- リスク: 重大。DB migration、金額、pilotの合否状態、監査を含む。
- 実装担当: Sol max。現在の修正はモード変更前にルートが実装済みなので、下位モデルは追加変更しない。
- 確認担当: 別Sol maxによる最終レビュー。
- 変更可能: `apps/api/src/p0-item-repository.ts`、`apps/api/src/postgres-integration.ts`、`apps/api/src/postgres-upgrade-integration.ts`、`packages/db/src/schema.test.ts`、必要最小限のcontracts/test、`apps/web/src/components/p0-workspace.tsx` のpilot同期と空の金額初期値だけ。当時のDB変更はSol maxが新規migration `0026`として追加した。
- 変更禁止: 既存migration `0021`〜`0033`の再編集、UI再設計、P1、外部連携、税務判断。
- 受け入れ条件: 未送信例外がある間はpilot操作・合格を停止する。遅着した無効イベントで完了済みrunが`failed`になる。通常注文の金額は全て空で開始する。既存データ移行を壊さない。
- 検証: 当時は`npm run check`、fresh PostgreSQL P0結合、0001〜0025既存データupgrade、通信失敗fixture。現行0032までの結果は末尾へ記録する。
- 停止・昇格条件: migration、状態遷移、金額計算、監査の期待が一つでも不明ならSol以外は触らない。

### P02 Slack承認済みUIへの一致

- 目的と参照: W11 v4/M13 v2、W12 v2/M14 v2、Home C、M12/W10の情報優先順位を実画面へ反映する。
- リスク: 低。既存の保存・権限・計算を変えない表示、CSS、アクセシビリティ調整に限定する。
- 実装担当: Luna max。
- 確認担当: Sol highまたはxhigh。重要な状態表示の矛盾があればSol max。
- 変更可能: `apps/web/src/app/globals.css`、`apps/web/src/components/stocktake-workspace.tsx`、`apps/web/src/components/accounting-workspace.tsx`、`apps/web/src/components/accounting-page-workspace.tsx` の表示構造だけ。
- 変更禁止: API、contracts、DB、金額式、権限、状態遷移、固定の架空業務値。
- 受け入れ条件: PCはW11/W12の一覧・詳細・検査・履歴を一画面で追跡できる。スマホは1画面1目的。390×844、768×1024、1440×1000で横overflow 0、主要操作44px以上、文字・操作切断0、console error 0。
- 検証: 承認画像と同じ状態・近い幅のPlaywright screenshot、DOM寸法、キーボード、200%拡大、空・失敗・再試行状態。
- 停止・昇格条件: 状態を表示するためAPI/契約変更が必要、またはモックと仕様が矛盾する場合は変更せずSolへ昇格する。

### P03 Home承認待ちの限定統合

- 目的と参照: 承認待ち内訳をDBから返し、実際に解決できる画面へ分岐させる。
- リスク: 中程度。contracts、API read model、Web導線の複数層をまたぐが、確定操作は行わない。
- 実装担当: Terra high。現在の修正はモード変更前に実装済みのため、残作業は照合と限定修正だけ。
- 確認担当: Sol xhigh。権限や承認状態に波及する場合はSol max。
- 変更可能: `packages/contracts/src/index.ts`、`apps/api/src/repository.ts` のread-only集計、`apps/web/src/components/home-workspace.tsx`、対応test。
- 変更禁止: migration、承認mutation、権限拡大、会計・住所・個人情報。
- 受け入れ条件: 棚卸、場所写真、廃棄候補、出品確認の内訳が一致し、最初の未解決カテゴリへ遷移する。0件時に架空件数を表示しない。
- 検証: contracts/API test、各内訳fixture、実ブラウザ遷移。
- 停止・昇格条件: DB schemaや権限変更が必要ならSol maxへ昇格する。

### P04 固定済み自動検証

- 目的と参照: 現在の凍結候補差分を同じ条件で再現確認する。
- リスク: 低。決められた非破壊コマンドと使い捨てローカルDBだけを使う。
- 実装担当: Luna max（原則読み取り専用）。
- 確認担当: Sol highまたはxhigh。migration、金額、権限、重要状態に関係する結果はSol max。
- 変更可能: テスト生成物と、合格後の証拠文書だけ。
- 変更禁止: test失敗時の推測修正、外部CI、本番データ、費用発生。
- 受け入れ条件: fixture check、format、lint、typecheck、192件以上のtest、coverage閾値、API/Web production build、fresh PG、upgrade PGが全合格する。
- 検証: `npm run check`、`npm run test:postgres`、`npm run test:postgres-upgrade`。
- 停止・昇格条件: 原因不明の失敗は証拠を残し、Lunaがコードを広げずSolへ渡す。

### P05 UI 8 taskの独立実行と採点

- 目的と参照: `docs/specs/ui-evaluation-rubric-v1.md` の8 taskを同じ凍結版で完走する。
- リスク: 中程度。画面から在庫差異と会計候補の状態を操作するが、隔離した架空fixtureだけを使う。
- 実装担当: Terra xhigh（検証のみ、source編集なし）。
- 確認担当: 別Sol maxが採点根拠、重大項目、モック比較を再判定する。
- 変更可能: 専用ローカルtest DB、`output/playwright/`、検証メモ。
- 変更禁止: source、実データ、外部サービス、採点基準。
- 受け入れ条件: 8 task、キーボード、focus復帰、200%拡大、失敗・再試行、768pxを追跡でき、90点以上かつ重大項目0点なし。
- 検証: 実ブラウザ、screenshot、操作記録、console/network error。
- 停止・昇格条件: taskが仕様どおり完了できない場合は0点を隠さずSolへ改善パケットを返す。

### P05.5 / P06R pilot開始前の安全性・記録完全性修正

- 状態: 第4修正Loop。2026-08-25、Sol maxが再run識別子、次商品stage、失敗案内、例外集計を修正した。root実ブラウザで新run開始直後の旧商品操作と、pilot category送信値の不一致409を追加検出し、旧概要非表示、仕入以外disabled、未登録表示、全10 fixtureの基本カテゴリ送信へ限定修正した。root full check 31 files / 209 tests、fresh/upgrade PostgreSQLはPASSした。修正版commit、同一SHAの3 viewport・loopback実ブラウザ確認、独立Terra再監査が終わるまで人のpilotは開始しない。
- 目的と参照: `docs/specs/pilot-protocol-v1.1.md`の外部network 0、手動訂正の欠損なし、外部事故によるrun無効化を、初心者が画面どおり操作して守れる状態にする。
- リスク: 重大。外部通信の安全境界、pilot合否証拠、重要状態遷移、監査記録を変更する。
- 実装担当: `gpt-5.6-sol` / `max`。共有worktreeの唯一のsource書き込み担当とする。
- 確認担当: 変更後のP05/P06開始前確認は実装者ではないTerra xhigh。P08はさらに別の`gpt-5.6-sol` / `max`が実施する。
- 変更可能: `apps/web/src/components/p0-workspace.tsx`、`apps/web/src/components/product-research-panel.tsx`、必要最小限のcontracts/API/repository/proxy、対応test、pilot protocolの実装整合注記、acceptance/loop/handoff、candidate incident。
- 変更禁止: 既存migrationの再編集、実pilot結果の作成・補完、外部サービス接続、P1、本番公開、課金、PR merge、承認済みUI全体の再設計。
- 必須受け入れ条件:
  1. active pilot中は外部URL・価格根拠の入力導線を使えず、「ローカル4写真・採寸・属性だけを使い外部ページを開かない」と画面に明示する。
  2. 初回入力と訂正を区別し、成功した写真・採寸・属性・文章の訂正を`manual_correction`へ決定的かつ重複なく記録する。現行画面で訂正不能な項目を、実装済みと偽らない。
  3. 停電・OS強制update等を理由付きで`externally_invalidated`へ移す管理者操作を用意し、権限、冪等性、監査、完了run保護をtestする。
  4. ブラウザ外の通信をアプリだけで観測できない限界を明記し、run固有の外部network 0を虚偽の自動計測として保存しない。専用ブラウザのrequest記録と人の確認をどう証拠化するかをprotocol/UIで一致させる。
  5. WARMUPと固定順を開始前に理解でき、次商品へ迷わず進める。手動訂正数とnetwork retry数をrun集計で確認できる。
- 第2Loop追加条件:
  1. pilotのSKUコードと証憑参照番号をrun UUID込みの一意な固定値にし、UIをread-only、v1.1 serverを完全一致検証とする。通常失敗後と外部事故後の両方で、新runのTOP-01を作成できる実PostgreSQL testを追加する。
  2. active pilotで次fixtureを開始できる間は、完了済み商品の状態による自動stage遷移でpurchase画面を上書きしない。TOP-01完了後にpurchaseとTOP-02固定値を保つ決定的testを追加する。
  3. failed runへ「不合格・履歴保持・WARMUP後に新run」の日本語案内を表示し、必須画像欠損とラベル・場所不一致を含む全例外集計を隠さない。
  4. 修正差分をcommitした後、その40文字SHAへfull check、fresh/upgrade PostgreSQL、3 viewport、loopback request証拠を結び直す。未commit差分の旧SHAをP06へ入力しない。
- 検証: contracts/API/Web targeted test、`npm run check`、API変更時はfresh/upgrade PostgreSQL、390/768/1440実ブラウザ、console 0、loopback以外のrequest 0、WARMUP開始直前までの初心者導線。実利用者の時間をモデルが代行しない。
- 停止・昇格条件: 訂正の定義、外部通信証拠、状態遷移が仕様と一意に整合しない場合はsourceを広げずルートへ戻す。製品契約変更が必要ならユーザー確認まで停止する。

### P06 実10商品pilot

- 目的と参照: `docs/specs/pilot-protocol-v1.1.md`に従い、実際の人が`WARMUP-01`と固定10商品を操作する。
- リスク: 人手必須。モデルが代行すると時間指標と使いやすさを偽装する。
- 実装担当: ユーザーまたは指定された人間の試験者。
- 確認担当: Sol maxはserver記録の集計と欠損だけを確認する。
- 変更可能: 隔離したpilot runの架空または試験商品記録。
- 変更禁止: 結果の補完、遅い商品・失敗商品の除外、実販売・外部出品。
- 受け入れ条件: 10点全件、中央値5分以下、`invalid_attempt_count=0`、`externally_invalidated=false`、誤格納0、未確認copy-ready 0、欠損を0円として補完した件数0、外部network 0。欠損・差戻しも隠さず記録し、1条件でも未達ならLoopを続ける。
- 検証: server eventと人の操作記録を照合する。
- 停止・昇格条件: 10点未実施はDraft PRのhard stop。

### P07 証拠・状態文書の整合

- 目的と参照: 実行済み結果だけをacceptance map、design evidence、Loop、pilot/UI状態、handoffへ反映する。
- リスク: 低。結果を作らず、確認済み事実だけを記録する。
- 実装担当: Luna max。
- 確認担当: Sol high。
- 変更可能: `docs/implementation/acceptance-map.md`、`docs/implementation/design-fidelity-evidence.md`、`docs/implementation/loop-log.md`、active handoff。`docs/specs/pilot-protocol-v1.md`と`docs/specs/ui-evaluation-rubric-v1.md`は状態行、証拠リンク、実測結果欄だけ。
- 変更禁止: Luna/Terraによるpilot手順、UI配点、合否閾値、仕様・AC/TA・承認内容の変更、未実施結果のPASS化。
- 受け入れ条件: migration `0033`の実走状態、最新29 files / 202 testsのfull check、fixture manifest SHA、P05独立100/100証拠、未実施pilot、iPhone未確認、P08待ちを相互に矛盾なく記録する。
- 検証: 参照先存在、数値一致、秘密情報0件、`git diff --check`。
- 停止・昇格条件: 正本間の矛盾は勝手に直さずSolへ返す。

### P08 凍結差分の最終独立レビュー

- 目的と参照: 全差分、AC/TA、モデル割当、検証、モック比較、残存リスクを独立判定する。
- リスク: 重大。認証、RLS、在庫状態、金額、会計、migration、オフライン、監査を横断する。
- 実装担当: none。レビュー専任。
- 確認担当: これまで実装・設計審査をしていない別Sol max。
- 変更可能: 読み取り専用。指摘は改善パケットとして返す。
- 変更禁止: レビュー担当による修正、自己承認。
- 受け入れ条件: Critical/High 0、必須検証の対象SHA一致、UI 90点以上、10商品pilot合格、未確認iPhoneを未確認と明記。
- 検証: 凍結diff、全test、PG、画面証拠、秘密/外部接続scan。
- 停止・昇格条件: Critical/High、証拠不足、差分凍結後の変更があれば修正Loopと再レビューへ戻る。

### P09 限定commit・push・Draft PR

- 状態: dormant。承認済みGoalの将来到達点として保持するが、今回のモデル割当変更だけを根拠に実行しない。P08合格後に対象branch、head SHA、外部書き込み権限を再確認してから有効化する。

- 目的と参照: 全gate合格後だけ、対象差分を追跡可能なDraft PRにする。
- リスク: 中程度。GitHubへの外部書き込みだがmerge・公開はしない。
- 実装担当: Terra highまたはルートCodex。
- 確認担当: 最終Sol判定とルートCodex。
- 変更可能: 対象branch、Draft PR、関連する確認済みIssue。
- 変更禁止: main直書き、PR merge、本番公開、Pages公開、有料CI、混在差分の一括stage。
- 受け入れ条件: P08合格後の実行確認があり、PR head SHAと検証SHAが一致し、仕様、承認デザイン、test、残存リスク、handoffを記載する。
- 検証: `git diff --check`、限定stage確認、PR checks、Draft状態確認。
- 停止・昇格条件: P05、P06、P08のいずれか未合格ならDraft PRを作らない。

## 依存順と同時編集

1. P00をSolが審査する。
2. P01をSolが確認し、重大な安全修正を先に凍結する。
3. P02をLunaが単独で実施する。同時にsourceを書く別担当を置かない。
4. P03に追加修正が必要な場合だけTerraが単独で実施する。
5. P04をLunaが実行し、ルートが結果を照合する。
6. P05はTerraが読み取り・検証専任で実行する。
7. P06は人が実施する。モデルは結果を補完しない。
8. P07をLunaが更新し、差分を凍結する。
9. P08を別Solが読み取り専用で実施する。指摘修正後はP04以降をやり直す。
10. 全gate合格後、本書とは別に外部書き込みの対象と権限を再確認できた場合だけP09を有効化する。現時点の実行終点はP08である。

現在の共有worktreeで並行してよいのは、別ファイルを対象とする読み取り専用レビューだけである。source編集、ブラウザ操作、test DB操作、証拠文書更新は順番に行う。

## 現在の完了・未完了

- Luna担当完了: v1.1 fixture kit、manifest SHA `a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`、44 PNG、生成・整合確認をroot検証へ組み込んだ。
- 静的・DB確認済み: fresh/upgrade PostgreSQLはmigration `0033`までPASS。最新root `npm.cmd run check`はfixture 44 PNG/hash一致、format、lint、typecheck、29 files / 202 tests、coverage、API/Web production buildまでPASSした。
- UI確認済み: seeded captureはTOP/OUTER 4、PANTS 5、KNIT `unstretched` 4、候補自動確定なし文言、3 viewport overflow 0、console error/warn 0。solo/dual棚卸は写真、二重読取、3秒確認、復元、承認までPASSし、会計は7/7 mappingとCSV出力、200%相当390×720、loopback request captureまで確認した。
- Terra担当完了: target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`でP05独立100/100（Critical/High/Medium 0）。未完了は実利用者pilot、実iPhone、実MF import、P08最終Sol review。
- 44px修正確認: 初回FAIL後、390pxでheader back 44x44、save 327x48、measurement input 303x44、bottom nav各122x49、overflow 0を再測定した。
- loopback確認: broad bind incident後の修正版runtime netstatは`127.0.0.1:4173`だけ、targeted 24 testsとWeb buildはPASS。外部request、課金、merge、公開は0件。
- 人手・未完了: `WARMUP-01`＋固定10商品pilotと実iPhone Safari。
- Sol担当・未完了: 実装と設計審査を担当していない別Sol maxによる凍結差分の最終独立レビュー。下位モデルの自己確認を代用しない。
- 未確認として記録可能: 実iPhone Safariのホーム追加、カメラ、圏外復帰。これだけではDraft PR単独停止にしないが、成功扱いもしない。

## 2026-08-24 最新ゲート状態

- Luna max相当の証拠文書更新とfixture/UI定型確認は完了。full `npm.cmd run check`は29 files / 202 tests、coverage、lint/typecheck/API/Web buildまでPASSした。
- Sol max領域のfresh/upgrade PostgreSQLは0001〜0033、49-table RLS、immutable reason fields、rollback/preservationをPASS。会計の税未設定block、solo/dual承認競合、mapping世代不変も確認済み。使い捨てDBは削除済み。
- Terra high/xhighのP05独立最終評価はtarget SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`で100/100（Critical/High/Medium 0）。P08のSolレビューは未完了であり、P05をP08の代替にしない。
- P06（実利用者WARMUP＋10商品）、実iPhone Safari/home/camera/offline/HEIC-WebP、実Money Forward import、Draft PR readyは未確認。runtime loopbackのみ、外部/paid/deploy/merge 0件。

## 2026-08-25 P06R最新ゲート

- P05.5/P06Rはtarget application SHA `a976d614819a662cca3be36c23989aecd9ca968e`限定で完了。独立Terra GO、Critical/High/Medium/Low 0、H-P06R-02 Closed、31 files / 209 tests、fresh/upgrade DB、synthetic preflight、loopback-only、390/768/1440pxで横方向overflow 0を確認した。
- P06は次の人手gateとして保持する。人`WARMUP-01`＋固定10商品は未実施で、モデルや合成preflightで代用しない。実iPhone、P08 Sol、Draft PRも未確認。

## 2026-08-27 承認済みUI追補後の再開

- PC03 v4までの最終承認とGoal継続指示を受け、`approved-ui-packets-v1.md`のP10〜P14をP04〜P09より前へ挿入する。
- P10の読み取り専用差分監査はLuna max、P11のWeb設計レビューはTerra highで実施した。共有worktreeのsource書き込みはルートCodexだけが行う。
- P11はDB/API/状態遷移を変更しない範囲でTerra high相当とする。field_worker検索やlabel版の変更が必要ならSol maxへ昇格する。
- P12の気になる箇所、P13の発送前写真は写真・監査・金額・状態を横断するためSol max設計を必須とする。Web表示だけを分離できた後にTerraを使う。
- P11〜P14後に、P04自動検証、P05 UI評価、P06実利用者pilot、P07証拠整合、P08独立Sol reviewを新しい同一SHAでやり直す。2026-08-25以前の合格を最終証拠として流用しない。

## 2026-08-29 runtime接続再監査とP12-A開始gate

- 別Sol maxの読み取り専用監査はCritical 0、High級ブロッカー8群。最新承認UIは視覚127/127に合格したが、静的demoから実API/DBへの接続がなく、Goal全体は未合格と判定した。
- AC/TA対応表は範囲行だけで、AC-001〜055・TA-001〜037の1 IDごとのtestファイル・証拠pathを追跡できない。P07で1 ID 1行へ更新する。
- P12〜P14は実機能として未完了。最初はP12-A contracts・migrationだけを`gpt-5.6-sol` / `max`へ割り当てる。P13/P14とWebは混ぜない。
- P12-A開始前モデル切替gate: 重大領域のため最低能力はSol max。実行担当として明示的なSol max sub-agent、確認担当として別Sol max経路を確認済み。`MODEL_SWITCH_REQUIRED`なし。
- P12-Aの変更可能範囲・不変条件・検証は`approved-ui-packets-v1.md`を正本とする。fresh/upgrade PostgreSQLを実行できない場合は合格にせず、証拠と再開条件をhandoffへ残す。
- Draft PR #9はUI確認用Draftとして保持し、Goal合格・ready・merge可能とは表示しない。本番公開とPR mergeは行わない。

## 2026-08-29 P12-A完了とP12-B商品gate

- P12-A sourceは`gpt-5.6-sol` / `max`の唯一writerが実装し、別Sol maxが3回の敵対的reviewを行った。最新状態の陳腐化、任意workspace/identity/timeの権限probe、同時訂正の実証不足を順に修正し、最終Critical/High/Medium/Low 0でPASSした。
- rootは公式PostgreSQL 18.6でfresh、upgrade、2独立接続の実Lock競合を実行し、最終`npm.cmd run check`までPASSした。P12-Aは合格、P12-B technical gateはGO。
- Luna maxの読み取り専用棚卸しでは、6商品種類の件数はあるが、安定keyと必須／任意が未確定で、そのまま安全にseedできないと判定した。
- Sol maxは承認済み件数を変えない推奨A／代替Bを`p12-product-template-proposal-v1.md`へ整理した。利用者確認までは提案であり、P12-B source書込みを開始しない。
- 利用者が2点を確認後、次の空きmigration 0036・RLS・完了manifest・非公開mediaはSol max、固定fixtureと対応表はLuna max、API契約固定後のWeb接続はTerra high、最終権限・offline・media reviewは別Sol maxへ割り当てる。

## 2026-08-29 P13発送前写真の設計gate

- 製品gate: GO。承認済みPC08と全ページ忠実再現指示から、初回UIは`高額商品だけ撮る`を推奨選択、目安額は空欄、写真使用時は商品写真と梱包後写真を各1枚以上と固定した。架空例30,000円はseedしない。
- 設計gate: 別`gpt-5.6-sol` / `max`が現行order/media/financeとの差を監査し、P13-Aを重大と判定した。最低能力はSol max、適格なwriterと別Sol reviewerが利用可能なため`MODEL_SWITCH_REQUIRED`なし。
- P13-A: 新規`0035_shipping_preflight_photo.sql`、strict contracts、order repository/API、private storage、nullable販売額、fresh/upgrade/concurrencyをSol maxの唯一writerへ割り当てる。P12-Bへ依存させない。
- P13-B: backend contractと権限が独立Sol判定で凍結した後だけ、実運用Web接続をTerra highへ分離する。静的approved review routeは変更しない。
- P12-B: 未承認提案のmigration候補は0036へ移す。項目、seed、API、Webは利用者確認まで引き続き停止する。
- 正本: `docs/implementation/p13-shipping-photo-contract-v1.md`。

## 2026-08-30 P13-A完了とP13-B割当

- P13-Aは`gpt-5.6-sol` / `max`の唯一writerが実装し、別Sol maxが販売額basis、権限、追記履歴、再送、同時操作、旧`packed`注文の更新回復を敵対的に確認した。
- rootは新規fresh DBへ35 migrationを適用して`test:postgres`を、新規upgrade DBで0001〜0035の`test:postgres-upgrade`を実行した。最終`npm.cmd run check`は35 files / 271 tests、format/lint/typecheck/build、Next 86 routesをPASSした。
- 別Sol maxの最終判定はCritical 0 / High 0 / Medium 0 / Low 0、P13-A PASS、P13-B gate GO。P13-Bだけを`gpt-5.6-terra` / `high`へ割り当て、静的approved review routeを変更せず実運用routeを接続する。
- P13-Bは390/768/1440px、キーボード、44px target、読込・空・失敗・再試行、loopback以外のrequest 0を実ブラウザで確認する。DB、金額、権限、状態契約へ変更が必要になった場合はTerraで推測せずSolへ戻す。
- P12-B/Cは利用者の2項目確認待ち、P14はP13-B後。Draft PR #9はDraftのまま維持し、merge、本番公開、課金、外部APIを行わない。

## 2026-09-03 P14-R1 0039実DB境界試験の補強

- 目的と参照: 最終独立レビューのLow 1を解消し、`0039_registered_order_missing_financial_facts.sql`が登録注文の不正な金額件数・SKU・税設定を実PostgreSQLで拒否することを証明する。参照は`docs/DECISIONS.md`の2026-09-03金額欠損判断、`apps/api/src/postgres-integration.ts`、migration 0039。
- リスク: 重大。理由は金額事実、発送確定、DB制約、transaction rollbackへ触れるため。
- 実装担当: `gpt-5.6-sol` / `max` / P14-R1専任writer。
- 確認担当: 実装担当とは別の`gpt-5.6-sol` / `max`による読み取り専用レビュー。
- 実装運転モード: `cost-optimized`。
- モデル切替ゲート: 設計・開始前ともPASS。最低必要能力Sol maxと実行担当が一致し、別Solレビュー経路も利用可能。`MODEL_SWITCH_REQUIRED`なし。
- 変更可能: `apps/api/src/postgres-integration.ts`だけ。各試験ケースは独立transaction内で不正状態を一時作成し、期待したDB拒否でtransaction全体をrollbackする。
- 変更禁止: migration 0039本体、0038以前、production contract/API/repository/Web、承認済みUI、実データ、既存DBの永続変更、Git/PR操作、外部送信。
- 実装内容: 登録済み・梱包済み・発送準備確認済み注文について、原価0件、原価2件、販売額2件、手数料2件、梱包費2件、別SKU、異なる税設定を個別に作り、`shipment_human_confirmation`をSQLSTATE 23514で拒否する。各拒否後に注文状態、発送確認、送料事実が増えていないことを確認し、既存の正常発送試験を維持する。
- 受け入れ条件: 7境界が実PostgreSQLで個別に拒否され、各transactionが残骸0でrollbackし、正常な欠損fee/packaging注文とlegacy/P13注文の発送互換を壊さない。
- 検証: 新規使い捨てDBの`npm.cmd run test:postgres`、必要な対象test、`npm.cmd run check`、`git diff --check`、別Sol maxレビュー。
- 停止・昇格条件: 現行migrationの実不具合、既存互換の破壊、試験外ファイル変更の必要、期待外SQLSTATE、原因不明の失敗を検出したら変更を広げずルートSolへ戻す。
- 実行結果: Sol max writerは許可された実DB試験ファイルだけを変更した。rootはfresh `resale_p14r_fresh_20260903a`、upgrade `resale_p14r_upgrade_20260903a`、full checkをPASSし、production SQL/API/WebとUIの変更0件を確認した。
- 独立判定: 別Sol max reviewerはCritical 0 / High 0 / Medium 0 / Low 0でPASSし、以前の0039試験不足LowをClosed、限定commitとDraft PR更新を可とした。`MODEL_SWITCH_REQUIRED`は発生しなかった。

## 2026-09-03 P15 モバイル上部の端末表示削除と余白改善

- 目的と参照: 実iPhoneではOS側に時刻・電波・電池が表示されるため、Web画面内で重複している固定表示（`9:41`、Dynamic Island、電波、Wi-Fi、電池`77`）を削除し、利用者が確認・操作できる縦方向の領域を増やす。参照は2026-09-03の利用者指示と添付画像。
- リスク: 低。保存、API、DB、権限、金額、状態遷移を変えないモバイル表示とCSSだけの修正。
- 実装担当: `gpt-5.6-luna` / `max` / `p15_mobile_header_luna`。共有worktreeのsource書き込み担当はこの担当だけにする。
- 確認担当: 実装担当とは別のSolによる読み取り専用差分確認と、ルート担当による実ブラウザ比較。
- 実装運転モード: `cost-optimized`。
- モデル切替ゲート: 開始前PASS。最低必要能力はLuna maxで、利用可能な担当と一致する。DB、認証、権限、PC画面、承認済み本文、原因不明の表示崩れへ波及した場合は変更を広げずSolへ戻す。
- 変更可能: `approved-mobile-demo`のTSX/CSS、同じモバイル枠を使うlive loginとlive shippingのTSX、対応するsource contract test、検証後の本計画・Loop・decision・handoff。
- 変更禁止: API、DB、contracts、PC専用画面、本文・カード密度、外部接続、有料サービス、実データ、PR ready化・merge。
- 受け入れ条件: 75画面の公開モバイル確認版、live login、live shippingから擬似端末表示が消える。390×844で上部29pxの固定領域を残さず、アプリヘッダーは通常時56px、本文は残り高さを使い、横あふれ0とする。実iPhoneのノッチには`env(safe-area-inset-top)`で重ならない。PC表示は変更しない。
- 検証: 対象Vitest、root `npm.cmd run check`、review production build、390×844の修正前後計測・画像比較、代表モバイル画面、ログイン、live shipping、公開GitHub PagesのHTTP/commit確認。
- 実行結果: Luna max担当が許可されたモバイルUI・CSS・対応testだけを変更した。擬似端末表示を静的75画面、live login、live shippingから削除し、通常ヘッダーを56px、本文を可変残り高さ、ログインを上下safe-area対応にした。PC、API、DB、contracts、業務文言の変更は0件。
- 自動検証: 対象2 test files / 17 tests、root `npm.cmd run check`の45 files / 403 tests、format、lint、typecheck、API/Web production buildをPASS。review production buildは134 pages、139 exported files、766 precache filesを生成した。
- 画面検証: 390×844の画面04は擬似status barなし、header `y=0 / h=56`、本文`y=56 / h=788`で、修正前より37pxを本文へ戻した。画面01は擬似表示なし、本文`y=0 / h=844`、上下padding 8px。全75 routeは横overflow、縦overflow、clipped interactive、external resourceが各0件。
- 独立判定: 別Solは初回PASS（Critical 0 / High 0 / Medium 0 / Low 1）。広すぎるCSS回帰testだけをLuna maxが対象2 test files内で限定修正し、別Solの再確認でLowをClosed、Critical / High / Medium / Low各0、最終PASSとした。
- 状態: source・自動検証・ローカル画面検証・独立レビューを完了。限定commit、既存Draft PR、GitHub Pages確認版の更新へ進める。実iPhone Safariのsafe-areaとホーム画面表示は利用者確認まで未確認として残す。

## 2026-09-08 P16-A 商品調査の本人操作支援

- 目的と参照: AC-067とTA-048に従い、実運用の商品調査画面へ、確認済み商品情報から作る検索語とCodex用質問文の候補、編集、コピー、本人クリックによる公式メルカリ検索を接続する。参照は`mvp-product-spec-v1.md`、`approved-ui-integration-addendum-v1.md`、`approved-ui-packets-v1.md`、PC02 v3。
- リスク: 中程度。外部サイトを開くブラウザ操作とクリップボードを扱うが、API、DB、権限、金額確定、業務状態は変更しない。
- 実装担当: `gpt-6-astra` / `low` / `p16_ac067_handoff`。商品調査パネル、専用helper、対応testだけの唯一writerとする。
- 確認担当: 実装担当とは別実行の`gpt-6-astra` / `low`による読み取り専用レビューと、ルート担当による自動試験・実ブラウザ確認。
- 実装運転モード: `astra-centric`。親セッションの実モデルと利用単価は取得できないため未確認・未計測とし、委任準備、再読、統合、検証を含む総消費は完了後に定性的に振り返る。
- モデル切替ゲート: 開始前PASS。API、DB、契約、認証、権限、金額確定、外部自動通信、承認済み静的画面の変更が必要になった場合、または原因不明の失敗が出た場合は変更を広げずルートへ戻し、Astra medium以上を再評価する。
- 変更可能: `apps/web/src/components/product-research-panel.tsx`、必要な`apps/web/src/lib/product-research-handoff.ts`とtest、`apps/web/src/app/globals.css`、対象source-contract test、検証後の証拠文書。
- 変更禁止: API、DB、contracts、migration、P12商品テンプレート、承認済み静的mobile/PC demo、外部API、自動送信、自動取得、スクレイピング、RPA、Cookie共有、価格自動確定、PR ready化・merge。
- 実装内容: 確認済み属性を優先し、なければ不採用でない候補から検索語を安定順で正規化・重複除去する。利用者の編集を再読込で上書きしない。質問文は確認済み事実と検索語だけから作り、価格を未確認の候補と明記する。検索URLは`https://jp.mercari.com/search?keyword=<encoded>`だけを本人クリック時に`noopener,noreferrer`で開く。コピー失敗を成功表示せず、空検索語では外部を開かない。P06中は全操作を表示・実行しない。
- 受け入れ条件: 検索語と質問文を編集・コピーでき、成功と失敗を正しく表示する。本人クリック前の外部通信0、自動Codex送信0、許可外host 0、未確認価格の自動確定0、pilot中の外部操作0。390/768/1440pxで横あふれ0、主要操作44px以上、キーボード操作可能とする。
- 検証: helper単体test、source-contract test、対象Vitest、format/lint/typecheck、root `npm.cmd run check`、loopback限定の実ブラウザで通常時とpilot時を確認し、凍結差分を別実行でレビューする。
- 停止・昇格条件: 外部検索結果の取得、Codex接続、価格決定、API/DB保存、P12項目判断、承認済み静的画面の変更が必要なら停止する。クリップボード非対応時は失敗を明示し、別の未承認fallbackを独断で追加しない。
- 状態: 実装中。AC/TA監査は完了し、GitHub Actionsの手動実行方針は現HEADと文書で一致した。P12の2判断、PC29文言、人手4gateは別の未解決項目として保持する。

## 2026-09-08 P17 TA-014 通常バックアップ復元の限定修正

- 目的と参照: `technical-architecture-v1.md`のTA-014と再開中Goalに従い、架空データの通常`pg_dump`→空DBへの`pg_restore`を成功させ、件数・値・関連・ハッシュ、原本写真メタデータ、監査履歴、復元後権限を照合する。
- 基準測定: PostgreSQL 18.6の専用loopback環境で、70 tables / workspace 1 / SKU 2 / media 1 / audit 3を持つ復元元から作成したcustom dumpは成功したが、空DBへの通常復元は`inventory_unit`のCOPY中に`app_code_check_digit(text) does not exist`で終了コード1となった。
- リスク: 重大。DB復元、既存データ、関数探索経路、権限と監査証拠へ関係するため。
- 実装担当: ルートCodexを唯一writerとし、原因調査、失敗する回帰test、追加migration、実PostgreSQL照合だけを担当する。旧migrationの書換えやUI変更は行わない。
- 確認担当: 実装凍結後、実装担当とは別実行の`gpt-6-astra` / `medium`が読み取り専用で差分、復元証拠、権限・安全境界を確認する。
- 実装運転モード: `astra-centric`。定型抽出のためだけに別writerを増やさず、独立レビューにだけ別実行を使う。
- 変更可能: 新しい前進migration、DB migration contract test、通常復元の再発防止test/試験スクリプト、upgrade PostgreSQL試験、今回に必要な実装・終了証拠文書。
- 変更禁止: `0015_shipping_assignment_checked_codes.sql`を含む既存migration、Web/モバイル/PC UI、API業務契約、production DB、外部Storage、GitHub push/Pages/PR更新、既存未送信差分の破棄。
- 原因仮説: 0015で作られたSQL関数が、dump復元時の制限された`search_path`下で別のpublic関数を非修飾名で呼ぶため、COPY時の関数inliningで探索できない。追加migrationで固定`search_path`とschema修飾を与えるまで仮説として扱う。
- 受け入れ条件: 修正前に回帰testがFAILし、追加migration後にPASSする。通常dump/restoreが終了コード0となり、全public tableの集合、件数、正規化した全行値のSHA-256、外部キー定義・検証状態、media原本参照/ハッシュ、audit履歴が一致する。runtime roleはLOGIN/SUPERUSER/BYPASSRLSを持たず、復元先で必要権限とRLS強制が維持される。
- 検証: 対象Vitest、fresh PostgreSQL、upgrade PostgreSQL、修正前後の通常dump/restore、破損dump・非空復元先・同一DB・権限不足など既存/追加failure checks、root `npm.cmd run check`、`git diff --check`、別Astra mediumレビュー。
- 停止・昇格条件: 2ラウンドで合格しない、原因が関数探索以外、既存migration変更や本番/外部書込みが必要、対象外機能の不具合を検出、検証用DBを使い捨てと確認できない場合は範囲を広げず終了報告へ移る。
- Round 1結果: 修正前FAILを再現し、forward migration 0040、事前に失敗する回帰test、通常restore scriptを追加。正常restore、fresh/upgrade、root checkをPASSした。
- 初回独立レビュー: Astra mediumはCritical 0 / High 1 / Medium 1 / Low 2でFAIL。継承`PG*`による接続先分離をHigh、生stderrの行値露出可能性をMedium、media linkとsequence状態をLowとした。
- Round 2結果: 数値loopback・安全な接続識別子・query/hash拒否、全継承`PG*`除去、stderr秘匿、media realpath、sequence `is_called`、workspace別RLS件数を追加。正常restoreとjunction拒否、50 files / 431 testsのroot checkをPASSした。
- 最終独立レビュー: 同じAstra mediumがPASS。Critical 0 / High 0 / Medium 0 / Low 1。残るLowはIPv6形式が安全側に接続失敗する互換性で、正式手順を実証済みIPv4 `127.0.0.1`へ限定する。
- 状態: P17完了。TA-014 PASS。TA-026は実providerの頻度・RPO/RTO未計測のためNOT_RUN/partial。2ラウンドと1回+再レビューの上限を使い切り、追加実装へ拡張しない。

## 2026-09-09 P20 P0最終候補

- 実装運転モード: `cost-optimized`。軽微で範囲が明確な商品写真権限の回帰修正は`gpt-5.6-luna` / `max`へ限定し、DB復元・在庫・担当変更など重大領域は上位モデルで実装済みの差分と独立レビュー証拠を再利用した。
- 最終候補は63 test files / 580 tests、fresh・upgrade・通常restore、承認127画面、live 10 route×3幅を同一差分でPASSした。
- 独立再レビューはCritical 0 / High 0 / P0阻害Medium 0 / Low 2。Lowは正式なIPv4手順と未公開migration一括適用では現在のP0を止めないため、追加の高コスト担当は増やさず終了条件を満たした。
- P0全94項目のうち83項目は証拠付きPASS、残り11項目は実iPhone・物理印刷・公式Money Forward・固定10商品・利用者判断が必要な`WAITING_HUMAN`。Codex側の未完了は0項目。
- commit、push、PR ready化、merge、Pages更新、本番公開、外部runtime API、有料サービスは行わない。
