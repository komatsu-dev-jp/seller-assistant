# PC版Web・修正版モック生成プロンプト v4

- 作成日: 2026-08-27（JST）
- Use case: `ui-mockup`
- 編集元: `pc-web-redesign-board-03-putaway-v3.png`
- 修正仕様: `pc-web-redesign-slack-revisions-v4.md`

## PC03 v4

```text
Edit Image 1, the approved PC03 v3 Japanese desktop web-app board. Preserve the exact 1536×1024 canvas, four-screen 2×2 composition, screen numbers 09–12, left navigation, white/blue/green iOS-inspired visual system, typography, spacing, fictional data, and every unaffected element. This is a narrow correction, not a redesign.

Screen 09: keep the used one-of-a-kind option selected, the new-goods option, heading "中古は商品番号＝在庫番号", short number "0123", and all existing helper text. Directly below 0123 add a clean compact black barcode made of vertical bars. Add plain Japanese helper text "スマホで読み取ると、商品と保管場所を開けます". Do not claim that scanning confirms a stock movement.

Screen 10: keep the A4 24-label sheet, print settings, summary "登録商品 24点 / ラベル 24枚 / 同じ番号なし", selected-item table, handwritten free-standard option, and primary print button. Restore a small readable barcode on every one of the 24 labels. Each label must contain one distinct short number and one corresponding barcode; do not duplicate a used-item number. Make the barcode pattern visibly vary across labels while keeping the sheet tidy and printable. Keep the exact meaning "中古は登録商品ごとに1枚".

Screen 11: make no changes.

Screen 12: keep "商品・在庫番号 0123", storage-place double check, photo, checklist, and human confirmation unchanged. Add the same compact barcode representation associated with 0123 inside the item-number panel. Add a small action or helper "スマホで読み取って商品を開く" only if it fits without moving unrelated content.

Add one short safety note where space permits: "読取は商品検索だけ。移動は確認後に保存します". The app uses the phone camera locally within the PWA; do not show an external API, external service, automatic login, scraping, autonomous action, or automatic stock confirmation. Printing and scanning remain optional; handwritten labels remain free and standard.

All Japanese text must be legible. Do not alter screens 09–12 beyond these barcode and scan-entry additions.
```
