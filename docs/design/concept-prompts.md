# UIコンセプト画像｜生成プロンプト

画像はUI方向性を比べるラフであり、画像内の細かな文章や数値は仕様の根拠にしない。正確な文言は比較表と、承認後の `selected-direction.md` で固定する。

## A 堅実「安心ステップ」

```text
Use case: ui-mockup
Asset type: cross-platform product UI concept board
Primary request: a polished Japanese resale inventory workflow app concept named only as a generic product workspace, focused on a beginner-friendly step-by-step iPhone capture and measurement flow, with a supporting desktop review view
Scene/backdrop: clean warm off-white product design presentation board
Subject: one large realistic iPhone screen showing step 3 of 5 for a navy shirt; a photo checklist, simple garment measurement diagram, shoulder width and body width fields, clear progress indicator, save-draft control, and one prominent next button; one smaller desktop browser screen showing the same item awaiting review
Style/medium: shippable native iOS and modern responsive web UI, calm, trustworthy, practical, not concept art
Composition/framing: 16:9 landscape board; iPhone is the clear focal point; desktop companion view to the side; generous whitespace; readable hierarchy
Color palette: warm white, deep navy, teal-blue primary action, restrained amber warning, high contrast
Text (verbatim, only these short labels where legible): "撮影", "採寸", "確認", "肩幅", "身幅", "次へ", "途中保存"
Constraints: minimum 44pt-looking controls; clear labels plus icons; show AI as a candidate requiring human confirmation; no marketplace logos, no Mercari trademark, no fake analytics, no tiny dense text, no watermark
Avoid: dark cyberpunk UI, excessive gradients, floating glass cards, clutter, automatic publish button
```

## B 実用「高速ワークベンチ」

```text
Use case: ui-mockup
Asset type: cross-platform product UI concept board
Primary request: a polished high-density web workbench for a Japanese resale inventory operation, optimized for reviewing many products quickly, with a compact supporting iPhone quick-capture screen
Scene/backdrop: crisp light neutral product design presentation board
Subject: one large desktop browser dashboard with a left filter rail, center product table with thumbnail, SKU, workflow status, shelf location, missing fields, gross profit, assignee, and updated time; a right inspector containing larger photos, measurement values, AI description candidate with evidence, approve and return controls; one smaller iPhone capture screen for adding photos and measurements
Style/medium: shippable B2B SaaS interface, precise, efficient, calm, highly usable, not a financial trading terminal
Composition/framing: 16:9 landscape board; desktop view dominates; consistent 8-point grid; clear table hierarchy; no overlapping mockups
Color palette: white, cool gray, charcoal text, cobalt blue actions, restrained green/orange/red status accents
Text (verbatim, only these short labels where legible): "商品一覧", "要確認", "出品準備", "粗利", "承認", "差し戻す"
Constraints: information dense but accessible; clear focus state; no marketplace logos, no Mercari trademark, no hidden automation, no automatic publish action, no illegible microtext, no watermark
Avoid: oversized marketing cards, decorative illustrations, neon, glassmorphism, same layout as a mobile wizard
```

## C 挑戦「チーム・リレー」

```text
Use case: ui-mockup
Asset type: cross-platform product UI concept board
Primary request: a distinctive but practical Japanese resale operations app centered on safe handoffs between photographer, measurer, reviewer, owner, shipper, and bookkeeping staff
Scene/backdrop: premium ivory and charcoal product design presentation board with an editorial operations feel
Subject: one large desktop responsive workflow board with visually distinct lanes for capture, measurement, inspection, approval, listing-ready, and shipping; product cards show a garment photo, assignee avatar, due time, missing requirement, and approval gate; a side audit timeline shows who changed and approved what; one supporting iPhone job card shows only the assigned task with a large start button and no financial or buyer data
Style/medium: shippable modern workflow product UI, bold editorial hierarchy, original visual identity, serious about privacy and accountability
Composition/framing: 16:9 landscape board; desktop workflow board dominates; supporting iPhone card clearly separated; strong scan path and generous card spacing
Color palette: soft ivory, near-black charcoal, coral action accent, muted violet for approvals, green only for completed states
Text (verbatim, only these short labels where legible): "撮影", "採寸", "検品", "承認待ち", "発送", "履歴", "作業を開始"
Constraints: status must use words and icons, not color alone; show role-based access and human approval; no marketplace logos, no Mercari trademark, no automatic publishing, no buyer address visible, no watermark
Avoid: playful social media look, gamification points, kanban-only toy appearance, same table layout as concept B
```

## B＋C 統合案 v2「高速ワークベンチ＋安全な引き継ぎ」

- 生成方式: built-in `image_gen`
- 参照画像: `concept-b.png`（主レイアウト）、`concept-c.png`（担当・承認・監査要素）
- 出力: `concept-bc-hybrid-v2.png`

```text
Use case: ui-mockup
Asset type: high-fidelity landscape concept image for a Japanese iOS + web resale operations app
Primary request: Create a NEW hybrid dashboard concept. Use Image 1 as the main structure and visual priority: a fast, dense desktop product workbench with searchable product table and a right-side product inspector. Add the most useful team handoff elements from Image 2 without turning the whole interface into a kanban board: role-based assignee, current owner, next handoff, approval gate, due time, and a compact immutable audit timeline.
Input images: Image 1 is the primary layout/style reference; Image 2 supplies team workflow, approval, role, and audit-log patterns only.
Composition: 16:9 landscape presentation on a clean light neutral background. Main desktop screen takes about 82% of width. A smaller iPhone companion screen appears at far right for a contractor's single assigned capture/measurement task.
Desktop layout: title "商品一覧"; workflow tabs "撮影・採寸", "出品準備", "承認待ち", "発送"; searchable product table; selected-item inspector with photos, measurements, AI description candidate, evidence links, roles, permissions, approval actions, and audit timeline.
iPhone companion: one assigned capture/measurement task, guides, values, deadline, missing-item warnings, and "作業を完了".
Style: shippable Japanese SaaS UI, calm white and pale gray surfaces, navy/blue primary accents, small amber warnings, green success, subtle violet approval state, crisp grid, accessible contrast.
Constraints: preparation and approval only; human approval is mandatory; no automatic listing, automatic price reduction, password/cookie controls, Mercari logo, fake brand logo, or watermark.
```

## 収支・帳簿案 v1

- 生成方式: built-in `image_gen`
- 参照画像: `concept-bc-hybrid-v2.png`（同一プロダクトのデザイン言語）
- 出力: `concept-finance-ledger-v1.png`

```text
Use case: ui-mockup
Asset type: high-fidelity landscape concept image for the finance and bookkeeping area of the same Japanese iOS + web resale operations app
Primary request: Create a NEW "収支・帳簿" desktop dashboard for understanding profit, collecting evidence, and reviewing AI-generated bookkeeping candidates without presenting individualized tax advice or automatically filing a return.
Layout: period selector; "CSV出力"; summary cards "売上", "仕入", "販売手数料", "送料", "粗利益"; monthly profit trend; expense breakdown; "取引・仕訳候補" table; statuses "要確認", "証憑未連携", "承認済み"; right inspector with receipt, extracted facts, source links, calculation details, "AI仕訳候補", uncertainty indicator, "根拠を表示", "承認", "保留", "修正", and audit history.
Compliance note: "AIは候補を作成します。最終判断は本人または税理士が行います。"
Information design: clearly distinguish source facts, calculations, AI suggestions, and human-approved records; retain evidence links and audit records.
Constraints: no personalized tax recommendation, tax-saving claim, final tax-return preparation/submission, automated filing, Mercari logo, accounting-firm seal, decorative slogan, or watermark.
```
