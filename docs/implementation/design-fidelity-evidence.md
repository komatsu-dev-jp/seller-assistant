# Slack承認済みデザイン反映証拠

- 更新日: 2026-08-24（JST）
- 状態: target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`でP05独立Terra 100/100 PASS。実利用者・実機・実MF importは未確認
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

- v1.1の最新root `npm.cmd run check`: fixture 44 PNG/hash一致、format、lint、typecheck、29 files / 202 tests、coverage（statements 84.66%、branches 80.56%、functions 100%、lines 90.68%）、API/Web production buildまでPASS。fixture manifest SHAは`a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`。target SHAは`02c4641599eb6885bca3256f7792cf0a08c464bb`。
- fresh PostgreSQL / existing-data upgrade: migration `0033`までPASS。過去の`0032`までの結果とは別に、v1.1対象のfresh/upgrade実走を確認済み。
- `c63eb5b`の独立UI 8 task: 暫定96/100、Critical 0、High 0、Medium 1。通常390×844、768×1024、1440×1000で横overflow 0px、対象画面のconsole error 0件、外部runtime通信0件。
- seeded captureブラウザではTOP/OUTER 4項目、PANTS 5項目、KNIT `unstretched` 4項目、候補を自動確定しない文言、390/768/1440のoverflow 0、console error/warn 0を確認した。solo/dual棚卸は写真、二重読取、3秒確認、復元、承認まで確認し、会計は7/7 human mappingとCSV出力を確認した。
- 初回はmobile主要操作が44px未満でFAIL。CSS/JSX修正後のroot再測定では390pxで主要操作44px以上、overflow 0を確認し、200%相当390×720でもoverflow 0、console 0/warn 0、request loopbackのみを確認した。
- P05独立Terraは100/100（Critical/High/Medium 0）。capture属性、solo/dual承認、会計responsive、mobile online/offline/online、14 PNG証拠を確認済み。実利用者pilot、実iPhone、実MF import、P08最終Sol reviewは未確認である。
- Web broad bind incident後、`apps/web/package.json`のdev/startと契約testへ`127.0.0.1`固定を追加した。修正版runtime netstatは`127.0.0.1:4173`だけ、targeted 24 testsとWeb buildはPASS。外部request・課金・merge・公開は0件。

## 2026-08-24 seeded UI再評価追補

- 会計正常経路は7/7件で人がmapping確認。Money Forward 27列5行CSVは1649 bytes、SHA-256 `e833a060cc7fef30fa90140fd4330e5523579d34e871d2fc061aeed349dc1e01`でローカル保存した。税項目未設定はUI/APIとも停止し、旧CSVはmapping差し替え後も不変。実MF importは未確認。
- 会計は1440/768/390/720（200%相当）でoverflow 0、主要button 44px以上、console 0/warn 0、requestはloopbackのみ。
- solo棚卸は800×800・12KBの架空写真、二重読取、3秒keyboard確認、欠損候補のDB停止、同一場所復元、`not_seen_during_count`/`found_in_place`の不可変理由、最終承認を確認。dualのAPI hard blockは元担当者を409で拒否し、最終P05の画面は元担当者の確認formを非表示、承認buttonをdisabled、日本語handoff表示として409送信を防いだ。別managerの写真・二重読取・3秒確認後に`approved dual_actor`を確認した。
- capture TOPSは4写真/4採寸、OCR自動確定なし、不一致候補拒否、`TEST BRAND` matching候補のhuman_confirmed、brand/size/colorとbrand-tag根拠保存、人のcopy確認を確認。requestは127.0.0.1 2xx/201、console 0。
- workflow 390pxはsummary children 334/111/111/111、select/next link 44px、overflow 0、「格納待ち」を確認。
- これはP05最終PASSの証拠である。ただし実利用者pilot、実iPhone、実MF import、P08最終独立Sol review、Draft PR readyは未確認。

## 未完了の合格条件

- 実際の人が`docs/specs/pilot-protocol-v1.1.md`で行う`WARMUP-01`＋固定10商品pilotは未実施。fixtureと静的testの合格は10商品完走ではない。
- 実iPhone Safariのホーム画面追加、カメラ、圏外復帰は未確認。
- 現行commitのseeded browser指定操作（会計、capture、solo/dual棚卸、200%相当390×720、loopback request capture）と、最終独立P05 100/100は確認済み。未完了は実利用者pilot、実iPhone、実MF import、P08最終独立Solレビューである。

上記の未確認項目を成功扱いにせず、最終独立SolレビューでCritical/High 0を確認するまでDraft PRを作成しない。

## 2026-08-25 P06R現行検証

- target application SHA `a976d614819a662cca3be36c23989aecd9ca968e`のroot full checkは31 files / 209 tests、coverage 84.66/80.56/100/90.68、fixture 44/hash、format/lint/typecheck/API/Web build PASS。
- fresh PG 33 migrations/restricted LOGIN/49 RLS/rerun、upgrade 0001〜0033 rollback/preservation PASS。synthetic preflightはterminal failed案内/WARMUP、active run、readonly SKU/receipt、old summary 0、capture/listing disabled、未登録表示、category mismatch修正後TOP-01 201を確認。
- console 0/warn 0、18 requestsは127.0.0.1のみ、390/768/1440 overflow 0。PNGは`output/playwright/p06r-preflight/final-a976-active-{390x844,768x1024,1440x1000}.png`。
- 独立Terra GOはa976限定、Critical/High/Medium/Low 0、H-P06R-02 Closed。合成preflightであり、人P06・実iPhone・P08 Sol・Draft PRは未確認。
