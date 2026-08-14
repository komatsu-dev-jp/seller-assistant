# モバイル設計ボード追加生成プロンプト

生成方式: built-in `image_gen`（各アセットにつき独立した1回の生成）

## mobile-04-ai-listing.png

```text
Use case: ui-mockup
Asset type: Japanese resale-operations app, 16:9 landscape mobile product-design board
Primary request: Create one polished 16:9 design board containing exactly six separate tall iPhone screens for an “AI listing draft and official handoff” workflow. This is a coherent six-step mobile flow, not one wide dashboard.
Input images: Image 1 is a style reference only. Borrow its clean enterprise UI language: white surfaces, pale gray dividers, precise spacing, thin borders, rounded cards, blue primary actions, amber warning states, green success states, and restrained shadows. Do not copy its product photos or page content.
Scene/backdrop: Pale cool gray-white presentation board with generous margins and subtle soft shadows; no decorative scenery.
Style/medium: Shippable high-fidelity iOS UI mockup, crisp modern Japanese sans-serif typography, practical production interface, not concept art.
Composition/framing: Exactly six complete portrait iPhone screens in one evenly spaced horizontal row, same size, no overlap, no cropping, no angled perspective. Add a small step number above each phone. Use short, large, readable Japanese labels and avoid tiny paragraphs. Every screen uses the same bottom navigation: “ホーム”, “商品”, “作業”, “収支”, “設定”; “商品” is active.
Screen 1 — AI文章候補: heading “AI文章候補”; cards labeled “候補A”, “タイトル”, “説明文”; a blue action “候補を採用”.
Screen 2 — 差分・根拠: heading “差分・根拠”; a clear before/after comparison labeled “変更前” and “変更後”; evidence chips “採寸写真”, “タグOCR”, “商品メモ”; a link “根拠を表示”.
Screen 3 — 出品前検証: heading “出品前検証”; checklist rows “必須項目”, “画像”, “採寸”, “状態”; one amber badge “要確認 1件”; action “修正する”.
Screen 4 — 個人メルカリへ: plain text heading “個人メルカリへ” with no platform logo; prominent exact status badge “手動・本人確認”; actions “説明文をコピー”, “画像を書き出す”, “公式画面を開く”; note “本人が最終確認して出品”. This must clearly be a manual handoff, never automatic listing.
Screen 5 — Shops書き出し: heading “Shops書き出し”; prominent exact status badge “公式CSV”; action “CSV＋画像を書き出す”; a second locked integration card with exact status badge “連携準備中” and text “API契約前は利用不可”; show “UNOPENED（非公開）”.
Screen 6 — URL・状態管理: heading “URL・状態管理”; compact records for “商品ページURL”, “公開URL”, “下書きID”, “UNOPENED”; visibly include all four exact state labels “手動・本人確認”, “公式CSV”, “連携準備中”, “公式API”; show one “公開済み” row and one non-public row.
Color palette: White, very light cool gray, deep navy text, vivid accessible blue, restrained amber, calm green.
Text (verbatim): “AI文章候補”, “差分・根拠”, “出品前検証”, “手動・本人確認”, “公式CSV”, “連携準備中”, “公式API”, “UNOPENED（非公開）”, “商品ページURL”, “公開URL”. Render these labels exactly with no garbled characters.
Constraints: One screen, one purpose. Preserve a consistent component system and common bottom navigation across all six screens. Make the Japanese readable at presentation scale. Use neutral sample products and generic icons only.
Avoid: Mercari logo or any marketplace logo; trademarks as visual marks; automatic personal-account listing; robot auto-submit imagery; claims of successful posting before human confirmation; browser automation; decorative gradients; dark mode; illegible microtext; extra phones; watermark.
```

## mobile-04-ai-listing-v2.png — 安全修正

```text
Use case: precise-object-edit
Asset type: Safety correction to an existing 16:9 Japanese mobile product-design board
Input images: Image 1 is the edit target, the existing mobile-04-ai-listing.png design board.
Primary request: Change only the body content inside the rightmost sixth phone labeled “URL・状態管理”. Replace its unsafe URL and draft-data presentation with the exact safe state model below. Keep every other visible element unchanged.
Target region: Only screen 6, inside the phone body below its “URL・状態管理” header and above its existing common bottom navigation.
Screen 6 layout: Use two compact white cards with the same thin gray borders, spacing, typography, blue, amber, green, and purple status accents already used in Image 1.
Card 1 heading: “個人メルカリ”. Show these three states as a short vertical sequence: “本アプリ下書き”, “メルカリ内下書き（URLなし）”, “公開済み（本人確認済みURLあり）”. Show an empty field labeled “公開URL” with placeholder “公開後にURLを入力”. Under the empty field, show only the format helper “形式：jp.mercari.com/item/...”. Include the badge “手動・本人確認”. Do not show any personal-account draft ID or draft URL.
Card 2 heading: “Shops”. Clearly distinguish “非公開商品（商品IDあり・公開URLなし）” from “公開済み（確認済みURLあり）”. A non-public row may show the field label “商品ID”, but it must not display or construct a URL. Add the exact note “商品IDからURLを推測しない”. Include the badges “公式CSV”, “連携準備中”, “公式API”.
Text (verbatim): “URL・状態管理”, “個人メルカリ”, “本アプリ下書き”, “メルカリ内下書き（URLなし）”, “公開済み（本人確認済みURLあり）”, “公開URL”, “公開後にURLを入力”, “形式：jp.mercari.com/item/...”, “手動・本人確認”, “Shops”, “非公開商品（商品IDあり・公開URLなし）”, “公開済み（確認済みURLあり）”, “商品ID”, “商品IDからURLを推測しない”, “公式CSV”, “連携準備中”, “公式API”. Render these labels exactly with no garbled characters.
Invariants: Preserve screens 1 through 5 as closely as possible, including every title, card, icon, button, device frame, screen position, and bottom-navigation state. Preserve the complete 1672×941-style 16:9 composition, six-phone spacing, background, top step numbers, shadows, palette, font hierarchy, screen 6 phone shell, screen 6 title, and screen 6 bottom navigation. Change only the requested screen 6 body content.
Avoid: Any “下書きID” or “下書きURL” for the personal marketplace; DRAFT identifiers; example.com; invented item IDs; prefilled public URLs; URLs inferred from a Shops product ID; any automatic personal-account listing; marketplace logos; changes to screens 1–5; extra phones; cropping; watermark.
```

## mobile-05-orders-inventory-team.png

```text
Use case: ui-mockup
Asset type: Japanese resale-operations app, 16:9 landscape mobile product-design board
Primary request: Create one polished 16:9 design board containing exactly six separate tall iPhone screens for an “orders, inventory, shipping, and outsourced-team work” workflow. This is a coherent six-step mobile flow, not one wide dashboard.
Input images: Image 1 is a style reference only. Borrow its clean enterprise UI language: white surfaces, pale gray dividers, precise spacing, thin borders, rounded cards, blue primary actions, amber warning states, green success states, and restrained shadows. Do not copy its product photos or page content.
Scene/backdrop: Pale cool gray-white presentation board with generous margins and subtle soft shadows; no decorative scenery.
Style/medium: Shippable high-fidelity iOS UI mockup, crisp modern Japanese sans-serif typography, practical operations interface, not concept art.
Composition/framing: Exactly six complete portrait iPhone screens in one evenly spaced horizontal row, same size, no overlap, no cropping, no angled perspective. Add a small step number above each phone. Use short, large, readable Japanese labels and avoid tiny paragraphs. Every screen uses the same bottom navigation: “ホーム”, “商品”, “作業”, “収支”, “設定”; “作業” is active.
Screen 1 — 注文: heading “注文”; summary cards “未着手 12”, “今日発送 8”; order rows with SKU and deadline; blue action “作業を開始”.
Screen 2 — ピッキング: heading “ピッキング”; route “A-03 → B-11”; large item checklist, SKU, shelf code, scan button “読取”; progress “2 / 4”.
Screen 3 — 梱包証拠: heading “梱包証拠”; two clear photo slots labeled “外観” and “封緘”; fields “重量 680g” and “記録済み”; blue action “証拠を保存”.
Screen 4 — 発送: heading “発送”; cards “送り状作成”, “集荷待ち”, masked tracking value “**** 4821”; action “発送通知”; green completion chip “準備完了”.
Screen 5 — 在庫数: heading “在庫数”; summary “販売可能”, “引当”, “差異”; SKU rows with quantity, shelf “A-03”, and one amber discrepancy; action “棚卸を確認”.
Screen 6 — 外注タスク: heading “外注タスク”; visible workflow states “引継ぎ”, “承認”, “差戻し”; task assignee and deadline; permission card with lock icon and exact labels “住所：必要時のみ”, “原価：非表示”, “権限：梱包担当”; actions “承認” and “差戻し”.
Color palette: White, very light cool gray, deep navy text, vivid accessible blue, restrained amber, calm green.
Text (verbatim): “注文”, “ピッキング”, “梱包証拠”, “発送”, “在庫数”, “外注タスク”, “引継ぎ”, “承認”, “差戻し”, “住所：必要時のみ”, “原価：非表示”, “権限：梱包担当”. Render these labels exactly with no garbled characters.
Constraints: One screen, one purpose. Preserve a consistent component system and common bottom navigation across all six screens. Make the Japanese readable at presentation scale. Clearly communicate minimum necessary access to sensitive address and cost data.
Avoid: Marketplace logos; exposing a full address; exposing real customer data; showing full tracking numbers; showing purchase cost to the outsourced packing role; broad admin permission; decorative gradients; dark mode; illegible microtext; extra phones; watermark.
```

## mobile-06-finance-export.png

```text
Use case: ui-mockup
Asset type: Japanese resale-operations app, 16:9 landscape mobile product-design board
Primary request: Create one polished 16:9 design board containing exactly six separate tall iPhone screens for a “finance evidence, AI bookkeeping candidate, review, and accounting CSV export” workflow. This is a coherent six-step mobile flow, not one wide dashboard.
Input images: Image 1 is the overall product-style reference. Image 2 is the finance-information reference. Borrow their clean enterprise UI language: white surfaces, pale gray dividers, precise spacing, thin borders, rounded cards, blue primary actions, amber review states, green approved states, compact charts, and restrained shadows. Do not copy their product photos or transaction content.
Scene/backdrop: Pale cool gray-white presentation board with generous margins and subtle soft shadows; no decorative scenery.
Style/medium: Shippable high-fidelity iOS UI mockup, crisp modern Japanese sans-serif typography, practical bookkeeping-support interface, not concept art.
Composition/framing: Exactly six complete portrait iPhone screens in one evenly spaced horizontal row, same size, no overlap, no cropping, no angled perspective. Add a small step number above each phone. Use short, large, readable Japanese labels and avoid tiny paragraphs. Every screen uses the same bottom navigation: “ホーム”, “商品”, “作業”, “収支”, “設定”; “収支” is active.
Screen 1 — 収支: heading “収支”; period “2025年度”; metric cards “売上”, “仕入”, “手数料”, “送料”, “見込粗利”; one compact blue line chart.
Screen 2 — レシート: heading “レシート”; camera capture area; action “撮影”; OCR fields “日付”, “金額”, “支払先”; blue action “保存”.
Screen 3 — 取引: heading “取引”; list of transactions with evidence status chips “証憑あり”, “未連携”; action “取引と照合”; one selected row linked to a receipt thumbnail.
Screen 4 — AI仕訳候補: heading “AI仕訳候補”; debit and credit candidate card; confidence shown only as “要確認”; evidence section labeled “根拠” with “レシート” and “取引履歴”; two equal actions “保留” and “承認”.
Screen 5 — 未解決・年度確認: heading “未解決”; amber summary “未解決 3件”; clearly visible control “年度確認”; fiscal-period selector; checklist rows for evidence and transaction matching; action “確認を続ける”.
Screen 6 — MF CSV出力: heading “MF CSV出力”; a prominent calm-green confirmation card with the exact phrase “会計ソフト取込準備完了”; export details “2025年度”, “128件”, “未解決 0件”; blue action “MF CSVを出力”; small neutral note “最終判断は本人または税理士へ”.
Color palette: White, very light cool gray, deep navy text, vivid accessible blue, restrained amber, calm green.
Text (verbatim): “収支”, “レシート”, “取引”, “AI仕訳候補”, “根拠”, “保留”, “承認”, “未解決”, “年度確認”, “MF CSV出力”, “会計ソフト取込準備完了”, “最終判断は本人または税理士へ”. Render these labels exactly with no garbled characters.
Constraints: One screen, one purpose. Preserve a consistent component system and common bottom navigation across all six screens. Make the Japanese readable at presentation scale. Present AI output only as a reviewable bookkeeping candidate supported by evidence. The export screen communicates readiness for accounting-software import only.
Avoid: Any phrase claiming tax filing is complete; tax advice, tax-saving recommendations, filing eligibility decisions, or authoritative tax conclusions; marketplace or accounting-software logos; decorative gradients; dark mode; illegible microtext; extra phones; watermark.
```
