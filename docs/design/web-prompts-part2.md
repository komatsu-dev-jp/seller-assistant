# Web mock prompts — part 2

生成日: 2026-08-13

## W04 — 年度決算・Money Forward CSV出力

参照画像:

- `docs/design/concept-bc-hybrid-v2.png`
- `docs/design/concept-finance-ledger-v1.png`

プロンプト:

> Create a polished 16:9 Japanese SaaS product-design board containing four distinct desktop web screens for a resale operations app. Match the referenced visual language: white and very light gray surfaces, navy typography, cobalt-blue primary actions, amber review warnings, green approved states, restrained rounded cards, thin borders, dense but highly legible professional tables. This is a realistic high-fidelity UX mockup, not a marketing poster. Use the same left navigation on every screen: 作業台, 仕入, 商品, 出品, 注文・配送, 在庫, 収支・帳簿, チーム, 設定. Clearly title the board 「年度決算・会計ソフト出力」 and label the four screens 01–04. Screen 01 「年度チェック」: tax year selector 2026年, filing mode chips 白色 / 青色 / 未決定, progress checklist for 証憑, 仕訳承認, 売掛・買掛, 12月31日棚卸, 固定資産候補, 未解決事項, with visible warning that AI does not decide filing eligibility. Screen 02 「仕訳候補レビュー」: source receipt thumbnail and extracted facts on the left, easy-language transaction summary in the center, expandable debit/credit journal candidate with confidence and evidence, actions 承認 / 保留 / 修正 / 税理士に確認; use badge AI候補・人が確定. Screen 03 「Money Forward出力前チェック」: A〜AA列 template validation, debit/credit balance, row count, 10,000-row split, compound entry max 300, invoice-status unresolved blocker, character encoding test result, duplicate-prevention batch ID and SHA-256 summary; a large status must read exactly 「会計ソフト取込準備完了」, never 「確定申告完了」. Primary button 「MF仕訳帳CSVを書き出す」 and secondary button 「年度決算パックを書き出す」. Screen 04 「出力履歴・取込確認」: immutable export batches with ready / downloaded / imported_confirmed states translated into Japanese, creator and approver, file hash, replacement history, button 「取込件数を確認」, and a small panel of materials needing separate input in accounting software such as 地代家賃, 減価償却, 専従者. Show a persistent safety note: 「AIは仕訳候補と一般情報を提示します。個別の税務判断は本人または税理士が行います。」 Use plausible Japanese sample data but no real personal information. Avoid brand logos; Money Forward may appear only as plain text. No tax-filing completion claim, no autonomous tax advice, no fake certification seals, no watermark, no decorative device mockups, no illegible microtext.

出力先: `docs/design/web-04-finance-yearend-export.png`

## W05 — 設定・連携・権限

参照画像:

- `docs/design/concept-bc-hybrid-v2.png`

プロンプト:

> Create a polished 16:9 Japanese SaaS product-design board containing four distinct desktop web screens for the settings and integrations area of a resale operations app. Match the referenced visual language exactly: white and very light gray surfaces, navy typography, cobalt-blue primary actions, amber cautions, green confirmed states, restrained rounded cards, thin borders, dense but legible tables. This is a realistic high-fidelity UX specification board, not advertising. Use the same left navigation on every screen: 作業台, 仕入, 商品, 出品, 注文・配送, 在庫, 収支・帳簿, チーム, 設定. Clearly title the board 「設定・連携・安全管理」 and label four screens 01–04. Screen 01 「事業・会計設定」: business profile, tax year, filing-mode selector 白色 / 青色 / 未決定, inventory valuation and tax settings displayed as facts requiring owner or accountant approval, rule version and approver; never let AI select them. Screen 02 「販売チャネル」: three cards — 個人メルカリ with status 「手動・本人確認」 and actions to prepare images/copy text/open official listing page; メルカリShops CSV with status 「公式CSV」 and action 「非公開CSV＋画像を書き出す」; メルカリShops API with lock, status 「連携準備中」, checklist 契約済み / 書面承認 / API_CLIENT_NAME, and a disabled connect button. Show public product URL as manually verified after publishing, never show a draft URL guarantee or auto-list personal Mercari. Screen 03 「写真・データ保管」: iPhone capture → temporary device file → encrypted private upload → server verification → original / processed listing image / thumbnail, selected-photo access, upload retry, remove EXIF location from derivative, signed temporary URL only for an approved Shops API fetch, Notion one-way metadata mirror without sensitive information. Screen 04 「メンバー・権限・通知」: roles オーナー / 撮影・採寸 / 出品 / 発送 / 経理 / 税理士, a clear permission matrix, temporary address viewing, hidden purchase cost for contractors, approval gates, audit-log retention, and notification settings. Include a small integration status list for iPhoneショートカット, Notion, 会計CSV; use labels 接続済み / 手動 / 準備中. Use plausible Japanese sample data and generic icons, no real logos or personal information. No browser automation, password sharing, private API, cookie storage, autonomous personal-Mercari listing, tax advice, fake certification seals, watermark, or illegible microtext.

出力先: `docs/design/web-05-settings-integrations.png`

## W04 v2 — 整合性修正

参照画像:

- `docs/design/web-04-finance-yearend-export.png`

プロンプト:

> Edit the referenced 16:9 Japanese SaaS UX board while preserving its exact four-panel composition, typography, spacing, colors, navigation, sample values, and all content outside panel 03 as much as possible. Correct only the logical contradiction in panel 03 「Money Forward出力前チェック」. Because the large green status says exactly 「会計ソフト取込準備完了」, every blocking check in this panel must be resolved. Change 「インボイス対応ステータス NG（ブロッカー） 未解決1件」 into a green passing row such as 「インボイス対応ステータス OK 確認済み・未解決0件」. Ensure all rows show green OK, the unresolved count is zero, and both export buttons are enabled. Do not show any blocker, NG, unresolved journal, pending tax decision, or warning within panel 03. Keep unresolved review items in panel 01 only. Retain the exact safety note that AI does not decide filing eligibility and the overall completion phrase must remain 「会計ソフト取込準備完了」, never 「確定申告完了」. No other redesign, no logos, no watermark.

出力先: `docs/design/web-04-finance-yearend-export-v2.png`
