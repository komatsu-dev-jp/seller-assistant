# 10商品・出品準備時間pilot手順 v1

- 状態: 手順・計測基盤確定、実利用者による10商品pilot待ち
- 更新日: 2026-08-24（JST）
- 計測版: `listing_prep_pilot_v1.0.0`
- 目的: 試作品内の作業時間を同じ条件で比較する。実際の事業成果や将来の処理時間を保証しない

## 0. 現行状態

- `21fbff4`で新しいrunは実際のDB migration版`0032`を記録し、過去の`0023`〜`0031`を読める。最新migrationとpilot定数のずれは自動testで停止する。
- 1商品完了＋1商品意図的中断による計測基盤は確認済みだが、実利用者による固定10商品の合否結果は未取得。
- 現行commitのUI 8 task再評価が終わるまで新しい本計測を開始しない。開始時は画面へ検証対象の40文字commit SHAを入力し、1点のwarm-up完了を本人が確認する。

## 1. 対象

- 架空または検証専用の異なる商品10点を使い、実顧客・購入者・住所・口座・税務資料を使わない。
- P0対応カテゴリから、トップス4、アウター2、パンツ2、ニット2を固定する。
- 各商品へ正面/背面/タグ/品質表示の検証画像4枚、定義済み採寸4項目、ブランド/サイズ/色の架空入力を用意する。
- 1点のwarm-up（練習）は計測外とし、その後の10点を連続して計測する。成功した商品だけへ差し替えない。

## 2. 環境

- Windows、同じPC、同じChrome major version、390×844 viewport、同じlocal API/PostgreSQL、同じfixture asset、同じ担当者で10点を行う。
- CPU、メモリ、browser version、commit SHA、DB migration version、開始/終了JSTを証拠へ残す。
- iPhone実機を後日測る場合は別run IDとし、Windowsの10点へ混ぜない。機種、iOS、Safari version、通信条件を記録する。
- 外部AI、外部Storage、販売チャネル、Notion、会計サービスへ接続しない。

## 3. 開始と終了

- 開始event: 空の新規商品画面で利用者が「商品を作成」を押し、serverが`pilot_item_started`を受理した時刻。
- 終了event: 必須画像、採寸、候補根拠を人が確認し、出品用コピーのcopy-ready revisionをserverが保存した`pilot_item_completed`時刻。
- 経過時間: `completed_at - started_at` のwall-clock秒。画像選択、入力、検査、差戻し修正、保存待ちを含める。
- browser reload不能、アプリ/API/DB error、server restart、fixture読込失敗等の製品・検証環境起因の`invalid_attempt`が1件でもあれば、そのrunは性能不合格とする。診断のため同じ商品を再試行しても、失敗を中央値から消さず`invalid_attempt_count`へ残す。修正後に合格を主張する場合は、新run IDで10点すべてを最初からやり直す。
- 自動pauseは設けない。利用者都合の中断も当該runを不合格にする。OSの強制update、停電等、アプリと無関係な外部事故だけはrun全体を`externally_invalidated`として性能判定対象外にし、新run IDで10点すべてをやり直す。外部事故の種類と時刻を記録する。

## 4. 記録項目

- `pilot_run_id`, `protocol_version`, `commit_sha`, `migration_version`, `platform`, `browser`, `viewport`, `actor_id`。
- 商品ごとの`product_fixture_id`, `started_at`, `completed_at`, `elapsed_seconds`, `invalid_attempt_count`。
- 必須画像欠損、採寸差戻し、label/場所不一致、誤格納、通信再送、manual correctionの件数。
- P50（中央値）、P75、最小、最大。10点の中央値は昇順5番目と6番目の平均とする。

## 5. 合格と解釈

- 主目標: 10点すべてが完了し、`invalid_attempt_count=0`、`externally_invalidated=false`で、中央値が300秒以下。
- 安全gate: 誤格納0件、未確認のcopy-ready 0件、欠損を0扱いした商品0件、外部network request 0件。
- 300秒超過またはinvalid attempt 1件以上でも、測定を隠したり商品を入れ替えたりしない。結果と遅い/失敗工程をDraft PRへ記載し、Goalの効率条件未達としてLoopを続ける。
- このpilotは試作品の操作時間であり、仕入判断、実撮影、販売、配送、税務処理の総時間ではない。
