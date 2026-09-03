# 受け入れ条件・実装対応表

- 状態: 承認済みUI全127画面の同一ビルド再撮影・比較、P13-B/P14の注文・取出し・梱包・発送の実運用Web接続、住所・場所写真・未入力金額の安全gateは自動検証とローカル実ブラウザで合格。最終独立Sol再レビューもCritical 0 / High 0でPASS。P12-B/Cの具体項目と実iPhone・物理印刷・実利用者pilot・実Money Forward取込は未確認
- 更新日: 2026-09-03（JST）
- 正本: `docs/specs/mvp-product-spec-v1.md`、`docs/specs/technical-architecture-v1.md`、`docs/specs/approved-ui-integration-addendum-v1.md`

## P0ゲート

P0の必須ACは AC-001、003〜008、013〜014、018〜023、025〜026、028〜034、039、042〜068。各行へ実装、テスト、実画面証拠を追加し、すべて合格するまでP1へ進まない。2026-08-27以前のP05/P06証拠は承認済みUI追補前の履歴であり、新しいP0の最終合格証拠にはしない。

| 範囲        | 実装先                                                     | 自動検証                      | 手動・画面証拠       | 状態                                                       |
| ----------- | ---------------------------------------------------------- | ----------------------------- | -------------------- | ---------------------------------------------------------- |
| AC-001〜009 | domain/contracts、API、Web/PWA                             | unit/API                      | P0仕入・撮影・採寸   | P0対象合格、P1 AIは無効                                    |
| AC-010〜017 | media/listing/price adapters                               | unit/contract                 | 原本比較・本人引渡し | AC-013/014合格、P1は無効                                   |
| AC-018〜020 | inventory/order/shipping                                   | concurrency/API               | 二重読取・発送・返品 | 合格                                                       |
| AC-021〜024 | finance/accounting/Notion                                  | fixture/schema                | 収益・CSV・同期確認  | AC-021〜023合格、P1は無効                                  |
| AC-025〜028 | UI/監査/品質                                               | a11y/security/all suites      | PC/PWA実画面         | P05独立100/100、Critical/High/Medium 0                     |
| AC-029〜041 | 財務・冪等・機密・CSV・旧資産                              | fixture/contract/security     | 出力内容確認         | P0対象合格、P1は無効                                       |
| AC-042〜055 | inventory/location/count                                   | DB/domain/concurrency         | M12/W10導線          | 合格                                                       |
| AC-056〜057 | solo/team discrepancy                                      | DB/domain/API/concurrency     | M13/W11導線          | 実装・DB・solo/dual・P05安全確認合格                       |
| AC-058〜060 | accounting/formulas/export                                 | fixture/contract/API          | M14/W12導線          | 実装・DB・会計7/7 UI/CSV・P05確認合格、実MF import未確認   |
| AC-061      | pilot/irreversible guards                                  | E2E/DB/API/UI                 | 10商品実測           | 計測基盤合格、10商品実測待ち                               |
| AC-062      | 承認済みモバイル/PCの用語・導線                            | route/UI contract             | 75/52画面対応表      | 視覚127/127合格。注文系M34〜38/PC29〜32は実APIへ接続済み   |
| AC-063〜064 | 商品別Code 128/A4印刷/スマホ商品検索                       | Web unit/contract             | PC印刷/iPhone幅      | P11コード・unit/full check合格。実iPhone読取は未確認       |
| AC-065      | 気になる箇所・全写真                                       | contracts/API/DB/Web          | 検品・写真導線       | P12-A最終PASS。P12-B/C未実装、商品別項目案は利用者確認待ち |
| AC-066      | 選択式の発送前写真                                         | contracts/API/DB/Storage/Web  | 注文・発送導線       | P13-A/Bの自動・実ブラウザPASS。実iPhoneのみ未確認          |
| AC-067〜068 | 本人操作の調査/任意取引ID                                  | contract/Web/network          | PC/スマホ導線        | P14の自動・実ブラウザPASS。実利用者確認のみ未確認          |
| P0必須TA    | 001〜004、007〜009、011〜017、019〜023、025〜027、029〜048 | type/lint/test/build/contract | platform checklist   | 最新同一差分のfull checkとfresh/upgrade DBはPASS           |
| P1固有TA    | 005〜006、010、018、024、028                               | flag-off/禁止経路             | P1画面を公開しない   | P0では実装完了を要求しない                                 |
| TA-038〜043 | revised A architecture                                     | DB/domain/API/a11y/fixture    | M13/W11/M14/W12      | 実装・DB・P05独立100/100合格                               |
| TA-044〜045 | local Code 128/印刷/読取UI                                 | Web unit/contract/network     | PC03 v4              | P11自動検証合格。実iPhone camera/読取は未確認              |
| TA-046〜048 | 写真・発送・本人操作追補                                   | DB/API/Storage/Web            | 承認済み最新画面     | TA-046のP12-A、TA-047/048の自動・実ブラウザPASS            |

## ID別の実装・証拠対応（P07）

2026-08-29の現HEAD棚卸し。各IDを1行にし、範囲行だけでは分からなかった未実装、人手待ち、旧SHA証拠を分離した。`PASS`は代表実装と自動検証が存在することを示すが、残るgap欄に同一HEAD再実行または実機確認がある場合は最終Goal合格ではない。

代表証拠の略記:

- `A/C/DB`: `apps/api/src/app.test.ts`、`packages/contracts/src/index.test.ts`、`packages/db/src/schema.test.ts`
- `PG`: `apps/api/src/postgres-integration.ts`、`apps/api/src/postgres-upgrade-integration.ts`
- `AUTH`: `auth.test.ts`、`session.test.ts`、`security.test.ts`、`db-security.test.ts`
- `MEDIA`: `apps/api/src/local-media-store.test.ts`、`packages/domain/src/product.test.ts`
- `INV`: `packages/domain/src/inventory.test.ts`、`apps/web/src/lib/stocktake-audit.test.ts`
- `ORD`: `packages/domain/src/orders.test.ts`、`apps/api/src/order-repository.ts`
- `FIN`: `packages/domain/src/finance.test.ts`、`packages/domain/src/accounting.test.ts`、`apps/web/src/components/accounting-workspace.test.ts`
- `PWA`: `apps/web/src/pwa-contract.test.ts`、`capture-outbox.test.ts`、`offline-outbox.test.ts`
- `CODE`: `apps/web/src/lib/inventory-label.test.ts`、`code128.ts`、`local-barcode-scanner.tsx`
- `PILOT`: `packages/domain/src/pilot.test.ts`、`pilot-category.test.ts`、`pilot-correction.test.ts`、`pilot-stage.test.ts`
- `UI127`: `approved-ui-fidelity-audit-2026-08-27.md`、`root-all-fidelity-final-fix23-20260829/capture-report.json`、`review-offline-fix23-20260829/offline-report.json`
- `P12A`: `0034_inspection_concern_contract.sql`、`C`、`DB`、`PG`
- `P13A`: `0035_shipping_preflight_photo.sql`、`C`、`DB`、`A`、`PG`、private local storage
- `P13B/P14`: `0037_order_registration_shipping_method.sql`、`0038_order_address_mode.sql`、`0039_registered_order_missing_financial_facts.sql`、`shipping-workspace.tsx`、`shipping-approved-live-layout-v3.tsx`、`A/C/DB/PG`
- `UI127-20260903`: `root-all-fidelity-p14-final-finance-20260903/capture-report.json`、`approved-ui-comparison/p14-final-finance-20260903`

| ID     | 状態            | 代表実装・検証                      | 残るgap                                               |
| ------ | --------------- | ----------------------------------- | ----------------------------------------------------- |
| AC-001 | partial         | workflow/domain、A、DB              | 承認UIから実APIへの同一SKU一気通貫なし                |
| AC-002 | partial         | home/Web、AUTH、PWA                 | ホームの承認UIは実API未接続                           |
| AC-003 | PASS            | AUTH、team/order、A、DB             | 現HEAD同一SHA再実行待ち                               |
| AC-004 | PASS            | MEDIA、PWA、A                       | 現HEAD runtime再確認待ち                              |
| AC-005 | PASS            | workflow、MEDIA、A                  | 承認UI経由の最新runtimeなし                           |
| AC-006 | PASS            | MEDIA、C                            | 同一HEADの画面保存証拠なし                            |
| AC-007 | PASS            | MEDIA、C                            | 独立runtime証拠なし                                   |
| AC-008 | PASS            | workflow、PILOT、DB                 | 現HEAD再検証待ち                                      |
| AC-009 | PASS            | PILOT、C、DB                        | 現HEAD再検証待ち                                      |
| AC-010 | not implemented | —                                   | 加工ZIP検査なし                                       |
| AC-011 | not implemented | —                                   | 原本／加工画像の承認処理なし                          |
| AC-012 | not implemented | —                                   | ProcessingJob/providerなし                            |
| AC-013 | PASS            | workflow/product、A                 | 承認UIからの同一SKU表示なし                           |
| AC-014 | PASS            | AUTH、PWA、security                 | 現HEAD runtime再確認待ち                              |
| AC-015 | not implemented | —                                   | Shops CSV adapterなし                                 |
| AC-016 | not evidenced   | —                                   | 未確認時API OFFの専用証拠なし                         |
| AC-017 | partial         | FIN、Web                            | 価格案の最新承認UI接続なし                            |
| AC-018 | PASS            | ORD、INV、A                         | 現HEAD同時引当再検証待ち                              |
| AC-019 | PASS            | ORD、AUTH、DB                       | 現HEAD runtime再確認待ち                              |
| AC-020 | PASS            | ORD、DB                             | 現HEAD runtime再確認待ち                              |
| AC-021 | PASS            | FIN、ORD                            | 現HEAD画面/E2E再実行待ち                              |
| AC-022 | PASS            | FIN、accounting Web                 | 現HEAD runtime再確認待ち                              |
| AC-023 | PASS            | FIN、A                              | 現HEAD CSV再出力待ち                                  |
| AC-024 | not implemented | —                                   | Notion adapterなし                                    |
| AC-025 | partial         | Web、PWA、UI127                     | 実運用画面の完全a11y未確認                            |
| AC-026 | PASS            | audit/domain、DB、PG                | 現HEAD監査再確認待ち                                  |
| AC-027 | PASS            | AUTH、team、DB                      | 現HEAD再検証待ち                                      |
| AC-028 | partial         | UI127、PWA                          | 見た目127/127のみで実API未接続                        |
| AC-029 | PASS            | FIN、DB                             | 現HEAD再検証待ち                                      |
| AC-030 | PASS            | workflow、INV、ORD、A               | 現HEAD再検証待ち                                      |
| AC-031 | PASS            | audit、DB、PG                       | 現HEAD再検証待ち                                      |
| AC-032 | PASS            | AUTH、PWA                           | 実iPhone保存領域未確認                                |
| AC-033 | PASS            | AUTH、PWA                           | 実端末logout/cache消去未確認                          |
| AC-034 | PASS            | MEDIA、A、DB                        | 現HEAD実ファイル再確認待ち                            |
| AC-035 | not implemented | —                                   | Notion allowlist/upsertなし                           |
| AC-036 | not implemented | —                                   | Shops署名URLなし                                      |
| AC-037 | not evidenced   | PWA                                 | 専用P1 feature flag証拠なし                           |
| AC-038 | not evidenced   | MEDIA、PWA                          | ZIP/性能/backup/URL境界値不足                         |
| AC-039 | not evidenced   | `docs/specs/legacy-asset-audit.md`  | allowlist scan実装証拠なし                            |
| AC-040 | partial         | `package.json`、`vitest.config.ts`  | 現HEAD full check再実行待ち                           |
| AC-041 | not implemented | —                                   | Shops更新CSVなし                                      |
| AC-042 | PASS            | INV、DB、PG                         | 現HEAD再検証待ち                                      |
| AC-043 | PASS            | INV、CODE、DB                       | 実物ラベル運用未確認                                  |
| AC-044 | PASS            | INV、DB、PG                         | 現HEAD再検証待ち                                      |
| AC-045 | PASS            | INV、CODE、PWA                      | 実端末scan session未確認                              |
| AC-046 | PASS            | INV、ORD、A                         | 現HEAD再検証待ち                                      |
| AC-047 | PASS            | MEDIA、inventory API、DB            | 実端末撮影と人手写真確認なし                          |
| AC-048 | PASS            | team/order、AUTH、DB                | 現HEAD再検証待ち                                      |
| AC-049 | PASS            | INV、DB、PG                         | 現HEAD再検証待ち                                      |
| AC-050 | PASS            | INV、audit、DB                      | 実運用2人確認なし                                     |
| AC-051 | PASS            | ORD、DB                             | 現HEAD再検証待ち                                      |
| AC-052 | PASS            | CODE、INV、DB                       | 実ラベル読取未確認                                    |
| AC-053 | PASS            | CODE、PWA、DB                       | 実iPhone camera拒否/手入力未確認                      |
| AC-054 | PASS            | PWA、INV                            | 実端末offline競合未確認                               |
| AC-055 | not evidenced   | CODE                                | GS1非生成の専用negative testなし                      |
| AC-056 | partial         | INV、audit、DB                      | 現HEAD同一SHA再検証待ち                               |
| AC-057 | partial         | INV、audit、DB                      | 現HEAD同一SHA再検証待ち                               |
| AC-058 | PASS            | FIN、C、DB                          | 現HEAD再検証待ち                                      |
| AC-059 | human pending   | FIN、DB                             | 実Money Forward取込未実施                             |
| AC-060 | PASS            | FIN                                 | 現HEAD再検証待ち                                      |
| AC-061 | human pending   | PILOT、DB、`p06-human-run-guide.md` | 人の固定10商品pilot未実施                             |
| AC-062 | partial         | UI127-20260903、PWA、P13B/P14       | 注文系以外の全静的画面を同一SKUで実走する人手証拠なし |
| AC-063 | partial         | CODE、UI127                         | 物理A4印刷と現HEAD再確認なし                          |
| AC-064 | human pending   | CODE、PWA                           | 実iPhone読取未確認                                    |
| AC-065 | partial         | P12A                                | P12-B/CのAPI・Web・写真接続なし                       |
| AC-066 | partial         | P13A、P13B/P14                      | 実iPhoneでの写真・取出し・梱包確認待ち                |
| AC-067 | partial         | workflow、Web、PILOT、P13B/P14      | 実利用者による公式画面の手動調査確認待ち              |
| AC-068 | partial         | ORD、Web、A、P13B/P14               | 実利用者による任意取引ID運用確認待ち                  |

| ID     | 状態            | 代表実装・検証                     | 残るgap                              |
| ------ | --------------- | ---------------------------------- | ------------------------------------ |
| TA-001 | PASS            | RLS、DB、PG                        | 現HEAD再実行待ち                     |
| TA-002 | PASS            | AUTH、team、ORD、DB                | 現HEAD再検証待ち                     |
| TA-003 | PASS            | MEDIA、DB                          | 現HEAD再検証待ち                     |
| TA-004 | PASS            | MEDIA、PWA、A                      | 現HEAD再検証待ち                     |
| TA-005 | not implemented | —                                  | ProcessingJob/provider契約なし       |
| TA-006 | not implemented | —                                  | ZIP検査なし                          |
| TA-007 | PASS            | workflow、MEDIA、C                 | 現HEAD再検証待ち                     |
| TA-008 | partial         | workflow、ORD、INV、A              | 承認UIからの状態遷移runtimeなし      |
| TA-009 | partial         | workflow、FIN、A                   | Notion/CSV adapter再試行なし         |
| TA-010 | not implemented | —                                  | Notion payloadなし                   |
| TA-011 | PASS            | ORD、AUTH、A、DB                   | 現HEAD再検証待ち                     |
| TA-012 | PASS            | FIN                                | 現HEAD再検証待ち                     |
| TA-013 | PASS            | audit、DB                          | 現HEAD再検証待ち                     |
| TA-014 | not evidenced   | —                                  | backup/restore実行証拠なし           |
| TA-015 | partial         | Web、PWA、UI127                    | 実運用UI未接続                       |
| TA-016 | human pending   | CODE、PWA                          | 実iPhone Safari/home/camera未確認    |
| TA-017 | not evidenced   | AUTH、DB                           | 専用secret scan結果なし              |
| TA-018 | not evidenced   | —                                  | 10,000 SKU等の性能測定なし           |
| TA-019 | PASS            | RLS、DB、PG                        | 現HEAD再実行待ち                     |
| TA-020 | PASS            | audit、RLS、DB                     | 現HEAD再実行待ち                     |
| TA-021 | PASS            | AUTH、PWA                          | 実端末logout/cache消去未確認         |
| TA-022 | PASS            | FIN、DB                            | 現HEAD再検証待ち                     |
| TA-023 | PASS            | workflow、INV、ORD、A              | 現HEAD再検証待ち                     |
| TA-024 | not implemented | —                                  | Notion schema/upsertなし             |
| TA-025 | PASS            | MEDIA、DB                          | 現HEAD再検証待ち                     |
| TA-026 | partial         | MEDIA、PWA                         | backup/URL期限/用途の境界値不足      |
| TA-027 | partial         | `package.json`、`vitest.config.ts` | 現HEAD coverage再実行待ち            |
| TA-028 | not implemented | —                                  | Shops create/update CSVなし          |
| TA-029 | PASS            | INV、RLS、DB                       | 現HEAD再検証待ち                     |
| TA-030 | PASS            | CODE、INV、DB                      | 実ラベル読取未確認                   |
| TA-031 | PASS            | INV、DB                            | 現HEAD再検証待ち                     |
| TA-032 | PASS            | INV、audit、DB                     | 現HEAD再検証待ち                     |
| TA-033 | PASS            | MEDIA、INV、A、DB                  | 実端末/実人物写真確認なし            |
| TA-034 | PASS            | team、INV、A、DB                   | 現HEAD再検証待ち                     |
| TA-035 | PASS            | ORD、DB                            | 現HEAD再検証待ち                     |
| TA-036 | partial         | PWA、INV、UI127                    | 承認UIは静的で実API未接続            |
| TA-037 | human pending   | CODE、DB                           | DataScanner/実iPhone/GS1未確認       |
| TA-038 | partial         | INV、audit、PWA、DB                | 現HEAD再検証待ち                     |
| TA-039 | PASS            | FIN、DB                            | 現HEAD再検証待ち                     |
| TA-040 | PASS            | FIN、DB                            | 実Money Forward取込未確認            |
| TA-041 | PASS            | FIN                                | 現HEAD再検証待ち                     |
| TA-042 | PASS            | INV、ORD、A                        | 現HEAD再検証待ち                     |
| TA-043 | human pending   | Web、PILOT、PWA                    | 人の10商品pilotと実機a11y未確認      |
| TA-044 | partial         | CODE、UI127、PWA                   | 実iPhone camera/読取未確認           |
| TA-045 | partial         | CODE、UI127、PWA                   | 物理印刷と現HEAD再確認なし           |
| TA-046 | partial         | P12A                               | P12-Aのみ。P12-B/C API・Webなし      |
| TA-047 | partial         | P13A、P13B/P14                     | Web・ブラウザPASS、実iPhone確認待ち  |
| TA-048 | partial         | workflow、ORD、PILOT、P13B/P14     | 自動・ブラウザPASS、実利用者確認待ち |

## 合格条件

- 必須テスト100%合格。
- domain/security line coverage 80%以上、branch 75%以上。
- `docs/specs/ui-evaluation-rubric-v1.md`のUI評価90点以上かつ重大項目0点なし。
- Critical/High 0件。
- 独立レビュー後に影響範囲を再検証。

## 2026-08-29 runtime接続再監査

- 独立Sol max監査はCritical 0、High級ブロッカー8群。Draft PR #9をGoal全体の合格とは判定しない。
- `mobile/screens/[screen]`と`pc/[screen]`は承認UIの静的review routeであり、`ApprovedMobileDemo` / `ApprovedPcDemo`から`/v1` API・workspace・server actionへの接続は0件だった。
- 127/127の視覚合格は維持するが、保存・権限・状態遷移の合格を意味しない。静的review画面と認証済み実運用画面を区別する。
- 現HEAD `a42db0fdd67735857c130af1f58b73d883fcd460`と最新fresh/upgrade PostgreSQL証拠SHAが異なるため、P12〜P14後に同一SHAで全検証をやり直す。
- 詳細と再発防止候補は`memory/incidents/INC-20260829-012-approved-ui-static-runtime-gap.md`を参照する。

## 2026-08-29 P12-A最終結果

- 新規`0034_inspection_concern_contract.sql`で、検品結果と気になる箇所を更新・削除しない追記履歴として追加した。見える不備は同一SKUの位置・全体写真を要求し、においは説明を必須にする。
- 最終確認は別の直前記録者が行い、最新の気になる箇所を完全一致で参照する。後から内容を訂正した場合は、同じ処理内で検品結果も未確認へ戻さない限りDBが拒否する。
- owner／inventory manager、または有効なcapture担当者だけを許可し、別workspace、別SKU、期限切れ・取消済み担当、shipping/accounting担当をDBのRLSでも拒否する。秘密の写真保存先は公開contractへ含めない。
- 公式PostgreSQL 18.6の新規導入試験は34 migration、53-table RLS、権限攻撃、自己確認、最新状態、2接続の同時訂正をPASS。同時訂正は別PIDと実Lock待ちを確認し、成功1件・23505拒否1件、履歴の枝分かれ0件だった。
- 既存データ更新試験は0001〜0034をPASSし、SKU、写真、pilot、財務、CSV bytes/hash、監査履歴が更新前後で不変だった。
- 最終`npm.cmd run check`は34 files / 253 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、format/lint/typecheck、API/Web build 86 routesをPASSした。
- 実装していない別Sol maxの最終判定はCritical 0 / High 0 / Medium 0 / Low 0。P12-AはPASS、P12-Bの技術gateはGO。
- P12-Bの商品別初期データは、承認済み画面が件数だけを固定し項目名・必須範囲を固定していないため、`p12-product-template-proposal-v1.md`の2点を利用者が確認するまで書き込まない。

## 2026-08-30 P13-A最終結果

- 新規`0035_shipping_preflight_photo.sql`、strict contract、order API、private local storageで、発送前写真の3設定、販売額欠損、注文単位の人の選択、商品写真・梱包後写真、写真確認・梱包確認・発送確認を別記録として実装した。
- shipping担当には有効な注文割当の工程状態だけを返し、販売額、目安額、原価、利益、税務情報、private storage keyを返さない。写真contentは`private, no-store`、`nosniff`で、外部送信を追加していない。
- 写真保存・写真確認・梱包・発送・判断の同時再送を別接続の実Lock待ちで攻撃し、同一内容は同じ結果、異なる内容は拒否、業務行・監査・操作記録は各1件だけになることを確認した。
- 更新前から`packed`だった注文は、旧梱包記録を自動昇格または変更せず、人の再確認を新しいserver記録として1件だけ追記した後に発送できる。通常の再梱包や確認済み注文への追加記録は拒否する。
- 公式PostgreSQL 18.6のfreshは新規DB`resale_p13_fresh_20260830f`へ35 migrationを適用し、64 table、59-table RLS matrix、権限・金額・写真・同時操作・旧梱包回復をPASSした。
- upgradeは新規空DB`resale_p13_upgrade_20260830d`で0001〜0035をPASSし、既存SKU、写真、pilot、finance、CSV bytes/hash、audit、旧梱包記録を保持した。途中のB/Cは0035適用前のfixture作成ミスで停止し、修正後は使い回さず新しいDで最初から合格した。
- 最終`npm.cmd run check`は35 files / 271 tests、format/lint/typecheck、API/Web build、Next 86 routesをPASSした。実装していない別Sol maxはCritical 0 / High 0 / Medium 0 / Low 0、P13-A PASS、P13-B gate GOと判定した。
- AC-066／TA-047全体はP13-Bの承認済み実運用Web、390/768/1440px、キーボード、外部通信0、実iPhone確認が残るため`partial`を維持する。

## 2026-09-03 P13-B/P14実運用接続と全127画面の再検証

- モバイルM34〜38とPC29〜32を、承認済み画面構成のまま認証済み`/shipping`実運用画面へ接続した。注文登録はサーバー採番の`POST /orders`を使用し、作成後は重複確認更新を挟まず次工程へ進む。
- 匿名配送は住所行を0件のまま扱い、住所あり配送だけを暗号化行として保存する。住所表示許可は本人・5分・注文単位で、shipping担当へ原価、利益、販売額、税務情報、保存先keyを返さない。旧注文の未設定値は互換上`NULL`として保持する。
- モバイルは匿名配送の注文登録から商品取出しまで、PCは住所あり配送の注文登録、商品・場所の二重読取、梱包確認、発送記録までをローカル実ブラウザで完走した。修正後のPC再走では匿名配送かつ取引ID・販売額・手数料・梱包費が未入力でも、人が未入力を確認した場合だけ発送できることを確認した。
- 場所写真取得でownerにも注文割当を要求して403になる不具合を検出し、owner/inventory managerは有効membership、shipping担当は自分の有効な注文割当を要求する権限へ修正した。修正後は最新承認済みの場所写真を非公開object URLとして実表示し、console error/warning 0を確認した。
- 最初の独立レビューが、登録時の未知の手数料・梱包費を0円で保存するHigh、実読取時刻を合成するMedium、migration 0037/0038の失敗時rollback証拠不足Lowを検出した。登録時は原価だけを保存し、販売額・手数料・梱包費は未入力のまま保持するよう修正した。会計summaryは主要事実が揃うまで409で停止し、新規CSVも再出力も不可とする。
- 実ブラウザの修正後再走では、商品読取から場所読取まで17.962秒、場所読取から人の確定まで21.614秒の実時刻をDBへ保持した。注文日時より前の発送時刻は409で拒否し、正しい時刻への訂正後だけ発送済みになった。最終DBは原価1件・送料1件だけで、販売額・手数料・梱包費の0円行、匿名住所行、住所表示許可はいずれも0件だった。
- 最新同一差分の`npm.cmd run check`はfixture 44 PNG/hash、format、lint、typecheck、45 files / 401 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、API/Web buildをPASSした。
- fresh DB `resale_p14_final_fresh_20260903f`とupgrade DB `resale_p14_final_upgrade_20260903e`はmigration 0001〜0039、restricted role、65-table RLS、注文番号・配送方法・住所・場所写真権限・金額欠損・並行操作・既存データ保持をPASSした。0037/0038/0039は注入した途中失敗で全変更がrollbackされ、その後の再適用もPASSした。
- route検証はモバイル75/75、PC52/52、合計127/127 PASS。`output/playwright/root-all-fidelity-p14-final-finance-20260903`はviewport 127/127、外部runtime resource 0件、`output/playwright/approved-ui-comparison/p14-final-finance-20260903`は127画面・欠落0件・25比較シートを記録した。M34〜38とPC29〜32の比較シートも目視した。
- 書込みを担当していない別Sol maxの最終独立再レビューはPASS（Critical 0 / High 0 / Medium 1 / Low 1）。過去H1/M2/L1はすべてClosed。MediumはPC29の「販売金額 必須」と「未入力でも続行」の承認文言矛盾、Lowは0039の各不整合を実DBで個別に拒否する回帰試験の追加候補で、現行SQLの不具合ではない。Draft PR #9はDraftのまま最新化可、ready化・mergeは禁止と判定した。
- ここまでの合格はPC内の自動・実ブラウザ証拠である。実iPhone Safari、ホーム画面追加、カメラ/Code 128、圏外復帰、A4 24面ラベルの物理印刷、固定10商品の人手pilot、実Money Forward取込、P12-B/Cの2項目は未確認のまま分離する。

## 修正版Aの再開gate

- Core回帰: P0必須AC `001、003〜008、013〜014、018〜023、025〜026、028〜034、039、042〜055` とP0必須TA `001〜004、007〜009、011〜017、019〜023、025〜027、029〜037` の既存証拠を現行branchで再実行し、修正版migrationによる退行0件を確認する。P1固有条件はflag OFFと禁止経路を確認する。
- 差異: AC-056/057、TA-038、TA-042を実装し、1人可逆、2人別担当、復元、引当停止、offline停止、不可逆経路0件を確認する。
- 会計: AC-058〜060、TA-039〜041/043を実装し、未設定block、承認済みmapping、Money Forward 27列、汎用19列、schema/fixture hash、財務fixture、`?`のaccessibilityを確認する。
- Pilot: AC-061の新規runは`docs/specs/pilot-protocol-v1.1.md`の固定manifest、対象、環境、開始/終了、中断、wall-clock規則で10点を測り、中央値、欠損、差戻し、manual correction、誤格納を記録する。v1.0は履歴だけに使い、実機がない項目は未確認として分離する。
- 上記が全合格するまで、P1機能flag、Draft PRのready化、本番/mergeへ進まない。

## 2026-08-24 v1.1現行状態

- fixture kitは`listing_prep_pilot_v1.1.0`、migration `0033`、manifest SHA `a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`へ固定し、`WARMUP-01`＋10商品×4 PNGの生成・整合確認を実装した。
- UI評価seedは4つの独立workspaceを作成し、同じDB/media rootへの再実行を空状態ゲートで安全に拒否する。captureではTOP/OUTER 4項目、PANTS 5項目、KNIT `unstretched` 4項目、候補自動確定なしの文言、390/768/1440のoverflow 0、console error/warn 0を確認した。
- solo/dual棚卸は写真、二重読取、3秒keyboard確認、欠損候補DB停止、同一場所復元、不可変理由、最終承認まで確認した。dualのAPI hard blockは元担当者を409で拒否し、最終P05の画面は元担当者の確認formを非表示、承認buttonをdisabled、日本語handoff表示として409送信を防いだ。別manager経路は`approved dual_actor`まで完走した。会計seeded UIは7/7 human mappingとCSV出力確認まで完了した。
- CSS/JSX修正後は390pxでheader back 44x44、save 327x48、measurement input 303x44、bottom nav各122x49、overflow 0を確認し、200%相当の390×720でもoverflow 0、主要button 44px以上、console 0/warn 0、request loopbackのみを確認した。
- 最新のfull `npm.cmd run check`はfixture 44 PNG/hash一致、format、lint、typecheck、29 files / 202 tests、coverage（statements 84.66%、branches 80.56%、functions 100%、lines 90.68%）、API/Web production buildまでPASSした。fresh/upgrade PostgreSQLもmigration `0033`までPASSした。
- target SHA `02c4641599eb6885bca3256f7792cf0a08c464bb`のP05独立Terra最終評価は100/100（Critical/High/Medium 0）。`c63eb5b`の96/100は履歴であり、現行結果は14 PNGの最終報告を正本とする。
- Web broad bind incident後、`apps/web/package.json`のdev/startと契約testへ`127.0.0.1`固定を追加した。修正版runtime netstatは`127.0.0.1:4173`だけ、targeted 24 testsとWeb buildはPASS。外部request、課金、merge、公開は0件。
- 実利用者の`WARMUP-01`＋固定10商品pilot、実iPhone Safari、最終独立Solレビューは未実施。Draft PR、merge、本番公開も未実行。

## 2026-08-24 v1.1最終証拠追補

- 会計seeded UIは正常経路を7/7件で人がmapping確認した。Money Forward 27列・5行CSVはローカルdownload済みで、1649 bytes、SHA-256 `e833a060cc7fef30fa90140fd4330e5523579d34e871d2fc061aeed349dc1e01`。未設定税項目はUI/APIともblockし、mapping差し替え前の旧CSVは不変。実際のMoney Forward取込は未実施。
- 会計responsiveは1440/768/390/720（200%相当）でoverflow 0、主要button 44px以上、console error/warn 0、通信はloopbackのみ。
- solo棚卸は架空800×800・12KB写真、二重読取、3秒keyboard確認、候補欠損時のDB停止、同一場所復元を確認した。UI/API修正後の不可変な理由は`not_seen_during_count`と`found_in_place`を区別し、最終承認までPASS。dualはAPIで元担当者を409拒否しつつ、最終画面では元担当者の確認・承認操作を事前に無効化した。別managerの写真・二重読取・3秒確認・承認を経て`approved dual_actor`となった。
- capture TOPSは4写真・4採寸、OCR候補の自動確定なし、候補不一致を拒否。matching UIの`TEST BRAND`候補を人が`human_confirmed`し、brand/size/colorとbrand-tag根拠を保存した。出品文は未確認のまま出さず、人のcopy確認を要求した。全requestは`127.0.0.1`の2xx/201、console 0。
- workflow 390pxのresponsive不具合を修正し、summary childrenは334/111/111/111px、selectとnext linkは44px、overflow 0、表示文言は「格納待ち」とした。
- 最新full `npm.cmd run check`はPASS。fixture 44 PNG/hash `a44d25d...`、29 files / 202 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、lint/typecheck/API/Web buildを確認した。fresh PGは0033まで、49-table RLS等とimmutable reason fieldsを含む結合確認がPASS。upgrade integrationも0001〜0033 rollback/preservationがPASSした。使い捨てDBは削除済み。
- runtimeはloopbackのみ。外部通信、課金、deploy、mergeは0件。
- 未確認: 人の`WARMUP-01`＋固定10商品pilot、実iPhone、実際のMoney Forward取込、P08最終独立Sol review、Draft PR ready。P05はPASSだがGoalは完了扱いにしない。

## 2026-08-25 P06R安全preflight現行証拠

- 対象SHA: `a976d614819a662cca3be36c23989aecd9ca968e`。root `npm.cmd run check`はfixture 44/hash、format/lint/typecheck、31 files / 209 tests、coverage statements 84.66%、branches 80.56%、functions 100%、lines 90.68%、API/Web buildまでPASSした。
- 同SHAのfresh PostgreSQL 33 migrations、restricted LOGIN、49-table RLS、rerun tests、upgrade 0001〜0033 rollback/preservationはPASS。合成preflightのterminal failed案内/WARMUP、active run `917e2178-1c1c-4717-999b-0613f8b534a9`、一意readonly SKU/receipt、old summary 0、capture/listing disabled、未登録表示を確認した。
- category `tops` mismatch初回409を修正後、同run TOP-01は201（`INV-910006-4`）。console error/warn 0、全18 requestsはloopbackのみ、390/768/1440 overflow 0。証拠PNGは`output/playwright/p06r-preflight/final-a976-active-390x844.png`、`final-a976-active-768x1024.png`、`final-a976-active-1440x1000.png`。
- 独立Terra最終GOはa976限定、Critical/High/Medium/Low 0、H-P06R-02 preflight Closed。合成preflightは人P06の代替ではなく、人P06・実iPhoneは未確認。P08 Sol、Draft PRも未実施。

> 以下のIteration 4〜24は各時点の履歴であり、現行P0の最終合格証拠ではない。現行判定は本節と、同一実装commitのUI/pilot証拠を使用する。

## Iteration 4の実証範囲

- 自動検証: 47/47テスト合格、line 91.36%、branch 81.31%、function 100%。
- 実画面: 試験SKU 1点で仕入からCSV保存まで完走し、console error 0件。
- 未接続: 実PostgreSQL、実RLS、認証セッション、写真原本Storage、Notion投影。
- 未実機: iPhone Safariのホーム画面追加、カメラ、オフライン復帰。PCブラウザの390×844表示確認は実機確認の代替にしない。

## Iteration 5の実証範囲

- 原本: 同一ID・同一変更不可情報は再利用し、hash/役割/保管先変更は409拒否。
- 採寸: 証拠写真必須、別SKU証拠は403拒否、2cm超差は再確認、AI確認経路なし。
- サマリー: 写真4役割と必須採寸4項目が揃い警告0件のときだけ人レビュー可能。
- DB: `media_asset` / `measurement_attempt` のRLSと複合FKを静的検査。実DB実行は未確認。

## Iteration 6の実証範囲

- 本番API: 署名Cookie以外のactor指定を拒否し、認証なしは401。
- Cookie: 改ざん、期限切れ、未来発行、重複を拒否。HttpOnly / Secure / SameSite=Strictを固定。
- 起動: DB接続先または32バイト以上のsession秘密鍵がなければ停止。
- Logout: DB session失効→Cookie削除→PWA同期待ち/cache削除の順序を固定。失効未確認なら削除しない。
- 未完了: 初期owner作成、実DB session/membership/RLS。

## Iteration 7の実証範囲

- 変更API: `APP_ORIGIN`完全一致とsame-originだけを許可。欠落/cross-site/類似domainは403。
- Web中継: browser origin照合後だけCookieを内部APIへ渡す。接続先はserver環境変数限定。
- 未完了: 実配置でのproxy/Origin確認、実DB role/RLS。

## Iteration 8の実証範囲

- Password: Node.js標準scrypt、N=2^17/r=8/p=1、16-byte random salt、32-byte hash。平文保存なし。
- Login: 同一の汎用401、5回失敗で15分停止、HttpOnly/Secure/SameSite=Strict Cookie発行。
- Web中継: URL/ブラウザ保存領域へpasswordを置かず、API未接続は503で停止。
- 自動検証: 15 test files / 69 tests、line 91.36%、branch 81.81%、function 100%、format/lint/type/build合格。
- 実画面: PCおよび390×844で横あふれなし。未接続エラーを`role=alert`で表示。
- 初期owner: 公開APIを設けず、対話型CLIで一度だけ作成。passwordは非表示、同時実行はDB lock、2人目は拒否。
- 未完了: 実PostgreSQLでのbootstrap/hash/session/rate-limit、認証後の画面保護。

## Iteration 9の実証範囲

- PostgreSQL: 公式案内のEDB Windows ZIP 18.6を一時領域へ展開し、0001〜0006 migrationを実適用。
- 制限ロール: `NOLOGIN/NOSUPERUSER/NOBYPASSRLS` capability roleと必要操作だけのgrant。管理者URLはAPI起動前に拒否。
- 結合導線: owner bootstrap、実scrypt login、session Cookie、SKU作成、別workspace 403、5回失敗429、logout後401がPASS。
- 一時DB: 127.0.0.1:55432限定、架空データのみ、外部費用・外部CI・公開0件。
- 残り: 全RLS表/全roleの越境マトリクス、同時transaction、不変条件、実サーバー経由Webログイン。

## Iteration 10の実証範囲

- 二重読取: 商品ラベル、場所ラベル、版、対象workspace、現在地、人の確認をscan sessionで検査し、誤商品ラベルを拒否。
- 原子的移動: scan sessionとmovementを同じtransactionで確定し、使用済みscan、古い現在地/移動番号、直接の在庫状態更新を拒否。
- 同時格納: 容量1の場所へ2件を同時格納し、成功1件・拒否1件。在庫の二重格納0件。
- 同時引当: availableな同一現物を2注文へ同時引当し、成功1件・拒否1件。引当成功時だけreservedへ変更。
- 棚卸: initial counterとreconfirmer、requesterとapproverの分離、2人以上、resolution/resolved_atをDBで必須化。
- 実DB: PostgreSQL 18.6へ0001〜0007を適用し、`postgres-integration: PASS`。架空データ、127.0.0.1、外部費用0円。
- 全体検証: 16 test files / 72 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 残り: 全表/全roleのRLSマトリクス、API経由の在庫操作、オフライン競合復旧、実HTTPログイン、実iPhone PWA。

## Iteration 11の実証範囲

- Session workspace: login時に所属workspaceをDBで決め、署名Cookieとsession台帳へ固定。URLだけ別workspaceへ変えても403拒否。
- 格納API: 商品・場所ラベル、各ラベル版、二つの読取時刻、人確認、冪等キーを受け、scan・movement・auditを一つのtransactionで確定。同一内容の再送は同一結果、同じキーで内容変更は409拒否。
- PWA: ブラウザから同一URLのWeb中継を通って実API/実PostgreSQLへ格納。オンライン成功時だけ「サーバーへ格納しました」を表示。
- 圏外復旧: 必要最小項目だけをIndexedDB（ブラウザ内の保存領域）へ保留。復帰後に手動/onlineイベントで再送し、競合は自動上書きせず保留する。Service Workerは`/api/`と実中継の`/v1/`を保存しない。
- 実画面: 390×844のPCブラウザでオンライン格納と圏外保存→復帰同期を完走。各SKUでmovement 1件・audit 1件・在庫場所一致を実DB確認。証拠は`output/playwright/pwa-putaway-server-confirmed.png`、`pwa-offline-resync-complete.png`。
- 実DB: PostgreSQL 18.6の新規使い捨てDBへ0001〜0008を適用し、`postgres-integration: PASS`。
- 全体検証: 16 test files / 76 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 費用: 有料API、有料SaaS、外部CI、デプロイ、Apple Developer登録0件。Windows PC内のみ。
- 残り: 全表/全roleのRLSマトリクス、注文等の実API、写真原本Storage、実iPhone Safariのホーム画面追加/カメラ/圏外復帰。

## Iteration 12の実証範囲

- 全業務テーブル: workspaceを持つ21テーブルについて、RLS有効、強制RLS有効、`USING`/`WITH CHECK`のworkspace policyが各1件であることを実PostgreSQL catalogで確認。
- DB権限: 制限runtime roleが21業務テーブルへDELETE/TRUNCATE/REFERENCES/TRIGGERを持たないことを実DBで確認。ログイン成功時の失敗回数削除に必要な認証専用テーブルは対象外として区別。
- 外注role: `field_worker`の実credential/sessionを作り、role取得成功、SKU作成403、仕入確定409を確認。URLの別workspace指定403も継続確認。
- 結果: PostgreSQL 18.6の使い捨てDBで`postgres-integration: PASS (restricted role, 21-table RLS matrix, field-worker denial, ...)`。
- 費用: PC内だけ、外部費用・外部CI・公開0件。
- 残り: 場所枝/期限付き割当、住所期限、写真Storage、注文等の実API、実iPhone Safari。

## Iteration 13の実証範囲

- 外注割当: `work_assignment`へ担当者、場所枝の根、作業種類、開始、期限、取消を分離保存。ラベルを読んだだけでは権限を増やさない。
- 場所枝: 対象場所から親をたどり、担当枝の内側だけを許可。`field_worker`は格納担当なし403、担当外の棚403、担当内の棚だけ201。
- role分離: owner/inventory_managerは管理作業として格納可能。field_workerだけ期限付き割当を必須化し、仕入確定やSKU作成は引き続き拒否。
- DB: 0001〜0009、22業務テーブルRLS、同一操作再送、二重読取、容量、引当、棚卸を含む実PostgreSQL結合テストPASS。
- 全体検証: 16 test files / 77 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 費用: Windows PC内だけ、外部費用・外部CI・公開0件。
- 残り: 割当解除時の端末同期、場所写真の承認/取得、住所期限、注文等の実API、実iPhone Safari。

## Iteration 14の実証範囲

- 割当解除: 同期待ち再送時にsession/格納APIが401または403を返した操作は、割当解除・変更として端末outboxから消去。件数と理由を画面表示。
- 競合分離: 409の現在地/ラベル版競合は消去せず、自動上書きもせず、再読取を要求。5xx/通信不能は端末に保持。
- 実画面: 架空の同期待ち1件へ403を返し、「1件は担当解除・変更のため端末から消去」「残り0件」を390×844で確認。証拠は`output/playwright/pwa-assignment-revoked-cleared.png`。
- console: 意図的な`/v1/session/context` 403が1件。アプリ例外、画面崩れ、予期しない警告0件。
- 全体検証: 16 test files / 77 tests、format/lint/type/build合格。外部費用0円。
- 残り: 場所写真の承認/取得、住所期限、注文等の実API、実iPhone Safari。

## Iteration 15の実証範囲

- 原本: 場所写真ID、原本asset ID/SHA-256/非公開key/形式/容量/画素、撮影者/時刻を保存し、update triggerで変更を拒否。
- 審査: 撮影時は`pending`で派生なし。撮影者本人は承認不可。owner/inventory_managerが別assetの派生SHA/key、GPS EXIF 0件、人承認を揃えた場合だけ`approved`。
- 表示: 一覧APIは`approved`だけを返し、原本storage keyを返さない。field_workerは`photo`または`putaway`の有効な担当枝内だけ取得可能。
- 実DB/API: 担当外撮影403、担当内撮影201、審査中一覧0件、別担当承認200、承認後一覧1件、原本SHA変更拒否を確認。
- 全体検証: 16 test files / 79 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。0001〜0010結合テストPASS。
- 費用: Windows PC内だけ、外部費用・外部CI・公開0件。
- 未完了: 画像本体の無料PC内非公開Storage、実ファイルのEXIF除去/書出し失敗停止、PWA撮影UI、住所期限、注文等の実API、実iPhone Safari。

## Iteration 16の実証範囲

- 無料Storage: Node.js標準機能だけで、明示されたPC内絶対パス配下へ原本/表示用を分離保存。外部Storage/APIなし。
- 原本不変: 受信bytesのSHA-256一致、排他的作成、同一bytes再送は再利用、同じkeyの異なるbytesは拒否。`..`等のパス越境も拒否。
- EXIF除去: JPEGのEXIF/XMP系APP1、APP13、commentを除去。PNGはeXIf/text/time metadata chunkを除去。表示用は別ファイルで原本を変更しない。
- fail-closed: 壊れたJPEG、未対応変換、書出し失敗は表示ファイル0件。途中ファイルを削除。
- 自動検証: 17 test files / 83 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。
- 費用: ライブラリ追加0件、外部費用・外部CI・公開0件。
- 未完了: upload API/PWA撮影との接続、HEIC/WebPの無料安全変換、実iPhone写真fixture、住所期限、注文等の実API。

## Iteration 17の実証範囲

- 画面保護: ホーム、全在庫、P0商品作業はサーバー側sessionでowner/inventory_managerだけを許可。未ログインは本文を返さず`/login`へ307転送。
- 現場画面: field_workerは`/mobile`と`/mobile/scan`だけを利用でき、全在庫・収支・会計へのリンクも表示しない。URL直打ちは`/forbidden`で停止。
- 本番build: 保護5画面は静的HTMLへ埋め込まず、アクセスごとに動的なsession/role判定を行う。
- 検証: Web契約テスト、型検査、本番build、Cookieなしの`/inventory`要求が`307 /login`を確認。

## Iteration 18の実証範囲

- SKU割当: `sku_work_assignment`へ外注担当、SKU、`capture`作業、開始、期限、取消を分離保存。workspace所属だけでは商品へ触れない。
- API: field_workerの写真登録、採寸、撮影サマリー、`confirm_capture`へ同じ共通割当検査を適用。
- 実DB: 未割当の写真・採寸・撮影完了をすべて403、期限内割当後だけ201/200。23業務テーブルのRLS matrixを継続PASS。

## Iteration 19の実証範囲

- Binary upload: 場所写真はJPEG/PNG本体だけを受け、APIがmagic bytes、25MB、各辺12,000px、SHA-256、保存keyを決定。端末自己申告のSHA/key/GPS件数を廃止。
- 非公開処理: 担当範囲を保存前に検査し、原本をPC内private rootへ不変保存。撮影者と別の管理者が承認した時だけ位置metadataを除去した表示用を生成。
- 取得: pending/担当外を拒否し、approvedだけ認証付きcontent APIから`private, no-store`で返す。原本/派生storage keyは公開応答0件。
- fail-closed: 壊れた画像、未対応形式、異bytes再送、派生競合、DB承認失敗は公開を停止。補償削除は同じhashの表示ファイルだけを対象にする。
- 検証: 17 files / 86 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。0001〜0011の新規DBと実ファイル結合テストPASS。
- 費用: 新しい外部依存0件、PC内のみ。有料API/SaaS、外部CI、公開0件。
- 未完了: PWA場所写真撮影UI、HEIC/WebP、住所期限、注文/返品/会計の実API、実iPhone Safari。

## Iteration 20の実証範囲

- P0実保存: 仕入証憑、SKU、在庫番号、場所、商品写真4種、採寸4項目、出品用候補、人の公式画面引継ぎ、注文、5分住所lease、商品＋場所のピッキング、梱包、発送、収支、会計CSV履歴、返品隔離/再入庫を同一IDでDB追跡。
- 在庫UI: 部屋/棚/位置の階層、場所ラベル、容量/混載設定、実在庫一覧、部屋全景/棚/正確な位置写真をWeb/PWAから登録。原本は非公開、管理者の確認待ち一覧を追加し、撮影者本人の承認を拒否。
- 安全な写真/住所: 画像bytesからAPIがSHA-256・形式・寸法を算出し、表示用位置metadata 0件。住所はAES-256-GCM暗号化、表示権限は最大5分、応答/監査へ平文を残さない。
- 実画面: 架空ownerで実HTTPログイン、場所`ROOM-A`、写真確認待ち、自己承認拒否、仕入商品、`INV-000001`発行を確認。390×844でDB実数ホームと固定下部ナビを確認。
- Web防御: 変更要求はブラウザ`Origin`と`APP_ORIGIN`の完全一致を必須化。欠落/cross-siteを拒否し、読取要求はforwarded host/protocolを検査。
- 検証: 19 files / 96 tests、line 91.36%、branch 81.81%、functions 100%、format/lint/type/build合格。0001〜0014、32業務テーブルRLSの新規使い捨てPostgreSQL結合テストPASS。
- 費用: Node.js、Next.js、PostgreSQL、PC内ファイル、ローカルPlaywrightだけ。外部API/SaaS/CI/デプロイ/Apple契約0件。
- 未確認: 実iPhone Safariでのホーム画面追加、カメラ撮影、圏外復帰。HEIC/WebP。P1は未着手。

## Iteration 21の実証範囲

- AC-004/005、TA-003/004: metadataだけの旧写真登録routeを削除。画像bytesのサーバー検査、非公開保存、位置metadata除去、別担当承認、表示時SHA再照合を自動テスト。DB登録失敗時の孤児原本0件も確認。
- AC-013: 同じSKUの写真4種、最新採寸4項目、撮影確認、出品候補と根拠をDB read modelから再構築し、ブラウザ再読込後も採寸入り文章を表示。
- AC-019/048、TA-002: 配送担当は管理者が割り当てた有効期限内の注文だけを取得し、住所lease、pick、pack、shipの全操作で再照合。利益、原価、税務候補は配送画面へ0件。
- AC-023/029、TA-011/012/022: 注文・発送とP0進捗、会計CSV履歴とP0進捗を同一transactionで更新。直接workflow完了を拒否し、再読込後もCSVのhash、ファイル名、作成者、時刻を復元。
- AC-053: 在庫番号と場所コードをchecked codeへ変更し、1文字変更、古い版、異なるcatalogをWeb/API/DBで拒否。
- TA-019/020: 新規DBの33業務テーブルすべてでRLS/force RLS/workspace policyを検査。制限runtime roleの破壊的grant 0件、監査payloadの秘密値0件。
- 品質ゲート: 20 files / 101 tests、line 91.36%、branch 81.81%、functions 100%。format、lint、typecheck、本番build合格。PostgreSQL 0001〜0015、33-table RLS、P0実結合PASS。
- 実画面: `output/playwright/iteration-21-login.png`、`iteration-21-workflow-reloaded.png`、`iteration-21-mobile-390x844.png`、`iteration-21-shipping-role.png`。外部downloadなし、PC内Chromeだけ。
- 外部境界: runtimeは同一生成元`/v1`とPC内DB/ファイルだけ。Mercari/Notion/Slack/OpenAI/Photoroom等への送信route 0件。有料サービス0件。
- 手動未確認: 実iPhone Safari、ホーム画面追加、カメラ、圏外復帰。これはDraft PRへ未確認事項として残し、成功扱いにしない。

## Iteration 22の実証範囲

- 外注運用: オーナーがPC内アカウントを作り、撮影・InventoryUnit・場所・場所写真・配送を対象IDと24時間以内の期限で割当/解除できる。解除後は対象APIを403拒否する。
- 撮影PWA: field_workerは割当SKUだけを取得し、写真4種、採寸、理由付き再測定、端末内で得たタグ文字候補を途中保存/再送できる。原価、利益、購入者、税務資料は応答と画面へ0件。
- 人による商品調査: OCR文字は候補に限定し、管理者が採用/修正/不明を確定する。販売済み比較は利用者が公式画面で確認したHTTPS URL・表示価格・状態・送料・採否理由だけを保存し、3件未満は根拠不足とする。外部巡回/自動取得は0件。
- 棚卸・ラベル: 在庫画面から棚卸開始、観測、別担当の再確認、差異解決/承認、ラベル再発行を実APIで操作し、前後値・理由・承認者を監査する。
- 移行: 既存の`INV-000001`をデータ付きDBで`INV-000001-7`へ更新し、ラベルguardを安全に一時停止して同じtransaction内で再有効化することを確認した。
- 自動検証: `npm.cmd run check`合格。20 files / 108 tests、statements 84.09%、branch 81.81%、functions 100%、lines 91.36%。format、lint、typecheck、本番build合格。
- 実DB: 新規DBへ0001〜0017を適用し、36業務テーブルRLS、全外注割当、仕入〜会計、5分住所、checked code、撮影/調査/出品根拠、場所写真、二重読取、返品隔離、棚卸、ラベル再発行、logoutを含む結合テストPASS。
- 実画面: 在庫・棚卸、外注割当、390×844の撮影PWA、PC商品調査をChromeで確認。横あふれ0、console error 0、外部リンク0。通信要求は同一生成元`/v1`だけ。
- 証拠: `output/playwright/iteration-22-inventory-stocktake.png`、`iteration-22-team-assignments.png`、`iteration-22-mobile-capture-390x844.png`、`iteration-22-product-research.png`。
- 未確認: 実iPhone Safariのホーム画面追加、カメラ、圏外復帰、HEIC/WebP。P1、push、Draft PR、公開、Notion/Slack追加送信は未実行。

## Iteration 24の実証範囲

- 棚卸時点固定: 棚卸開始時の対象現物、場所、在庫番号、ラベル、状態、移動番号を`count_session_inventory_snapshot`へ保存。開始後に別商品が入っても対象へ加えず、開始時にあった未読取品だけを差異候補にする。
- 撮影途中保存: 4枚すべてを通信前にIndexedDB（ブラウザ内の端末保存領域）へ保存する。同一写真判定は名前・容量・更新日時ではなく、実bytesのSHA-256で行う。取得した最新割当一覧にないSKUまたは403の割当解除、ログアウト時は撮影保留を消去し、401のログイン期限切れだけでは消去しない。
- 格納途中保存: 401はログイン期限切れとして端末に保持し、403の担当解除だけを消去する。409の状態競合と通信不能も自動上書き・自動削除しない。
- 監査: 原本写真登録に安全なbefore/afterを保存。古いラベル版の格納を409拒否した事実も、現在版・入力版・対象場所・理由を別transactionで監査する。
- UI: PCの外注担当、場所登録、場所写真、現物在庫、棚卸フォームを専用gridへ分離。1440×1000の実ブラウザで入力欄、選択欄、ファイルボタン、解除ボタン、一覧の切断0件を原寸確認した。
- 自動検証: `npm.cmd run check`合格。20 files / 112 tests、statements 84.09%、branch 81.81%、functions 100%、lines 91.36%。format、lint、typecheck、本番build合格。
- 実DB: 新規DBへ0001〜0018を適用し、37業務テーブルRLS、棚卸snapshot、開始後移動の非混入、古いラベル拒否監査、主要P0一気通貫を含む結合テストPASS。
- 実画面: `output/playwright/iteration-24-team-assignments.png`、`iteration-24-inventory-stocktake.png`。console error 0件。PC内`127.0.0.1`以外への通信0件。
- 未確認: 実iPhone Safari、ホーム画面追加、実カメラ、圏外復帰、HEIC/WebP。外部push、Draft PR、公開、Slack/Notion追加送信は未実行。
