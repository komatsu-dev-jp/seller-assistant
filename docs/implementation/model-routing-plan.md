# P0 cost-optimized モデル割当計画

- 状態: active
- 更新日: 2026-08-24 JST
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
