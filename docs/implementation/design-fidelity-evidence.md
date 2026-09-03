# Slack承認済みデザイン反映証拠

- 更新日: 2026-09-03（JST）
- 状態: 承認済みモバイル75画面＋PC52画面を金額欠損修正後の最新同一ビルドから127/127再撮影・比較し、viewport 127/127、欠落0、外部runtime resource 0件。注文系M34〜38/PC29〜32の実API導線もローカル実ブラウザで完走。最終独立Sol再レビューPASS（Critical 0 / High 0）
- UI正本: `docs/design/selected-direction.md`
- 修正版A承認: `docs/design/revised-a-approval-v2.md`

## 結論

Slack承認画像を参考資料ではなくUI受け入れ基準として扱う。PCは白い高密度ワークベンチ、細い左ナビ、中央の業務情報、右または上部の確認領域にした。スマホはPC画面の縮小版にせず、承認モックと同じく1画面1目的で工程を切り替える。

モック内の架空金額・件数・写真は固定表示せず、実装はローカルPostgreSQLの保存データだけを表示する。未取得値は `—` または空状態とする。

## 画面別の対応

| 画面                 | 承認画像                                                                                  | 実装route                 | 反映内容                                                                                                                        | 実画面証拠                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ホーム               | `home-concept-c-owner-pulse-v1.png`                                                       | `/`                       | スマホは「今日の確認」を先頭にし、PCは4 KPI、月間ウォーターフォール、今日の確認、在庫年齢、仕入先概要を配置。                   | `output/playwright/design-fidelity/home-desktop-slack-approved-final-1440x1000.png` / `home-mobile-slack-approved-final-390x844.png`                                                                                   |
| 在庫管制             | `web-10-inventory-location-workbench-v1.png`                                              | `/inventory`              | 場所ツリー、部屋・棚・正確な位置の非公開写真、写真確認、場所登録、現物在庫を同じPC作業台へ配置。                                | `output/playwright/design-fidelity/inventory-desktop-slack-approved-final-1440x1000.png`                                                                                                                               |
| 在庫現場             | `mobile-12-inventory-location-operations-v1.png`                                          | `/mobile`・`/mobile/scan` | 「今日の現場作業」から商品ラベル→場所ラベル→確認へ進む。PC在庫表をスマホ幅へ縮めた `/inventory` をM12の比較対象にはしない。     | `output/playwright/design-fidelity/inventory-mobile-field-home-slack-approved-final-390x844.png` / `inventory-mobile-scan-slack-approved-final-390x844.png`                                                            |
| 棚卸差異             | `web-11-solo-discrepancy-control-v4.png` / `mobile-13-solo-discrepancy-v2.png`            | `/inventory/stocktake`    | PCは差異キュー＋詳細。スマホは運用モード、商品読取、差異確認、ラベルを工程別に表示し、全フォームの縦積みを廃止。                | `output/playwright/design-fidelity/stocktake-desktop-slack-approved-final-1440x1000.png` / `stocktake-mobile-slack-approved-final-390x844.png` / `stocktake-mobile-difference-slack-approved-final-390x844.png`        |
| 会計候補             | `web-12-accounting-profile-export-guard-v2.png` / `mobile-14-accounting-readiness-v2.png` | `/accounting`             | PCは設定・mapping・出力ペイン。スマホは出力形式、会計設定、科目候補、CSV確認を工程別表示。未登録mappingを空欄から人が入力する。 | `output/playwright/design-fidelity/accounting-desktop-slack-approved-final-1440x1000.png` / `accounting-mobile-format-slack-approved-final-390x844.png` / `accounting-mobile-profile-slack-approved-final-390x844.png` |
| 注文・発送（スマホ） | 承認済み追加画面M34〜38                                                                   | `/shipping`               | 注文登録、商品取出し、梱包写真、発送記録、棚卸開始を1画面1目的で進め、保存・二重読取・人の確認を実APIへ接続。                   | `output/playwright/p14-order-address-live-20260902/mobile-m34-to-m35-direct-v2.png` / `output/playwright/root-all-fidelity-p14-final-finance-20260903/mobile`                                                          |
| 注文・発送（PC）     | 承認済みPC29〜32                                                                          | `/shipping`               | 注文登録、商品・場所の二重読取、選択式写真、梱包確認、発送記録を白いPC作業台へ接続。住所と金額の非公開境界を維持。              | `output/playwright/p14-final-live-finance-20260903/pc32-shipped-anonymous.png` / `output/playwright/root-all-fidelity-p14-final-finance-20260903/pc`                                                                   |

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

上記の未確認項目を成功扱いにしない。Draft PR #9は既存のDraftとして保持し、最終独立SolレビューでCritical/High 0を確認するまでready化せず、PRマージもしない。

## 2026-08-25 P06R現行検証

- target application SHA `a976d614819a662cca3be36c23989aecd9ca968e`のroot full checkは31 files / 209 tests、coverage 84.66/80.56/100/90.68、fixture 44/hash、format/lint/typecheck/API/Web build PASS。
- fresh PG 33 migrations/restricted LOGIN/49 RLS/rerun、upgrade 0001〜0033 rollback/preservation PASS。synthetic preflightはterminal failed案内/WARMUP、active run、readonly SKU/receipt、old summary 0、capture/listing disabled、未登録表示、category mismatch修正後TOP-01 201を確認。
- console 0/warn 0、18 requestsは127.0.0.1のみ、390/768/1440 overflow 0。PNGは`output/playwright/p06r-preflight/final-a976-active-{390x844,768x1024,1440x1000}.png`。
- 独立Terra GOはa976限定、Critical/High/Medium/Low 0、H-P06R-02 Closed。合成preflightであり、人P06・実iPhone・P08 Sol・Draft PRは未確認。

## 2026-09-03 全127画面と注文・発送実運用の同一ビルド証拠

- `node scripts/verify-approved-ui-routes.mjs http://127.0.0.1:4396`は、モバイル75/75、PC52/52、合計127/127 routeをPASSし、外部runtime参照0件だった。
- `output/playwright/root-all-fidelity-p14-final-finance-20260903`へ金額欠損修正後の同じproduction buildから127画面を撮影した。`capture-report.json`はviewport 127/127合格、外部resource 0件を記録した。
- `output/playwright/approved-ui-comparison/p14-final-finance-20260903`は、承認済み画像と現在画面を127/127で対応付け、欠落0件、25比較シートを生成した。M34〜38の`mobile-board-07.png`とPC29〜32の`pc-board-08.png`も原寸目視した。
- モバイル実運用は架空データの匿名配送注文を登録し、サーバー採番後にM35へ直接進むことを確認した。PC実運用は架空データの住所あり注文を登録し、PC30の商品・場所二重読取、PC31の写真方針と梱包確認、PC32の発送記録まで完走した。
- ownerの場所写真表示が403になる不具合を実ブラウザで検出して権限を修正した。新しいclean sessionでは、最新承認済み場所写真が非公開のローカルobject URLから241×180で表示され、console error/warning 0だった。証拠は`output/playwright/p14-order-address-live-20260902/pc30-owner-photo-fixed.png`。
- 金額欠損修正後の実ブラウザでは、匿名配送・任意の取引IDと販売額なしでPC29〜32を再走した。商品・場所の読取は実際の操作間隔を保持し、注文より前の発送時刻を409で停止した後、訂正した時刻だけを記録した。発送後も販売額・手数料・梱包費を0円表示せず、会計summaryとCSV作成は主要事実が揃うまで停止した。証拠は`output/playwright/p14-final-live-finance-20260903/pc32-shipped-anonymous.png`。
- 画面とAPIはいずれも`127.0.0.1`内で検証し、Mercari、Slack、Notion、Photoroom、AI、広告、分析、外部CDN、有料APIへのruntime通信を追加していない。
- 承認済みPC29には「販売金額 必須」と「未入力でも続行」が同居している。現実装は後者の承認挙動に合わせて未入力を許可しており、見た目の差ではなく承認文言内の意味上の矛盾として、利用者が文言を再承認するまで勝手に変更しない。
- 書込みを担当していない別Sol maxは、capture 127件、route-map 127/127、M34〜38とPC29〜32の比較シートを独立確認し、重大な構成・導線欠落0、Critical 0 / High 0でPASSとした。PC29の既知文言矛盾だけをMedium 1として分離した。
- 実iPhone Safari、ホーム画面追加、実カメラ/Code 128、圏外復帰、物理A4ラベル、固定10商品pilot、実Money Forward取込はこの証拠では確認していない。承認画像の端末外枠や架空値は意図的に製品UIへ固定しない。
