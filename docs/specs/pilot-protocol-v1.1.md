# 10商品・出品準備時間pilot手順 v1.1

- 状態: fresh/upgrade PostgreSQLはmigration `0033`までPASS、root full check PASS。seeded browser UIの指定操作は確認済み、最終独立P05スコア・実利用者pilot待ち
- 更新日: 2026-08-24（JST）
- 計測版: `listing_prep_pilot_v1.1.0`
- DB migration版: `0033`
- fixture manifest SHA-256: `a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`
- 目的: 同じ架空素材と条件で試作品内の出品準備時間を比較する。実際の事業成果や将来の処理時間を保証しない

## 0. 現行状態と開始禁止条件

- 最新root `npm.cmd run check`はfixture 44 PNG/hash一致、format、lint、typecheck、29 files / 201 tests、coverage（statements 84.66%、branches 80.56%、functions 100%、lines 90.68%）、API/Web production buildまでPASSした。
- migration `0033`のfresh PostgreSQL結合試験と既存データupgradeはPASSした。seeded browserでは会計7/7 human mappingと27列5行CSV、solo/dual棚卸の写真・二重読取・3秒確認・復元・承認、capture属性確認、200%相当390×720、loopback request captureまで確認済みである。最終独立P05スコア、実利用者warm-up＋10商品pilotは未確認または未実施である。
- 同じ検証対象commitの最終独立P05スコアが合格するまで、本pilotを開始しない。合格後に実利用者が本手順のwarm-up＋10商品を実施する。過去commitの暫定96/100やmigration `0032`までの結果をv1.1全体の合格へ流用しない。
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
- 外部AI、外部Storage、販売チャネル、Notion、会計サービス、有料serviceへ接続しない。外部network requestは0件とする。
- 実顧客、購入者、住所、口座、税務資料、実商品写真、実在ブランドは使わない。fixture kitの架空データだけを使う。
- iPhone実機を後日測る場合は別run IDとし、Windowsの10商品へ混ぜない。機種、iOS、Safari version、通信条件を別記録する。

## 4. 人が行う操作

1. `npm.cmd run pilot:fixtures:check`のPASS、PostgreSQL実走PASS、現行commitのUI再評価PASSを確認する。
2. `WARMUP-01`の4画像、属性、採寸を使って1点練習し、計測対象から除外する。
3. 空の新規商品画面で40文字commit SHA、migration `0033`、manifest SHAを確認し、新しいrunを開始する。
4. 画面の「次の固定商品」とCHECKLISTのfixture IDが一致することを確認する。
5. 対応する4枚のローカルPNGを各roleへ手動で選び、属性とtag textを人が照合し、固定templateの採寸値を入力する。
6. 必須画像、最新採寸、属性revision、候補根拠、出品用コピーを人が確認して保存する。成功した商品や入力しやすい商品へ差し替えない。
7. 10商品を中断せず固定順で完了する。自動pauseは使わない。

## 5. 最新値、訂正、無効なrun

- 写真はroleごとの最新確定画像を有効とする。別roleの画像で補完せず、4roleがすべて必要である。
- 採寸は各definitionの最新attemptを有効とする。過去attemptを削除せず、差戻しと再入力を履歴へ残す。
- ブランド、サイズ、色等の属性はappend-only revision（過去を上書きせず訂正版を追加する方式）で訂正し、最新の人確認済みrevisionを有効とする。
- 利用者が画像、採寸、属性、文章を訂正した場合は`manual_correction`として数える。訂正件数を隠したり、0へ戻したりしない。
- browser reload不能、アプリ/API/DB error、server restart、fixture読込失敗、manifest不一致等、アプリまたは検証環境の不正が1件でもあれば、そのrunは性能不合格とする。
- 利用者都合の中断も不合格とする。停電やOS強制update等の外部事故だけはrun全体を`externally_invalidated`とし、新run IDで10商品を最初からやり直す。

## 6. 開始、終了、記録

- 開始event: 空の新規商品画面で利用者が「商品を作成」を押し、serverが`pilot_item_started`を受理した時刻。
- 終了event: 画像、採寸、属性revision、候補根拠を人が確認し、copy-ready revisionをserverが保存した`pilot_item_completed`時刻。
- 経過時間は`completed_at - started_at`のwall-clock秒とし、画像選択、入力、検査、訂正、保存待ちを含める。
- DBのserver時刻を正本とし、CHECKLISTへ開始・終了時刻を手書きしない。
- runには`pilot_run_id`、protocol version、fixture manifest SHA、commit SHA、migration version、platform/browser、viewport、actorを保存する。
- 商品ごとにfixture ID、開始/終了、経過秒、invalid、画像欠損、採寸差戻し、label/場所不一致、誤格納、通信再送、manual correctionを記録する。
- P50、P75、最小、最大をserver記録から計算する。10商品の中央値は昇順5番目と6番目の平均とする。

## 7. 合格条件

- 10商品すべてが完了し、`invalid_attempt_count=0`、`externally_invalidated=false`、中央値300秒以下である。
- 誤格納0件、未確認copy-ready 0件、必須画像/採寸/属性の欠損0件、外部network request 0件である。
- 300秒超過、invalid、欠損、差戻し、manual correctionを隠したり、商品を入れ替えたりしない。条件未達を記録し、修正後は新run IDでwarm-up確認後に10商品すべてをやり直す。
- このpilotは試作品内の出品準備操作時間であり、仕入判断、実撮影、販売、配送、税務処理の総時間ではない。

## 8. 現時点の実施状態（2026-08-24）

- fixture 44 PNG/hash、DB migration `0033`、seeded UIの準備確認はPASSしているが、ここに記すprotocolの実利用者runはまだ開始していない。
- 未実施: 人が行う`WARMUP-01`＋固定10商品、実iPhone Safari/home/camera/offline/HEIC-WebP。モデルやseeded browserの結果で10商品runを代用しない。
- run開始前に、最新full check（29 files / 201 tests、coverage、lint/typecheck/API/Web build）、fresh/upgrade PostgreSQL 0033、現行UIの最終独立reviewを再確認する。実施後は本protocolの開始・終了event、wall-clock、欠損、差戻し、manual correction、外部network 0件をrun単位で保存する。
