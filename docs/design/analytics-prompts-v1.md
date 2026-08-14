# 月間収支・仕入先分析 UIモック生成プロンプト v1

- 生成方式: built-in ImageGen
- スタイル参照: `docs/design/concept-bc-hybrid-v2.png`（スタイル、配色、密度、UI言語のみ。内容は複製しない）
- 出力: 16:9 PNG 2点
- 共通方針: B+Cハイブリッド、運用分析と会計・税務を明確に分離、架空データのみ

## 1. `mobile-09-monthly-supplier-analytics-v1.png`

```text
Use case: ui-mockup
Asset type: 16:9 high-definition product design board containing exactly six coordinated Japanese iPhone app screens
Input images: Image 1 is a style reference only. Use its crisp Japanese operations-console design language, white and pale-gray surfaces, deep navy typography, blue primary actions, amber warning states, green completion states, subtle borders, compact status chips, dense but readable information, and disciplined spacing. Do not edit Image 1 and do not copy its products, people, identifiers, or exact layout.
Primary request: Create a polished, implementation-ready mobile analytics board for a Japanese secondhand-clothing and flea-market resale operations app. Show exactly six distinct iPhone screens, each with one clear purpose, covering monthly operating results and supplier performance. All data must be fictional. Make key Japanese labels legible at board-view scale.
Scene/backdrop: pale-gray 16:9 product-design canvas with six realistic unbranded iPhone frames arranged in one clean horizontal row, equal visual weight, generous outer margin, no scenery
Style/medium: high-fidelity production mobile UI, not concept art, not a wireframe; Japanese sans-serif typography; accessible contrast; compact cards, tables, bars, segmented controls, and status chips
Composition/framing: exact 16:9 landscape board with exactly six portrait phone screens. Keep every phone fully visible and avoid overlap. One purpose per screen. Use large titles and short labels, never tiny filler paragraphs.
Color palette: white, pale gray, deep navy, royal blue, amber, and green; restrained red only for refunds or reconciliation differences

Screen 1 — title `月間収支`: period selector `2026年7月`; compact waterfall from top to bottom with exact sequence `売上` → `返金` → `商品原価` → `商品粗利益` → `販売手数料` → `送料` → `取引貢献利益`. Use fictional yen values and clear plus/minus signs. Add status chip `締め前`.
Screen 2 — title `入金・調整`: show a separate card `入金額` that is visually independent from sales and explicitly says `売上とは別集計`. Add card `過去月返品調整` with a fictional negative yen amount, a short month label, and a `要確認` amber chip. Do not imply that deposits equal accounting sales.
Screen 3 — title `仕入先`: ranked supplier list with generic names `仕入先A`, `仕入先B`, `仕入先C`. Each row must show compact readable values for `平均仕入単価`, `平均販売単価`, `販売率`, `売切中央値`, `商品粗利率`. Include sample-size label such as `n=42`.
Screen 4 — title `仕入先詳細`: selected supplier `仕入先A`; clear cohort cards `30日販売率`, `60日販売率`, `90日販売率`; small inventory-age distribution labeled `0–30日`, `31–60日`, `61–90日`, `91日以上`; include `仕入月コホート` and a reference date.
Screen 5 — title `在庫年齢`: inventory age bands with counts, cost values and amber emphasis on aged stock; show `未販売在庫` as inventory, never as an expense or realized loss. Include a filter `仕入先別` and a compact note `販売済み原価と分離`.
Screen 6 — title `データ確認`: demonstrate missing-data states using the exact labels `—`, `原価未配賦`, `送料未確定`, `n<10 参考値`. Show `データ充足率 86%`, `最終同期 7/31 23:40`, and one neutral action `不足データを確認`.

Fixed safety note: Render this exact Japanese sentence clearly and prominently as a persistent footer or banner on all six screens, or as one large shared banner immediately below the phones: `運用分析の参考値。会計上の利益・所得・税額ではありません`. It must not be tiny and must be fully readable.
Text (verbatim): `月間収支`, `売上`, `返金`, `商品原価`, `商品粗利益`, `販売手数料`, `送料`, `取引貢献利益`, `入金額`, `売上とは別集計`, `過去月返品調整`, `仕入先`, `平均仕入単価`, `平均販売単価`, `販売率`, `売切中央値`, `商品粗利率`, `仕入先詳細`, `30日販売率`, `60日販売率`, `90日販売率`, `在庫年齢`, `未販売在庫`, `—`, `原価未配賦`, `送料未確定`, `n<10 参考値`, `運用分析の参考値。会計上の利益・所得・税額ではありません`.
Constraints: exactly six iPhone screens; exactly one purpose per phone; clear Japanese labels; all money and percentages are obviously fictional demo values; no other-company logos, no marketplace logos, no real marketplace names, no real people, no real IDs, no tax advice, no filing-complete claim, no statement that this is accounting profit; no watermark.
Avoid: fewer or more than six phones, tablet or desktop panels, overlapping phones, illegible microtext, random English, gibberish Japanese, giant decorative charts, dark mode, neon gradients, stock-trading aesthetics, tax-return completion, profit guarantees, supplier stop commands, marketplace names or logos.
Output intent: a stakeholder-review-ready 16:9 mobile analytics design board whose KPI hierarchy, missing-data states, separate deposit card, past-month return adjustment, supplier cohort analysis, and safety boundary are immediately understandable.
```

## 2. `web-07-monthly-supplier-analytics-v1.png`

```text
Use case: ui-mockup
Asset type: 16:9 high-definition Web product design board containing exactly four coordinated Japanese desktop application screens
Input images: Image 1 is a style reference only. Use its crisp B+C hybrid operations-console aesthetics: white and pale-gray surfaces, deep navy typography, blue primary actions, amber warnings, green completion, thin borders, dense but legible data tables, right-side detail drawers, status chips, and precise spacing. Do not edit Image 1 and do not copy its products, people, identifiers, or exact layout.
Primary request: Create a polished production-ready PC analytics design board for monthly operating results, supplier comparison, purchase-month cohorts, and operations-to-accounting reconciliation in a Japanese secondhand-clothing resale SaaS. Show exactly four distinct desktop screens, one purpose per screen. Use fictional values only and make the difference between operational analytics and accounting figures unmistakable.
Scene/backdrop: light neutral 16:9 product-design canvas with four clearly separated browser-window panels in a disciplined 2×2 grid; no marketing scenery
Style/medium: realistic high-fidelity Web application UI, not concept art and not a wireframe; Japanese sans-serif typography; accessible contrast; practical tables, charts, filters, and drawers
Composition/framing: exact 16:9 landscape board. Exactly four coordinated desktop screens. Keep titles and primary KPI labels readable at board-view scale. Maintain a consistent navigation rail, command bar, filter language, and status-chip system.
Color palette: white, pale gray, deep navy, royal blue, amber, and green; restrained red only for refunds and unreconciled differences

Screen 1 — title `月間収支`: large operational waterfall with exact sequence `売上` → `返金` → `商品原価` → `商品粗利益` → `販売手数料` → `送料` → `取引貢献利益`, using fictional yen values. Header controls `税込`, `税抜`, `JST 2026/07/01 00:00–2026/08/01 00:00`, and closing chip `締め前`. Add a separate small card `入金額（売上とは別）` and a row `過去月返品調整`.
Screen 2 — title `仕入先比較`: dense readable table with generic suppliers and columns `母数 n`, `平均仕入単価`, `平均販売単価`, `販売率`, `在庫回転率`, `在庫日数`, `売切中央値`, `返品率`, `値下げ率`, `期末在庫原価`. Include data-quality chips such as `原価未配賦`, `送料未確定`, `n<10 参考値`, and a sort/filter command bar.
Screen 3 — title `仕入月コホート`: selected supplier with cohort selector and clear columns/cards for `30日販売率`, `60日販売率`, `90日販売率`; inventory-age visualization `0–30日`, `31–60日`, `61–90日`, `91日以上`; show `未販売在庫` separately. Include a neutral caution card with exact wording `季節・商品構成・観測期間を確認`. Add an AI insight area using only the labels `観測上の傾向` and `確認候補`, with tentative language such as `90日販売率に差が見られます` and `商品構成を確認`. Never recommend stopping a supplier.
Screen 4 — title `運用→会計 照合`: reconciliation drawer or workbench that starts with `運用集計` and bridges to `会計帳簿残高` using explicit adjustment rows `期間差`, `返金差`, `未配賦`, `在庫調整`, `手入力`; show columns `参照ID`, `件数`, `金額`, `状態`; show final `差額` with a fictional amount and buttons `明細を確認`, `照合メモを追加`. Add labels `未照合`, `確認済み`, `最終同期`. Do not say accounting is complete.

Fixed safety note: Render the exact sentence `運用分析の参考値。会計上の利益・所得・税額ではありません` as a clearly readable persistent banner on the analytics screens. Add a smaller sentence `この指標だけで仕入先の継続・停止を決めず、件数・観測期間・季節・商品構成を確認してください`.
Allowed AI language only: `観測上の傾向`, `確認候補`, `差が見られます`, `確認してください`. AI must be visually advisory and non-authoritative.
Forbidden text and meaning: no `停止すべき`, no `仕入を停止`, no `必ず儲かる`, no `申告完了`, no `確定申告が完成`, no individualized tax advice, no tax amount recommendation, no claim that reconciliation equals filed accounts.
Text (verbatim): `月間収支`, `税込`, `税抜`, `締め前`, `売上`, `返金`, `商品原価`, `商品粗利益`, `販売手数料`, `送料`, `取引貢献利益`, `入金額（売上とは別）`, `過去月返品調整`, `仕入先比較`, `母数 n`, `平均仕入単価`, `平均販売単価`, `販売率`, `在庫回転率`, `在庫日数`, `売切中央値`, `返品率`, `値下げ率`, `期末在庫原価`, `仕入月コホート`, `30日販売率`, `60日販売率`, `90日販売率`, `未販売在庫`, `季節・商品構成・観測期間を確認`, `観測上の傾向`, `確認候補`, `運用→会計 照合`, `運用集計`, `会計帳簿残高`, `期間差`, `返金差`, `未配賦`, `在庫調整`, `手入力`, `参照ID`, `差額`, `運用分析の参考値。会計上の利益・所得・税額ではありません`.
Constraints: exactly four coherent desktop screens; one purpose per screen; clear Japanese labels; fictional demo values only; visually separate operational KPIs, deposits, inventory, and accounting reconciliation; no other-company logos, no marketplace logos, no real marketplace names, no real people, no tax advice, no supplier-stop command, no filing-complete state, no profit guarantee, no watermark, no mobile phone mockup.
Avoid: fewer or more than four screens, illegible microtext, random English, gibberish Japanese, dark mode, neon gradients, stock-trading dashboards, tax-return forms, red buy/sell signals, AI decision commands, marketplace names or logos, decorative charts without operational meaning.
Output intent: a stakeholder-review-ready 16:9 Web analytics board that clearly communicates monthly operational economics, supplier cohort quality, missing-data confidence, and a traceable but non-conclusive operations-to-accounting reconciliation.
```
