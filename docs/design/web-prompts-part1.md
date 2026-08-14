# Web design board prompts — part 1

生成日: 2026-08-13  
生成方式: built-in `image_gen`、各アセットを独立した1回の生成コールで作成  
共通参照: `docs/design/concept-bc-hybrid-v2.png`（スタイル参照のみ。内容や商品写真を複製しない）

## 1. `web-01-purchase-inventory.png`

```text
Use case: ui-mockup
Asset type: 16:9 high-definition Web product design board containing four coordinated desktop application screens
Input images: Image 1 is a style reference only. Preserve its crisp Japanese enterprise-operations visual language, density, three-column hierarchy, subtle borders, rounded cards, restrained shadows, status chips, and blue primary actions. Do not edit it and do not copy its products, photographs, identifiers, or exact layout.
Primary request: Create a shippable high-fidelity Japanese Web SaaS design board for a fast secondhand-clothing purchase and inventory workbench with team relay. Show four distinct but coordinated screens: (1) purchase batch intake, (2) receipt/evidence OCR and shared-cost allocation review, (3) SKU, shelf location, stock and workflow management, and (4) physical stocktake plus simultaneous-edit conflict resolution.
Scene/backdrop: very light gray product-design canvas with four clearly separated browser-window panels, generous outer margin, no decorative scenery
Style/medium: realistic production-ready Web application UI, not concept art, not a marketing website, not a low-fi wireframe; razor-sharp components, credible tables and forms, accessible contrast, large readable Japanese text
Composition/framing: exact 16:9 landscape board. One large primary workbench screen occupies the left two-thirds; three smaller companion screens/cards form a disciplined grid on the right and lower edge. Each screen has a simple title bar, command bar, table or detail panel, and visible team handoff cue. Maintain strong hierarchy and enough whitespace that labels remain legible.
Color palette: white and mist gray surfaces, deep navy headings, clear royal blue primary controls, amber warning and review chips, green completed and matched states, restrained red only for discrepancies; avoid purple-heavy palettes
Screen 1 content: title "仕入バッチ"; batch "PB-260813-07"; summary cards "点数 24", "仕入合計 ¥86,400", "未確認 3"; a dense but readable item table with columns "SKU", "商品", "仕入先", "取得原価", "証憑", "担当", "次の担当", "状態"; toolbar actions "一括割当", "OCR開始", "次の担当へ"; status chips "受付", "検品中", "要確認", "完了".
Screen 2 content: title "証憑・OCR確認"; neutral receipt thumbnail without any brand; extracted fields "取引日", "仕入先", "合計金額", "支払方法"; confidence indicators; cost sections "個別取得原価" and "共通費"; allocation area titled "按分ルール" with choices "均等", "数量", "重量", "手動"; an amber discrepancy card "差額 ¥320"; buttons "候補を確認" and "承認して反映". Make it obvious that OCR is a reviewable proposal, not silent automation.
Screen 3 content: title "SKU・棚番・在庫"; search field "SKU・商品名で検索"; filters "棚番", "在庫状態", "担当者"; columns "SKU", "商品名", "棚番", "在庫", "取得原価", "撮影", "採寸", "更新者"; example shelf locations "A-03-12", "B-01-04"; compact product thumbnails of generic unbranded clothing; green states "在庫あり" and "一致", amber "棚番未定"; blue bulk operation bar at the bottom.
Screen 4 content: split view titled "棚卸・競合を解消". Left side shows stocktake progress "棚卸 87%", "差異 2件", rows for "帳簿数", "実数", "差異" and action "差異を確認". Right side shows a simultaneous edit comparison with headings "保存済み", "自分の変更", "佐藤の変更" and changed fields highlighted, plus actions "この変更を採用", "統合して保存", "差し戻す". Include a small relay trail "仕入担当 → 検品担当 → 在庫責任者" and timestamps.
Text (verbatim): "仕入バッチ", "証憑・OCR確認", "按分ルール", "SKU・棚番・在庫", "棚卸・競合を解消", "次の担当へ", "承認して反映"
Constraints: Japanese text must be readable and correctly formed; exactly four coherent Web screens; emphasize fast keyboard-friendly workbench behavior and human team relay; practical enterprise layout; no real brand logos, no trademarks as graphics, no watermark; generic clothing only; no mobile phone mockup; no tax advice; no tiny illegible filler paragraphs
Avoid: futuristic dashboards, glassmorphism, excessive gradients, giant empty hero areas, analytics-only charts, dark mode, decorative illustrations, random English, gibberish Japanese, duplicate panels
Output intent: a polished 16:9 review artifact suitable for product approval and implementation handoff
```

## 2. `web-02-listings-orders.png`

```text
Use case: ui-mockup
Asset type: 16:9 high-definition Web product design board containing four coordinated desktop application screens
Input images: Image 1 is a style reference only. Preserve its crisp Japanese operations-console language, dense readable tables, white and pale-gray surfaces, navy text, blue primary actions, amber review states, green success states, subtle borders and team workflow cues. Do not edit it and do not copy its product images, IDs, or exact layout.
Primary request: Create a shippable high-fidelity Japanese Web SaaS design board for multi-channel listing validation, explicitly safe channel handoff, orders, shipping, exceptions and batch operations for secondhand clothing. Show four coordinated Web screens: (1) sales-channel overview, (2) listing validation and channel-specific handoff, (3) orders and shipping workbench, and (4) exception detail with public URL and status history.
Scene/backdrop: light neutral product-design canvas; four clearly separated browser-window panels with disciplined spacing; no marketing scenery
Style/medium: realistic production-ready Web app UI, not concept art and not a low-fi wireframe; clear Japanese typography, credible controls and operational data, accessible contrast
Composition/framing: exact 16:9 landscape board. Use a large channel-and-listing workbench on the left, a large orders workbench along the lower area, and two narrower validation/detail panels on the right. Make each panel distinct while sharing navigation, command-bar and status-chip patterns. Keep labels large enough to read.
Color palette: white, pale gray, deep navy, royal blue, amber, and green; gray locked controls; restrained red for delivery or data exceptions only
Screen 1 content: title "販売チャネル"; channel rows/cards labeled only with text, never logos: "個人メルカリ", "メルカリShops", "その他チャネル". Columns "連携方式", "公開中", "要確認", "最終更新", "状態". Show "個人メルカリ" as "手動引渡し"; show "メルカリShops" as "公式CSV"; show an uncontracted API channel as a gray lock with exact status "UNOPENED" and note "API契約後に開放". Add counts and an action "検証を開始".
Screen 2 content: title "出品検証"; generic unbranded jacket thumbnail; checklist "写真 8/8", "商品名", "説明文", "価格", "カテゴリ", "配送方法", "在庫引当"; amber issues "説明文を確認", "配送サイズ未確定"; clear sections for channel actions. For personal Mercari, show a blue-outlined action "個人メルカリへ手動で引き渡す" and a safety note "自動出品は行いません". Do not show scheduled, automatic, background, or one-click publishing to personal Mercari. For Shops, show "Shops公式CSVを書き出す". For the locked API channel, disable the button and show "API契約前ロック" and "UNOPENED".
Screen 3 content: title "注文・配送ワークベンチ"; filters "未処理", "発送待ち", "配送中", "例外"; columns "注文", "チャネル", "商品", "購入日時", "配送方法", "追跡番号", "担当", "期限", "状態"; generic order IDs; status chips "入金確認", "梱包待ち", "発送済み", "遅延"; visible batch toolbar "一括で担当割当", "送り状を準備", "発送済みに更新"; relay cue "受注担当 → 梱包担当 → 発送担当".
Screen 4 content: title "公開・配送の例外"; fields "公開URL", "公開状態", "最終確認", "担当者"; show one credible non-clickable generic URL such as "https://example.jp/items/JK-2608-0142" with no real domain; state timeline "検証済み → 手動引渡し済み → 公開確認済み"; exception card "追跡番号が未反映"; actions "再確認", "担当へ戻す", "解決として記録"; include a compact change log and timestamp.
Text (verbatim): "販売チャネル", "出品検証", "個人メルカリへ手動で引き渡す", "自動出品は行いません", "Shops公式CSVを書き出す", "API契約前ロック", "UNOPENED", "注文・配送ワークベンチ", "公開URL", "公開状態"
Constraints: Japanese text must be readable and correctly formed; exactly four coherent Web screens; no real brand logos or logo-like marks; brand names may appear only as plain Japanese text needed to explain channel behavior; absolutely no depiction or suggestion of automated personal-Mercari listing, price reduction, browser extension clicking, background automation, or direct API publishing; Shops official CSV is allowed; API functions remain visibly locked before contract; show fast workbench and team relay; no watermark; no mobile phone mockup; no tiny filler text
Avoid: personal-version auto publish buttons, automation robots, countdown auto posting, scraping, browser-extension UI, real Mercari logo, real URLs, dark mode, neon gradients, decorative illustration, gibberish Japanese, giant charts
Output intent: a polished 16:9 product-approval board that makes safe channel boundaries unmistakable
```

## 3. `web-03-team-approval-audit.png`

```text
Use case: ui-mockup
Asset type: 16:9 high-definition Web product design board containing four coordinated desktop application screens
Input images: Image 1 is a style reference only. Preserve its clean Japanese enterprise-workflow aesthetics, three-level hierarchy, dense but legible tables, right-side approval detail, subtle borders, status chips, blue primary buttons, amber review states and green completed states. Do not edit it and do not copy its products, people, identifiers, or exact layout.
Primary request: Create a shippable high-fidelity Japanese Web SaaS design board for team operations, least-privilege access, assignment, handoff, before-and-after approval, returns and immutable audit history. Show four coordinated screens: (1) team overview and queue health, (2) role and field-level permission matrix, (3) assignment/handoff plus change approval diff, and (4) audit log and return history.
Scene/backdrop: light gray product-design board with four precise browser-window panels and generous outer margin; no decorative setting
Style/medium: realistic production-ready Web operations UI, not concept art and not a wireframe; sharp Japanese typography, practical tables and panels, accessible contrast and restrained shadows
Composition/framing: exact 16:9 landscape board. Use one large team overview screen on the left with a dense task table; a permission matrix at upper right; a before/after approval drawer at lower center-right; a narrow audit timeline at far right. Connect panels with subtle relay arrows and consistent status vocabulary. Keep key Japanese labels clearly readable.
Color palette: white and thin pale-gray borders, deep navy headings, royal blue action and selection, amber pending and returned states, green approved states, gray hidden/denied permissions, restrained red only for blocked access
Screen 1 content: title "チーム概要"; summary cards "進行中 38", "承認待ち 7", "期限超過 2", "本日完了 46"; task table columns "作業", "商品", "担当", "役割", "次の担当", "期限", "状態"; tasks "撮影", "採寸", "検品", "出品確認", "発送"; toolbar actions "一括割当", "担当を変更", "次の担当へ"; visible relay lane "仕入 → 撮影 → 検品 → 承認 → 発送".
Screen 2 content: title "役割・権限"; matrix rows "オーナー", "経理", "検品担当", "撮影担当", "外注スタッフ"; columns "商品情報", "個人情報", "取得原価", "編集", "承認", "CSV出力"; cells "閲覧", "編集", "承認", "非表示", "不可" using clear icons and text. Highlight least privilege: external staff can see assigned product facts but "個人情報 非表示" and "取得原価 非表示"; only owner/accounting can export financial data. Include a side note "必要な情報だけを表示".
Screen 3 content: combined title "担当割当・引継ぎ" and approval drawer "変更内容を確認". Show assignee cards, workload and deadline, button "次の担当へ引き継ぐ", required handoff note, and compact activity trail. The approval diff must clearly compare columns "変更前" and "変更後" for fields such as "商品状態", "サイズ", "棚番", with colored highlights and evidence thumbnails. Actions "承認", "差し戻す", "コメントを追加"; amber returned state "差し戻し" with a concise reason.
Screen 4 content: title "監査ログ"; immutable-looking chronological table/timeline with columns "日時", "実行者", "対象", "操作", "変更前", "変更後", "承認者"; filters "期間", "担当者", "操作種別"; entries for assignment, permission denial, approval, return and export. Mask personal data using values like "購入者 ****" and show cost as "権限により非表示" for an external role. Add controls "証跡を表示" and "監査用に出力" but no destructive delete action.
Text (verbatim): "チーム概要", "役割・権限", "必要な情報だけを表示", "個人情報 非表示", "取得原価 非表示", "担当割当・引継ぎ", "次の担当へ引き継ぐ", "変更前", "変更後", "承認", "差し戻す", "監査ログ", "権限により非表示"
Constraints: Japanese text must be readable and correctly formed; exactly four coherent Web screens; make least privilege, accountability and human approval visually obvious; personal information and purchase cost must be hidden from external workers; no real names beyond generic short Japanese surnames, no real personal data, no real brand logos, no trademark graphics, no watermark; no mobile phone mockup; no destructive audit deletion; no tiny filler paragraphs
Avoid: surveillance aesthetics, cyberpunk security screens, dark mode, lock illustrations as the main subject, real portraits, exposed addresses or phone numbers, full purchase costs visible to external staff, irreversible approval with no return path, gibberish Japanese, decorative charts without operational purpose
Output intent: a polished 16:9 governance and team-relay design board suitable for stakeholder approval and implementation handoff
```

## 4. `web-02-listings-orders-v2.png` — W02 safety-boundary edit

```text
Use case: precise-object-edit
Asset type: 16:9 high-definition Web product design board containing four coordinated desktop application screens
Input images: Image 1 is the edit target, the existing `web-02-listings-orders.png`. Preserve it as faithfully as possible except for the exact safety-boundary changes below.
Primary request: Edit only the marketplace-API wording, contract-gate details, UNOPENED explanation, and public-URL presentation in Image 1. Keep the original four-screen structure, panel geometry, navigation, tables, order rows, shipping workflow, status chips, spacing, typography hierarchy, jacket thumbnail, white/pale-gray/navy/blue/amber/green palette, and overall polished Japanese operations-console appearance unchanged wherever a requested text or control replacement does not require a small reflow.

Required edit 1 — upper-left screen `販売チャネル`:
- Replace the entire third-channel identity `その他チャネル` / `API連携（未契約）` with the exact plain-text label `メルカリShops API`.
- Show a gray closed-lock icon and the exact state `連携準備中`.
- Show three explicit prerequisite chips or checklist rows, rendered verbatim: `契約済み`, `書面承認`, `API_CLIENT_NAME`.
- Keep the contract gate visually closed. Do not imply that API access is currently enabled.
- Keep `UNOPENED`, but place it beside the exact explanatory note `完成済み非公開商品（入力途中の下書きではありません）`. UNOPENED must mean a fully completed product record that is intentionally not public; it must never look like an incomplete input draft.

Required edit 2 — upper-right screen `出品検証`:
- Keep the personal-Mercari card and the exact safety note `自動出品は行いません` unchanged.
- Keep the existing Shops official-CSV card unchanged.
- Replace the third handoff-card heading with the exact text `メルカリShops API（契約後）`.
- Keep its control locked/disabled, with the gray lock and an exact disabled-state label `API契約後に利用可能`.
- Add or retain a compact contract-gate note using the three exact prerequisites `契約済み`, `書面承認`, `API_CLIENT_NAME`.
- If `UNOPENED` appears here, pair it with `完成済み非公開商品`; do not depict it as an input-in-progress draft.

Required edit 3 — lower-right screen `公開・配送の例外`:
- Delete the fictional URL `https://example.jp/items/JK-2608-0142` completely. Do not replace it with any invented URL or domain.
- Render the `公開URL` value as an empty field or `—`, followed by the exact helper text `公式画面で公開確認後にURLを登録`.
- Preserve the public-state timeline, shipping exception, actions, and change history unless a tiny spacing adjustment is needed.
- Do not display a personal-Mercari draft URL, personal-Mercari draft ID, or any link/identifier that could be interpreted as an automatically obtained personal-Mercari draft reference anywhere on the board.

Text (verbatim): `販売チャネル`, `メルカリShops API`, `連携準備中`, `契約済み`, `書面承認`, `API_CLIENT_NAME`, `UNOPENED`, `完成済み非公開商品（入力途中の下書きではありません）`, `出品検証`, `個人メルカリへ手動で引き渡す`, `自動出品は行いません`, `Shops公式CSVを書き出す`, `メルカリShops API（契約後）`, `API契約後に利用可能`, `注文・配送ワークベンチ`, `公開・配送の例外`, `公開URL`, `公式画面で公開確認後にURLを登録`.

Invariants: exactly four coordinated Web screens; preserve the original 2×2 panel arrangement and proportions; preserve all unrelated UI content and operational density; preserve readable Japanese sans-serif typography and accessible contrast; preserve individual Mercari as manual handoff only; preserve Shops official CSV; no personal-Mercari automation; no automatic/background/one-click personal-Mercari publishing; no personal-Mercari draft URL or draft ID; no fictional URL; no API-unlocked appearance before all contract conditions; no logos or logo-like marks; no watermark; no mobile mockup.
Avoid: changing the visual concept, rearranging screens, adding a fifth screen, random replacement text, gibberish Japanese, invented domains, example URLs, real URLs, personal-Mercari automation controls, browser-extension UI, scraping, API keys or secrets, enabled API-publish button, dark mode, neon gradients, decorative illustrations.
Output intent: a minimally changed, polished 16:9 W02 v2 review artifact whose API contract gate, UNOPENED semantics, and manual public-URL confirmation boundary are unmistakable.
```
