# 価格運用 UI モック生成プロンプト

作成日: 2026-08-13（JST）  
生成方式: built-in ImageGen  
スタイル参照（編集対象ではない）: `docs/design/concept-bc-hybrid-v2.png`

## M11 — mobile-11-price-operations-v1.png

```text
Use case: ui-mockup
Asset type: project-bound high-fidelity Japanese mobile SaaS UI design board
Input images: Image 1 is STYLE REFERENCE ONLY. Do not edit, copy, or reproduce its screen content; use only its approved B+C visual language, spacing discipline, typography hierarchy, subtle borders and shadows.
Primary request: Create a brand-new 16:9 landscape product-design board titled 「価格運用」 containing exactly six separate tall portrait iPhone app screens arranged left-to-right, numbered 01–06. This is a shippable, realistic Japanese operations SaaS UI, not concept art or advertising. Each phone has one clear purpose and all six use one consistent bottom navigation.
Style/medium: high-fidelity product UI mockup; white and light-gray background, navy text, royal-blue primary actions, amber warnings, red blocking errors, green confirmed states, restrained rounded cards, subtle thin borders and soft shadows; dense but calm; accessible contrast; readable Japanese labels; no tiny paragraphs.
Composition/framing: one clean 16:9 board, six full-height portrait phones visible and evenly spaced, with a short board title and compact screen numbers above; shared bottom navigation on every phone: 「作業」「商品」「価格」「承認」「履歴」 with 「価格」 selected where appropriate.
Screen 01 「価格案」: one SKU with generic product thumbnail, SKU AP-2608-0142, channel badge 「個人版」 or 「Shops」, current price ¥6,800, a compact price-history sparkline/table, segmented rule choice 「新価格」「○円値下げ」「○%」, fields ¥6,300 / 500円値下げ / 7.4%, effective date and required reason.
Screen 02 「採算プレビュー」: clearly separate cards/rows for 「購入者支払額」「出品者受取額」「原価」「販売手数料」「送料」「梱包資材」「粗利益」「取引貢献利益」. Show policy floor and three scenario cards 「維持 ¥6,800」「提案 ¥6,300」「下限 ¥5,900」. A missing-cost row must show a red blocker 「原価未入力：承認できません」. Add a small legend differentiating 「出品者負担の価格変更」「チャネルクーポン」「商品プロモーション費」.
Screen 03 「公式経路」: four explicit route cards with these exact labels: 「個人版：公式画面で手動変更」「Shops：公式CSV」「タイムセール：公式管理画面」「商品プロモーション：公式アプリ」. Put the exact safety note in an amber information box: 「非公式な自動操作は行いません」. Actions should be preparation/opening only, never automatic execution.
Screen 04 「承認」: before/after price comparison, floor and contribution summary, warning stack for 「下限価格違反」「取引貢献利益がマイナス」「重複申請」「タイムセール中は価格変更不可」. Show approver identity role 「責任者：佐藤」 and buttons 「承認する」「差し戻す」. Red warnings block approval.
Screen 05 「反映チェック」: due-action checklist that opens the official route and requires a user checkbox with the exact label 「公式側の反映を確認」 before enabling 「結果を記録」. Steps: 「公式画面を開く」「価格を入力」「表示を目視確認」, then checkbox. Show status 「本人操作待ち」 and clearly no unattended loop.
Screen 06 「監査・結果」: immutable audit timeline with actor, approver, timestamp, reason, evidence and result. Show observation cards 「7日」「14日」「30日」 for sell-through/reference outcomes, badge 「n<10 参考値」, and the exact fixed note: 「運用分析の参考値です。会計上の利益・所得・税額ではありません」.
Text accuracy: render all quoted Japanese labels verbatim and legibly where possible; favor short labels over microtext.
Constraints: exactly six phones; one screen one purpose; visible owner, approval, and audit; neutral channel labels only 「個人版」「Shops」; generic product imagery and fictional data; no real brand logos, trademarks, platform logos, certification seals, or watermark.
Avoid: the word メルカリ; auto-listing, scraping, private API, browser automation, RPA, unattended bulk updates, false sale claims, tax advice, confetti, marketing hero art, dark theme, illegible microtext.
```

## W09 — web-09-price-campaigns-v1.png

```text
Use case: ui-mockup
Asset type: project-bound high-fidelity Japanese desktop SaaS UI design board
Input images: Image 1 is STYLE REFERENCE ONLY. Do not edit, copy, or reproduce its screen content; use only its approved B+C visual language, information density, typography hierarchy, restrained borders and shadows.
Primary request: Create a brand-new polished 16:9 desktop operations dashboard titled 「価格キャンペーン」. It must look like a shippable Japanese SaaS screen, not advertising or concept art.
Style/medium: realistic high-fidelity product UI; white and very light-gray surfaces, navy text, royal-blue primary actions, amber warnings, red blocking rows, green confirmed status, subtle thin borders, restrained shadows, dense but calm, accessible contrast and readable Japanese labels.
Composition/framing: a single desktop dashboard. Left sidebar contains campaign list, status filters and channel filters. Main center contains the campaign builder and a large bulk-preview table. Right rail contains an official-capability/handoff matrix. Lower area contains outcome observation and immutable audit timeline.
Left campaign list: filters 「個人版」「Shops」 and statuses 「下書き」「承認待ち」「反映待ち」「確認済み」; several fictional campaigns with owner and dates.
Main top campaign builder: rule selector showing 「500円値下げ」 or 「10%」, schedule, target filters, reference-price basis, owner and approver. Include a prominent amber note: 「開始価格は内部履歴です。自動的に通常価格とはみなしません」.
Large bulk preview table: columns 「SKU」「現価格」「新価格」「値下げ率」「原価」「送料」「手数料」「取引貢献利益」「下限価格」「公式経路」「状態」. Use fictional products. Highlight exceptional rows with short explicit labels: 「原価未入力」「貢献利益マイナス」「在庫0」「売却済み」「入札あり」「重複」「タイムセール中」. Blocking rows are red or amber and cannot proceed.
Right capability / official handoff matrix: four rows: 「個人版：手動反映キュー」, 「Shops：差分CSV 最大10,000件・プレビュー後アップロード」, 「公式タイムセール：1–90%・適格性は公式画面で確認」, 「公式クーポン：公式画面」. Add a locked API row: 「契約API：書面承認・スキーマ確認後のみ」. Never imply automatic changes.
Primary buttons, rendered exactly: 「差分CSVを作成」「公式画面を開く」「承認へ提出」. Add the exact fixed note near these actions: 「反映は公式経路で人が確認します」.
Prominent rule guard: a red-bordered compliance card with the exact text: 「公式タイムセール以外では、根拠のない『セール』『○%OFF』『通常価格』を商品名・説明・画像へ入れません」.
Lower outcome panel: compare observational results at 「7日」「14日」「30日」 using compact charts/cards for 「売却率」「販売日数中央値」「取引貢献利益」「返品」「未販売」. Label clearly 「観察比較」 and 「n<10 参考値」, and state 「因果効果を示すものではありません」.
Audit timeline: actor, approver, reason, evidence and result with timestamps; immutable audit presentation.
Text accuracy: render quoted Japanese labels verbatim and legibly; favor concise cells and headers, avoid tiny paragraphs.
Constraints: clear owner, approval and audit; neutral channel labels only 「個人版」「Shops」; generic thumbnails and fictional data; no real brand logos, trademarks, platform logos, certification seals, or watermark; one coherent desktop screen.
Avoid: the word メルカリ; auto-listing, scraping, private API, browser automation, RPA, unattended bulk update claims, false sale/discount claims, causal claims, tax advice, marketing hero layout, dark theme, illegible microtext.
```

## W09 v2 — web-09-price-campaigns-v2.png（指定文言のみの編集）

```text
Use case: text-localization
Asset type: targeted text correction of an existing high-fidelity Japanese desktop SaaS UI board
Input images: Image 1 is the EDIT TARGET.
Primary request: Make exactly five targeted text corrections in Image 1 and no other changes.
Text replacements, verbatim:
1. In the Shops row of the right-side 「公式経路 / ハンドオフ矩陣」, replace the badge 「半自動」 with 「人が実行」.
2. Replace the right-side blue primary button label 「差分CSVを作成」 with 「公式更新CSVを作成」.
3. In the 「契約API」 row, replace the badge 「自動」 with 「未接続」.
4. In the same 「契約API」 row, replace its small explanatory text with exactly 「契約・書面承認・現行仕様確認後のみ」.
5. In the Shops card, replace the explanatory sentence with exactly 「商品ID＋変更項目の公式CSVを作成し、人がプレビュー後にアップロードします。」 if it fits legibly.
Required invariant: Keep the blue note exactly unchanged as 「反映は公式経路で人が確認します」.
Constraints: Change only the specified UI phrases. Preserve the complete 16:9 composition, pixel dimensions, all panels, layout, alignment, spacing, tables, every table value, typography style and size, palette, icons, avatars, borders, shadows, buttons, warnings, status colors, audit data, charts, and all other text exactly as Image 1. Do not crop, move, add, remove, redraw, restyle, simplify, reinterpret, or improve any other element. No logos, trademarks, or watermark.
```

## W09 v3 — web-09-price-campaigns-v3.png（警告文のみの編集）

```text
Use case: text-localization
Asset type: one targeted text correction in an existing high-fidelity Japanese desktop SaaS UI board
Input images: Image 1 is the EDIT TARGET.
Primary request: Change only the red warning paragraph inside the lower-left red-bordered card titled 「ルール遵守の必須事項」.
Text replacement, verbatim: 「公式タイムセール利用時を除き、『値引き』『セール』、値引率・値引額、値引前価格を商品名・説明・画像に記載しません」
Required removals: Remove the old wording, including the phrase 「根拠のない」. Do not display 「根拠のない」 anywhere.
Required invariant: Keep the card title exactly 「ルール遵守の必須事項」.
Constraints: Change only that paragraph. Preserve the complete 16:9 composition, pixel dimensions, all panels, layout, alignment, spacing, tables, every table value, all other Japanese text, typography style and size, palette, icons, avatars, borders, shadows, buttons, warnings, status colors, audit data, charts, and every other element exactly as Image 1. Do not crop, move, add, remove, redraw, restyle, simplify, reinterpret, or improve anything else. Use natural line wrapping within the existing card and keep the replacement paragraph legible in red type. No logos, trademarks, or watermark.
```
