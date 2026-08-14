# Product Research UI Mock Prompts v1

生成方式: built-in ImageGen（各アセット1回）  
スタイル参照: `docs/design/concept-bc-hybrid-v2.png`（STYLE REFERENCE ONLY、編集対象ではない）

## M10 — mobile-10-product-research-inspection-v1.png

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese iOS product UI design board for project documentation
Input images: Image 1 is STYLE REFERENCE ONLY. Do not edit it, do not copy its screens, product photos, data, or layout verbatim. Derive only its approved B+C hybrid visual language: shippable white/light-gray SaaS surfaces, navy text hierarchy, royal-blue primary actions, amber warnings, green confirmed states, subtle gray borders and restrained shadows, compact but calm operational density.

Primary request: Create one polished 16:9 landscape presentation board titled exactly 「商品リサーチ・検品」. Arrange exactly seven separate, fully visible iPhone portrait screens in one clean left-to-right row. Every phone is a different sequential step, one screen/one purpose, with consistent iPhone chrome, Japanese Gothic sans-serif typography, generous tap targets around 44pt, readable primary labels, and the same bottom navigation on all phones: 「今日」「商品」「撮影」「調査」「その他」, with 「調査」 selected in royal blue. Use an original fictitious inventory item and neutral thumbnail photos of a plain navy garment/tag/barcode; no recognizable brand.

Screen 1 — 「調査開始」:
Show SKU 「RS-2608-0142」, 担当 「田中」, status chip 「調査中」. Present four large 2×2 capture-mode cards with exact labels 「バーコード」「タグ」「型番」「商品写真」. Primary button 「調査を開始」.

Screen 2 — 「コードを読む」:
Live-camera barcode scan composition with a clear scan frame and format chips 「EAN-13」「UPC-A」. Show decoded example 「4901234567894」 and badge 「端末内解析」. Provide large actions 「手入力」「再試行」. Include a concise permission state/card 「カメラの許可が必要」 with action 「設定を開く」, without crowding the screen.

Screen 3 — 「タグOCR確認」:
Show the original tag photo thumbnail above four clear OCR review rows: 「ブランド」「型番」「素材」「表示者」. Each row has a value candidate, a visible confidence percentage, and compact human decisions 「採用」「修正」「不明」. Add an amber note exactly 「洗濯記号は人が確認」. OCR results are candidates, never final facts.

Screen 4 — 「商品候補」:
Compare three explicit choices 「候補A」「候補B」「不明」. Candidate A and B use an invented label such as “NORTH CLOTH” and fictitious model codes, with evidence chips like 「型番一致」「タグ一致」「色違い」. Clearly display an amber badge 「候補・未確定」. Primary CTA exactly 「この候補で調査」. Do not show any “AI confirmed” language.

Screen 5 — 「公式情報を確認」:
Show removable query chips 「NORTH CLOTH」「NC-2417」「ネイビー」「M」. Four large outlined/filled buttons with exact labels 「GS1公式」「公式サイト」「画像で探す」「フリマ公式画面」. Place a prominent calm notice verbatim: 「外部画面で人が確認／自動取得しません」. No automated acquisition controls.

Screen 6 — 「根拠を追加」:
Show a shared-URL field, source selector 「フリマ公式画面」, sale state 「売却済み」, price 「¥4,800」, shipping 「送料込み」, condition 「目立った傷なし」, match checks 「サイズ一致」「色一致」. Human choice 「採用」「除外」 plus field 「除外理由」 and timestamp 「2026/08/13 14:32 JST」. Primary button 「根拠を保存」. Make it obvious these values are manually reviewed.

Screen 7 — 「調査サマリー」:
Show 「採用 5件」. Visually separate two cards: 「販売中の希望価格」 with a sample range, and 「売却済み観測価格」 with 「中央値 ¥4,800」「範囲 ¥4,200–¥5,300」. Add amber issues 「送料不明 1件」「型番相違 1件」 and status 「根拠不足」. Provide a human checklist 「商品候補を人が確認」「価格判断を人が確定」, a green action 「確認済みにする」, and a compact 「監査ログ」 entry.

Composition/framing: exact seven-phone board, evenly spaced, no cropped phones, no overlapping devices, modest title/header above, ample outer margin. Make main Japanese labels legible at a glance; use short cards, chips, rows, and values instead of tiny paragraphs.
Style/medium: realistic shippable Japanese SaaS UI mockup, not concept art, not a wireframe, practical accessibility.
Color palette: white and #F5F7FA light gray, deep navy text, royal blue primary, amber warning, green confirmed, cool-gray borders.
Constraints: render the quoted Japanese labels accurately; explicit human review, owner, evidence, approval, and audit cues; candidate language rather than certainty. No logos, no trademarks, no watermark, no Mercari name or logo, no branded marketplace icon, no auto-scraping claim, no public API claim, no automatic product identification, no authenticity judgment, no automatic price determination.
Avoid: microscopic text blocks, illegible dense prose, fantasy/glassmorphic UI, gradients as decoration, neon colors, duplicated phones, malformed device frames, cropped screens, ambiguous automation icons.
```

## W08 — web-08-product-research-workbench-v1.png

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese desktop SaaS dashboard board for project documentation
Input images: Image 1 is STYLE REFERENCE ONLY. Do not edit it, do not copy its product photos, SKU values, screen content, or layout verbatim. Derive only its approved B+C hybrid visual language: shippable white/light-gray SaaS surfaces, navy text hierarchy, royal-blue primary actions, amber warnings, green confirmed states, subtle cool-gray borders and restrained shadows, dense but calm operations UI.

Primary request: Create one polished 16:9 landscape desktop dashboard board titled exactly 「リサーチ根拠ワークベンチ」. It must look like a real production Japanese SaaS application used by an operations team to research and inspect secondhand inventory. One coherent desktop app window, not a collage of unrelated screens.

Global header:
Hamburger/navigation icon, exact title 「リサーチ根拠ワークベンチ」, search field 「SKU・商品名で検索」, notification icon, user chip 「田中」. Below it, selected item header with SKU 「RS-2608-0142」, small neutral photos of a plain navy garment, barcode and fabric tag, owner 「担当 田中」, deadline 「期限 08/14 18:00」, and status 「確認待ち」.

Left sidebar — filters and SKU queue:
A compact filter area and a vertical queue of at least five SKUs. Clearly show status chips using the exact labels 「調査中」「根拠不足」「確認待ち」「確定」. Selected SKU highlighted in royal blue. Include concise counts and owner avatars/initials without real people.

Main workspace, upper-left source panel:
Panel heading 「原本・読取データ」. Show original tag-photo and barcode-photo thumbnails. Show structured raw fields for barcode/EAN, OCR raw text, brand candidate, model candidate, material candidate, confidence. Place provenance badges exactly 「端末内」「公式画面・手入力」「契約API」 with a small legend; demonstrate that the current item uses 「端末内」 and 「公式画面・手入力」, while 「契約API」 is an available provenance type only, not an automatic acquisition claim.

Main workspace, upper-center candidate panel:
Panel heading 「商品候補比較」. Practical comparison table with columns 「項目」「候補A」「候補B」「原本」 and rows 「ブランド」「型番」「サイズ」「色」「素材」. Use fictitious label “NORTH CLOTH”, models “NC-2417” and “NC-2417N”, size M, navy, polyester. Mark matches green and conflicts amber. Show badge 「候補・未確定」. Below, query chips 「NORTH CLOTH」「NC-2417」「ネイビー」「M」 and official-search buttons 「GS1公式」「公式サイト」「画像で探す」「フリマ公式画面」. Include the exact safety note 「公式画面で人が選択・確認します」. No control suggesting automated acquisition.

Main workspace, large central-lower evidence table:
Heading 「比較根拠」 and a spacious dense-but-readable table. Columns with short labels: 「URL / 出所」「販売状態」「価格」「送料」「状態」「一致度」「確認日時」「判断」「理由」. Show six example rows using neutral sources such as 「フリマ公式画面」「公式サイト」「GS1公式」 and shortened safe URLs, not logos. Clearly distinguish green 「売却済み」 from blue-gray 「販売中」. Example prices ¥4,200–¥5,600; shipping 「込み」「別」「不明」; condition; match chips; checked timestamps; human decision buttons/chips 「採用」「除外」 plus brief reasons 「別型番」「色違い」「送料不明」. Include compact states within the panel: an empty-state mini row 「根拠がまだありません」, conflict badge 「候補が競合」, stale badge 「30日前」, and URL error badge 「URL切れ」. Do not make these overwhelm the actual evidence rows.

Right analytics and approval column:
Top card heading 「価格の見方」 with two strongly separated sections:
1. 「販売中の希望価格」 with sample range 「¥4,900–¥5,600」 and label 「参考：販売者の設定価格」
2. 「売却済み観測価格」 with 「採用 5件」「中央値 ¥4,800」「範囲 ¥4,200–¥5,300」
Do not merge the two groups.
Add warnings 「送料不明 1件」「古い根拠 1件」「URLエラー 1件」.
Next card heading 「AI要約」 with only 2–3 short candidate observations and badge 「参考」.
Separate card heading exactly 「人の結論」 with editable conclusion, reviewer 「確認者 佐藤」, approval status, royal-blue button 「承認する」 and outlined button 「差し戻す」. Human control is visually primary over AI.

Bottom full-width operations strip:
A compact audit timeline heading 「監査タイムライン」 with entries for capture, OCR correction, evidence adoption and reviewer action. Adjacent panels for 「コメント・引継ぎ」 with @佐藤 and next action, 「計算バージョン v1.2」, and export button 「CSV出力」. Make ownership, handoff, approval and audit trace easy to scan.

Composition/framing: one complete 16:9 desktop browser/app frame filling most of the board, balanced grid with left queue, broad center evidence work area, right analytics, and bottom audit strip. Main Japanese headings and data must be legible. Prefer concise tables, chips and cards over tiny prose. Use realistic spacing and a 12-column product grid.
Style/medium: realistic shippable Japanese SaaS UI mockup, not concept art, not a wireframe, practical accessibility, dense but calm.
Color palette: white and #F5F7FA light gray, deep navy text, royal blue primary, amber warning, green confirmed, cool-gray borders.
Text (verbatim and prominent where specified): 「リサーチ根拠ワークベンチ」, 「端末内」, 「公式画面・手入力」, 「契約API」, 「公式画面で人が選択・確認します」, 「販売中の希望価格」, 「売却済み観測価格」, 「AI要約」, 「人の結論」.
Constraints: no button or wording that implies automatic acquisition; all evidence is selected and reviewed by a person; clearly separate candidate, evidence, AI reference, and human conclusion. No logos, no trademarks, no watermark, no Mercari name or logo, no branded marketplace icon, no auto-scraping claim, no public API claim, no automatic product identification, no authenticity judgment, no automatic price determination.
Avoid: microscopic paragraph text, illegible overload, giant charts, fantasy/glassmorphic UI, gradients as decoration, neon colors, marketplace branding, automatic-import arrows, robotic assistants, duplicate panels, cropped app frame.
```
