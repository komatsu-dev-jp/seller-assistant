# 10商品・出品準備時間pilot手順 v1.1

- 状態: P05.5/P06Rの第4修正後、root full checkとfresh/upgrade PostgreSQLはPASS。修正版commit、同一SHAの実ブラウザ確認、独立再監査がPASSするまで実利用者pilotを開始しない
- 更新日: 2026-08-25（JST）
- 計測版: `listing_prep_pilot_v1.1.0`
- DB migration版: `0033`
- fixture manifest SHA-256: `a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`
- 目的: 同じ架空素材と条件で試作品内の出品準備時間を比較する。実際の事業成果や将来の処理時間を保証しない

## 0. 現行状態と開始禁止条件

- 最新root `npm.cmd run check`はfixture 44 PNG/hash一致、format、lint、typecheck、31 files / 209 tests、coverage（statements 84.66%、branches 80.56%、functions 100%、lines 90.68%）、API/Web production buildまでPASSした。
- migration `0033`のfresh PostgreSQL結合試験と既存データupgradeはPASSした。fresh試験には通常失敗後と外部事故無効化後の両方で、新しいrunのTOP-01を重複なく作成できる確認を含む。seeded browserでは会計7/7 human mappingと27列5行CSV、solo/dual棚卸の写真・二重読取・3秒確認・復元・承認、capture属性確認、200%相当390×720、loopback request captureまで確認済みである。P05独立Terra 100/100はPASS、実利用者warm-up＋10商品pilotは未実施である。
- target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`のP05独立Terraは100/100（Critical/High/Medium 0）で合格した。その後にP06開始前監査で外部URL導線と訂正記録の欠損を検出したため、P05.5/P06R修正版の同一SHA再確認が終わるまで開始しない。過去commitの暫定96/100やmigration `0032`までの結果をv1.1全体の合格へ流用しない。
- `docs/specs/pilot-protocol-v1.md`は`listing_prep_pilot_v1.0.0`の履歴として保持する。新しいrunはこのv1.1だけを使う。

## 1. 固定fixture kit

- 素材の正本は`fixtures/listing-prep-pilot-v1.1/manifest.json`、人向け確認表は`fixtures/listing-prep-pilot-v1.1/CHECKLIST.csv`、準備説明は`fixtures/listing-prep-pilot-v1.1/README.md`とする。
- 通常は次の検証を実行し、manifest SHAと44 PNGが一致しなければ開始しない。

```powershell
npm.cmd run pilot:fixtures:check
```

- 意図して生成物を再作成するときだけ次を使う。再生成後はmanifest SHAが変わり得るため、仕様・契約・テストの更新と独立確認なしにpilotへ使わない。

```powershell
npm.cmd run pilot:fixtures:generate
```

- 計測外の練習は`WARMUP-01`の1点とする。warm-upの時間と結果を10商品の集計へ含めない。
- 本計測は次の10商品を入れ替えず、順番どおり連続して行う。

1. `TOP-01`
2. `TOP-02`
3. `TOP-03`
4. `TOP-04`
5. `OUTER-01`
6. `OUTER-02`
7. `PANTS-01`
8. `PANTS-02`
9. `KNIT-01`
10. `KNIT-02`

- 各fixtureにはローカルPNGを`front`、`back`、`brand_tag`、`care_label`の4枚用意する。利用者が画面の対応する写真欄へ1枚ずつ手動で選び、自動入力や一括自動選択は行わない。
- 各PNGは800×800である。アプリへ入力可能な画像はJPEG/PNG、1枚25MB以下、1辺12,000px以下とする。HEIC/WebPや上限超過ファイルへ差し替えない。
- ブランド、サイズ、色はmanifestとCHECKLISTの架空値を利用者が画面と照合し、人の確認なしで確定しない。

## 2. 固定採寸template

template versionはすべて`1`、単位はcmとする。`basis`は測り方、`state`は衣類の置き方・伸ばし方の状態である。

| カテゴリ | template ID         | 固定項目                                   | basis                                      | state         |
| -------- | ------------------- | ------------------------------------------ | ------------------------------------------ | ------------- |
| tops     | `tops_standard_v1`  | 肩幅、身幅、着丈、袖丈                     | 肩幅/着丈/袖丈=`length`、身幅=`flat_width` | `natural`     |
| outer    | `outer_standard_v1` | 肩幅、身幅、着丈、袖丈                     | 肩幅/着丈/袖丈=`length`、身幅=`flat_width` | `natural`     |
| pants    | `pants_standard_v1` | ウエスト平置幅、股上、股下、わたり幅、裾幅 | 股上/股下=`length`、その他=`flat_width`    | `closed`      |
| knit     | `knit_set_in_v1`    | 肩幅、自然状態の身幅、着丈、袖丈           | 肩幅/着丈/袖丈=`length`、身幅=`flat_width` | `unstretched` |

- 商品別の固定値はmanifestとCHECKLISTを正とする。画面の項目数、定義、basis、stateが一致しなければpilotを開始または継続しない。
- 特にpantsは5項目であり、旧v1.0の一律4項目として扱わない。

## 3. 環境

- Windows、同じPC、同じChrome major version、390×844 viewport、同じlocal API/PostgreSQL、同じfixture kit、同じ担当者でwarm-upと10商品を行う。
- CPU、メモリ、browser version、検証対象の40文字commit SHA、DB migration `0033`、開始/終了JSTをrunの証拠へ残す。
- 外部AI、外部Storage、販売チャネル、Notion、会計サービス、有料serviceへ接続しない。active run中は画面の外部URL・表示価格入力欄を停止し、ローカル4写真・採寸・属性だけを使う。
- 外部network requestは0件とする。ただしアプリはブラウザ全体や別tabの通信を自動計測できない。run開始前から終了後まで専用ブラウザのrequest capture（通信記録）を取り、run IDと結び付け、実施者が`127.0.0.1`以外0件を確認する。アプリ内の`completed`やDBの`summary.passed`だけを最終的な外部通信確認の代わりにしない。
- 実顧客、購入者、住所、口座、税務資料、実商品写真、実在ブランドは使わない。fixture kitの架空データだけを使う。
- iPhone実機を後日測る場合は別run IDとし、Windowsの10商品へ混ぜない。機種、iOS、Safari version、通信条件を別記録する。

## 4. 人が行う操作

1. `npm.cmd run pilot:fixtures:check`のPASS、PostgreSQL実走PASS、現行commitのUI再評価PASSを確認する。
2. `WARMUP-01`の4画像、属性、採寸を使って1点練習し、計測対象から除外する。
3. 専用ブラウザのrequest captureを開始する。空の新規商品画面で40文字commit SHA、migration `0033`、manifest SHAを確認し、画面の通信記録確認欄にチェックして新しいrunを開始する。
4. 画面の「次の固定商品」とCHECKLISTのfixture IDが一致することを確認する。
5. 対応する4枚のローカルPNGを各roleへ手動で選び、属性とtag textを人が照合し、固定templateの採寸値を入力する。
6. 必須画像、最新採寸、属性revision、候補根拠、出品用コピーを人が確認して保存する。成功した商品や入力しやすい商品へ差し替えない。
7. 商品完了後は画面の「次の固定商品へ」で仕入工程へ戻り、10商品を中断せず固定順で完了する。自動pauseは使わない。
8. 最終商品の終了後にrequest captureを止め、run ID、開始・終了時刻、request一覧を照合し、`127.0.0.1`以外0件を人が確認する。

## 5. 最新値、訂正、無効なrun

- 写真はroleごとの最新確定画像を有効とする。別roleの画像で補完せず、4roleがすべて必要である。
- 採寸は各definitionの最新attemptを有効とする。過去attemptを削除せず、差戻しと再入力を履歴へ残す。
- ブランド、サイズ、色等の属性はappend-only revision（過去を上書きせず訂正版を追加する方式）で訂正し、最新の人確認済みrevisionを有効とする。
- v1.1の商品識別子は再runでもworkspace内で重複しないよう、完全なrun UUIDを大文字で含める。SKUは`PILOT-<FIXTURE_ID>-<RUN_UUID_UPPER>`、証憑参照番号は`PILOT-REC-<FIXTURE_ID>-<RUN_UUID_UPPER>`とする。例えばrun IDが`a0000000-b111-4c22-8d33-e44444444444`ならTOP-01のSKUは`PILOT-TOP-01-A0000000-B111-4C22-8D33-E44444444444`となる。画面では両方をread-only（表示だけで編集不可）とし、serverもv1.1のrun IDとfixtureから作った値への完全一致を必須にする。履歴であるv1.0の識別子にはこの規則を遡って適用しない。
- `manual_correction`は初回保存を数えない。既存の確定値に対して、別の写真assetを同じroleへ再保存した時、reviewを解消した採寸attemptを再保存した時、または属性のappend-only revisionを再保存した時だけ、成功した保存と同じDB transactionで1件記録する。失敗した検査や保存、同じ属性の無変更再送は数えない。
- 写真の訂正は撮影工程を確定する前の同一role再保存だけを扱う。採寸は未確定の撮影工程でreview理由付きattemptを追加できる。撮影工程の確定後は写真・採寸を訂正できない。
- 文章候補は確認済み事実から生成するread-only表示で、直接編集する訂正操作はv1.1 UIにない。属性等の事実を訂正しても正しい文章にならない場合、または撮影工程確定後に写真・採寸の誤りを見つけた場合は`invalid_attempt`としてrunを不合格にし、新run IDで最初からやり直す。文章訂正を実装済みと扱わない。
- browser reload不能、アプリ/API/DB error、server restart、fixture読込失敗、manifest不一致等、アプリまたは検証環境の不正が1件でもあれば、そのrunは性能不合格とする。
- 利用者都合の中断も不合格とする。再読み込みを検知した時は計測操作を停止し、通常中断か外部事故かを管理者が画面で選ぶ。停電、OS強制update、端末故障だけは理由付き・冪等な管理者操作でactive run全体を`externally_invalidated`とし、新run IDで10商品を最初からやり直す。終了済みrunを外部事故へ書き換えない。

## 6. 開始、終了、記録

- 開始event: 空の新規商品画面で利用者が「商品を作成」を押し、serverが`pilot_item_started`を受理した時刻。
- 終了event: 画像、採寸、属性revision、候補根拠を人が確認し、copy-ready revisionをserverが保存した`pilot_item_completed`時刻。
- 経過時間は`completed_at - started_at`のwall-clock秒とし、画像選択、入力、検査、訂正、保存待ちを含める。
- DBのserver時刻を正本とし、CHECKLISTへ開始・終了時刻を手書きしない。
- runには`pilot_run_id`、protocol version、fixture manifest SHA、commit SHA、migration version、platform/browser、viewport、actorを保存する。外部通信0件はアプリの自動計測値としてDBへ保存せず、専用ブラウザのrequest captureと実施者チェックをrun固有の運用証拠にする。
- 商品ごとにfixture ID、開始/終了、経過秒、invalid、画像欠損、採寸差戻し、label/場所不一致、誤格納、通信再送、manual correctionを記録する。
- P50、P75、最小、最大をserver記録から計算する。10商品の中央値は昇順5番目と6番目の平均とする。

## 7. 合格条件

- 10商品すべてが完了し、`invalid_attempt_count=0`、`externally_invalidated=false`、中央値300秒以下である。
- 誤格納0件、未確認copy-ready 0件、必須画像/採寸/属性の欠損0件、外部network request 0件である。
- 300秒超過、invalid、欠損、差戻し、manual correctionを隠したり、商品を入れ替えたりしない。条件未達を記録し、修正後は新run IDでwarm-up確認後に10商品すべてをやり直す。
- このpilotは試作品内の出品準備操作時間であり、仕入判断、実撮影、販売、配送、税務処理の総時間ではない。

## 8. 現時点の実施状態（2026-08-25）

- fixture 44 PNG/hash、31 files / 209 tests、DB migration `0033`のfresh/upgrade、P05独立UI再評価100/100はPASSしているが、ここに記すprotocolの実利用者runはまだ開始していない。
- 未実施: 人が行う`WARMUP-01`＋固定10商品、実iPhone Safari/home/camera/offline/HEIC-WebP。P05結果やモデルで10商品runを代用しない。P05.5/P06R修正版のroot検証と独立再確認が終わるまで本pilotを開始しない。
- run開始前に、最新full check（31 files / 209 tests、coverage、lint/typecheck/API/Web build）とfixture hashを確認する。実施後は本protocolの開始・終了event、wall-clock、欠損、差戻し、manual correction、外部network 0件をrun単位で保存する。
