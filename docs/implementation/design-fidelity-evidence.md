# Slack承認済みデザイン反映証拠

- 更新日: 2026-08-20（JST）
- 状態: 実装・本番相当ローカルブラウザ確認済み、独立レビュー待ち
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

## 検証

- `npm.cmd run check`: PASS。
- Vitest: 22 files / 143 tests PASS。
- coverage: lines 90.47%、branches 80.56%、functions 100%。
- Next.js production build: 全route PASS。
- fresh PostgreSQL: migration 0001〜0024、49-table RLS matrix、可逆棚卸、27列/19列CSV、server-side pilot event基盤をPASS。
- existing-data upgrade: 0001〜0024 PASS。既存の解決済み差異を保持し、証拠を捏造せず、不可逆な廃棄を実行しない。
- responsive: 390×844、768×1024、1440×1000のホーム・在庫・棚卸・会計で横overflow 0px。
- browser console: `/`、`/inventory`、`/inventory/stocktake`、`/accounting`、`/mobile`、`/mobile/scan` の再読込でerror 0件。
- 外部runtime通信・課金・デプロイ: 0件。検証先は `127.0.0.1` のWeb/API/PostgreSQLだけ。

## 未完了の合格条件

- 実際の人が行う10商品pilotは未実施。結合試験は、1商品完了と1商品意図的中断の計測基盤確認であり、10商品完走ではない。
- 実iPhone Safariのホーム画面追加、カメラ、圏外復帰は未確認。
- UI評価表の8 task完走と独立採点は未完了。

上記3点を成功扱いにせず、独立レビューでCritical/High 0を確認するまでDraft PRを作成しない。
