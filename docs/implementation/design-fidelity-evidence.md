# Slack承認済みデザイン反映証拠

- 更新日: 2026-08-24（JST）
- 状態: `c63eb5b`の独立UI評価は暫定96/100。現行実装`21fbff4`の同一commit再評価待ち
- UI正本: `docs/design/selected-direction.md`
- 修正版A承認: `docs/design/revised-a-approval-v2.md`

## 結論

Slack承認画像を参考資料ではなくUI受け入れ基準として扱う。PCは白い高密度ワークベンチ、細い左ナビ、中央の業務情報、右または上部の確認領域にした。スマホはPC画面の縮小版にせず、承認モックと同じく1画面1目的で工程を切り替える。

モック内の架空金額・件数・写真は固定表示せず、実装はローカルPostgreSQLの保存データだけを表示する。未取得値は `—` または空状態とする。

## 画面別の対応

| 画面     | 承認画像                                                                                  | 実装route                 | 反映内容                                                                                                                        | 実画面証拠                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ホーム   | `home-concept-c-owner-pulse-v1.png`                                                       | `/`                       | スマホは「今日の確認」を先頭にし、PCは4 KPI、月間ウォーターフォール、今日の確認、在庫年齢、仕入先概要を配置。                   | `output/playwright/design-fidelity/home-desktop-slack-approved-final-1440x1000.png` / `home-mobile-slack-approved-final-390x844.png`                                                                                   |
| 在庫管制 | `web-10-inventory-location-workbench-v1.png`                                              | `/inventory`              | 場所ツリー、部屋・棚・正確な位置の非公開写真、写真確認、場所登録、現物在庫を同じPC作業台へ配置。                                | `output/playwright/design-fidelity/inventory-desktop-slack-approved-final-1440x1000.png`                                                                                                                               |
| 在庫現場 | `mobile-12-inventory-location-operations-v1.png`                                          | `/mobile`・`/mobile/scan` | 「今日の現場作業」から商品ラベル→場所ラベル→確認へ進む。PC在庫表をスマホ幅へ縮めた `/inventory` をM12の比較対象にはしない。     | `output/playwright/design-fidelity/inventory-mobile-field-home-slack-approved-final-390x844.png` / `inventory-mobile-scan-slack-approved-final-390x844.png`                                                            |
| 棚卸差異 | `web-11-solo-discrepancy-control-v4.png` / `mobile-13-solo-discrepancy-v2.png`            | `/inventory/stocktake`    | PCは差異キュー＋詳細。スマホは運用モード、商品読取、差異確認、ラベルを工程別に表示し、全フォームの縦積みを廃止。                | `output/playwright/design-fidelity/stocktake-desktop-slack-approved-final-1440x1000.png` / `stocktake-mobile-slack-approved-final-390x844.png` / `stocktake-mobile-difference-slack-approved-final-390x844.png`        |
| 会計候補 | `web-12-accounting-profile-export-guard-v2.png` / `mobile-14-accounting-readiness-v2.png` | `/accounting`             | PCは設定・mapping・出力ペイン。スマホは出力形式、会計設定、科目候補、CSV確認を工程別表示。未登録mappingを空欄から人が入力する。 | `output/playwright/design-fidelity/accounting-desktop-slack-approved-final-1440x1000.png` / `accounting-mobile-format-slack-approved-final-390x844.png` / `accounting-mobile-profile-slack-approved-final-390x844.png` |

## 共通デザイン

- 白・薄灰の作業面、濃紺文字、青の主要操作、琥珀の要確認、緑の完了を共通化した。
- PC左ナビは白地の細幅とし、現在地を淡青背景と青い位置マーカーで示した。
- モバイル下部ナビは5項目を1行に収め、アイコンと文言を併用した。
- 状態は色だけでなく文言、件数、アイコンを併用した。
- 主要ボタン、リンク、入力欄は44px以上。1pxの非表示ファイル入力と標準checkboxは、44px以上の表示ラベルまたは操作行から操作する。
- 7台のiPhoneを並べた承認画像は工程図であり、実アプリでは同じ順序を現在工程ごとに1画面ずつ表示する。

## 意図的に同一にしないもの

- モック内の架空の売上額、商品件数、担当者、商品写真は実装へ固定しない。
- 実在サービスのロゴ、外部API接続、自動送信、自動出品、自動値下げは追加しない。
- 税務項目と勘定科目は候補・本人入力として表示し、自動確定しない。
- 承認画像内の端末外枠、時刻、説明用の画面番号は製品UIへ入れない。

## 現行検証

- `21fbff4`の`npm.cmd run check`: 25 files / 181 tests、statements 84.38%、branches 80.56%、functions 100%、lines 90.47%、format、lint、typecheck、API/Web production buildまでPASS。
- fresh PostgreSQL: migration 0001〜0032、49-table RLS matrix、P0結合をPASS。新しいpilot runが`0032`を記録する。
- existing-data upgrade: 0001〜0032 PASS。過去`0028`のpilot環境、差異のstate/evidence/actor/timestamp/audit、mapping・CSV履歴を保持し、将来の未対応`0033`を拒否する。
- `c63eb5b`の独立UI 8 task: 暫定96/100、Critical 0、High 0、Medium 1。通常390×844、768×1024、1440×1000で横overflow 0px、対象画面のconsole error 0件、外部runtime通信0件。
- `6c68980`で棚卸差異の復元フォームを44px以上へ修正し、`21fbff4`まで保持している。ただし`21fbff4`の実ブラウザ8 task、44px実測、console/network再確認は未実施。
- 外部runtime通信・課金・デプロイ: 確認済みブラウザrunでは0件。実装と自動検証はPC内だけで、有料API・有料SaaSを追加していない。

## 未完了の合格条件

- 実際の人が行う10商品pilotは未実施。結合試験は、1商品完了と1商品意図的中断の計測基盤確認であり、10商品完走ではない。
- 実iPhone Safariのホーム画面追加、カメラ、圏外復帰は未確認。
- `21fbff4`の同一commitによるUI評価表8 task再実行と独立採点は未完了。`c63eb5b`の暫定結果で代用しない。

上記3点を成功扱いにせず、最終独立SolレビューでCritical/High 0を確認するまでDraft PRを作成しない。
