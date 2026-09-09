# P13 発送前写真・安全実装契約 v1

- 状態: approved for implementation
- 作成日: 2026-08-29（JST）
- 運転: `cost-optimized`
- リスク: 重大。販売金額、非公開写真、注文割当、梱包・発送状態、監査を横断する
- 正本: AC-066、TA-047、承認済みPC08 v3、`approved-ui-packets-v1.md`

## 承認から固定できる製品判断

- 初回設定画面は`高額商品だけ撮る`を推奨選択として表示する。
- 架空例の30,000円はDBへ初期投入しない。利用者が正の金額目安を入力して保存するまでpolicyを作成しない。
- 写真を使う注文では、`商品写真`と`梱包後写真`を各1枚以上必要とする。
- 金額が未入力なら0円とみなさず、人が`今回は撮る`または`今回は使わない`を選ぶ。
- 1人運用では撮影者と写真確認者が同じでもよい。ただし写真確認、梱包確認、発送確認は別の操作・記録にする。
- 写真の保存または確認だけで注文を`packed`または`shipped`へ変更しない。

## 現行実装との差

- 現在の注文入力は販売金額を必須の正整数にしており、金額欠損を表せない。
- 現在のWebはランダムUUIDを`packingEvidenceReferenceId`として送り、写真との結び付きがない。
- 現在のDBは`packing_evidence`が1件あれば梱包済みへ進め、3設定、金額判定、注文ごとの選択、写真集合の確認がない。
- 商品用`media_asset`はSKU向け5役割とworkspace単位RLSであり、注文割当単位の発送写真へ役割を偽装して流用しない。

## P13-A データ・contract・API

- 最低能力: `gpt-5.6-sol` / `max`
- 実装担当: 明示的なSol max writerを1人だけ置く。
- 確認担当: 実装をしていない別Sol max。
- migration: `0035_shipping_preflight_photo.sql`。`0034`以前だけに依存し、既存migrationを編集しない。
- P12-Bは未承認のため実装しない。承認後は次の空き番号`0036`を使う。

### 追加する追記専用記録

- `shipping_photo_policy_revision`
  - `high_value_only / all / disabled`
  - `high_value_only`だけ正の金額目安を必須にする。
  - 変更は新revision。過去注文の判断を変更しない。
- `order_shipping_photo_decision`
  - 注文、policy revision、販売金額の有無、判定根拠、注文ごとの人の選択を保存する。
  - 金額欠損を0円に変換しない。
- `shipping_photo_asset`
  - order、割当SKU、`product / packed_package`、SHA-256、MIME、容量、寸法、撮影者、private storage keyを固定する。
  - UPDATE、DELETE、同じkeyへの異なるbytesを拒否する。
- `shipping_photo_confirmation`
  - 確認対象の写真ID完全集合、確認者、サーバー時刻を保存する。
  - 写真追加後の古い確認を有効扱いにしない。
- `shipment_human_confirmation`
  - 写真確認と別に、本人が発送内容を確認した事実を保存する。

### 状態と不変条件

- `choice_required → capture_required → awaiting_confirmation → confirmed`
- または`disabled / threshold未満 / 今回使わない → satisfied_without_photo`
- `high_value_only`で販売額が目安以上なら写真必須。目安未満なら写真なしで充足する。
- 金額またはpolicyが未入力なら、注文ごとの明示選択がない限り先へ進めない。
- 写真を使う場合、最新の`product`と`packed_package`を各1枚以上含む完全集合の人確認が必要。
- policy判定、写真upload、写真確認だけで注文状態を変更しない。
- `pack`は既存の人による梱包確認とP13判定充足を必要とする。
- `ship`は`packed`、有効な注文割当、P13判定充足、独立した発送確認を必要とする。

### 権限と公開境界

- policy変更はownerだけが行う。
- owner／inventory managerはworkspace内注文を扱える。shipping担当は有効な`order_assignment`の注文だけを扱える。
- shipping担当へ販売額、高額目安、原価、利益、税務情報を返さず、必要な工程状態だけを返す。
- 別workspace、割当外、期限切れ、取消済みの一覧、取得、upload、確認、pack、shipをAPIとRLSの両方で拒否する。
- public requestにactor、workspace、SKU、storage key、SHA、確認時刻を受け取らない。サーバーとsessionで確定する。
- contentは`private, no-store`、`nosniff`とし、外部URL、署名URL、Slack、Notion、GitHub、販売先への送信を作らない。
- 圏外時は写真bytesを新しい永続outboxへ保存せず、オンライン再試行を案内する。実iPhone offline確認は別gateに残す。

### 販売金額

- 注文作成時の販売金額はnullableにする。
- null時は架空の0円`financial_event`を作らない。
- P13判定は財務summaryの0円fallbackを使わず、sale eventの存在を直接確認する。
- 後入力は追記型の人確認操作とし、既存の非null finance fixture、計算式、CSV bytes/hashを変更しない。
- 金額がない注文の会計出力は、0円補完せず不足理由を表示して停止する。

## P13-B 実運用Web

- backend contract凍結後にTerra highへ限定委譲できる。
- 静的approved review routeは見た目の正本として変更しない。
- 実運用routeをPC08と承認済みモバイル注文・発送画面へ接続する。
- 初回は`高額商品だけ撮る`を選択表示し、金額目安は空欄。保存前はDB policyなしと明示する。
- 390、768、1440px、キーボード、44px、読込・空・失敗・再試行、外部request 0を確認する。

## 検証

- contracts: strict unknown-field拒否、private field拒否、3 mode、金額null、写真2役割、確認集合。
- DB: RLS、追記専用、revision枝分かれ拒否、別workspace／割当外／期限切れ／取消済み拒否。
- concurrency: 同時policy更新、decision、upload、写真追加対確認、確認対pack/shipを独立接続で攻撃する。
- storage: 原本不変、同一key別bytes拒否、壊れた画像、metadata除去した認証付き表示、補償削除。
- order/finance: nullを0円にしない、非null既存fixture不変、写真だけのpack/ship拒否、再送同一payloadだけ冪等。
- `npm.cmd run check`
- fresh PostgreSQL 0001〜0035
- upgrade PostgreSQL 0001〜0035で既存SKU、写真、pilot、finance、CSV bytes/hash、auditを保持
- 実ブラウザPC08、承認済みモバイル注文・発送、390/768/1440、外部通信0。
- 実iPhoneカメラ／Safari／offlineはWindows証拠で合格扱いにしない。

## 停止・昇格条件

- P12-Bの項目、seed、API、Webへ波及する場合は変更を広げない。
- 既存0034以前のmigration編集、販売額0円補完、写真による自動発送、権限拡大、外部送信が必要なら停止する。
- DB、RLS、金額、状態、同時更新の不明点はSol maxへ戻す。
- P13-AのCritical／Highが0になる前にP13-Bへ進めない。

## 2026-08-30 P13-A検証結果

- 状態: PASS。別Sol maxの最終判定はCritical 0 / High 0 / Medium 0 / Low 0、P13-B gate GO。
- fresh: 新規DB`resale_p13_fresh_20260830f`へ35 migrationを適用し、`npm.cmd run test:postgres`をPASS。64 public tables、59-table RLS matrix、別接続の実Lock競合、権限、金額、private写真、確認、pack/ship、旧`packed`注文回復を確認した。
- upgrade: 新規空DB`resale_p13_upgrade_20260830d`で`npm.cmd run test:postgres-upgrade`をPASS。0001〜0035、既存SKU/media/pilot/finance/CSV bytes・hash/audit、旧梱包行の不変、自動昇格なし、人の再確認後の発送を確認した。
- full: `npm.cmd run check`は35 files / 271 tests、format/lint/typecheck、API/Web build、Next 86 routesをPASS。
- P13-Bへ進めるが、AC-066／TA-047全体は実運用Web、390/768/1440、keyboard、外部通信0、実iPhone確認が終わるまでpartialとする。
