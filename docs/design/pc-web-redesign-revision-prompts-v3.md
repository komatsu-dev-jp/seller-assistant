# PC版Web・修正版モック生成プロンプト v3

- 作成日: 2026-08-27（JST）
- Use case: `ui-mockup`
- 共通参照: `pc-web-redesign-prompts-v1.md`
- 修正仕様: `pc-web-redesign-slack-revisions-v3.md`

## 共通の編集条件

```text
Input image: the matching v2 PC board is the edit target.
Preserve exactly four screens, their 2×2 positions, screen numbers, left navigation, canvas size, colors, typography, spacing, and every unaffected screen purpose.
Change only the items listed for that board. Keep fictional data and plain, readable Japanese.
Do not add external automatic connections, automatic marketplace data collection, scraping, RPA, private APIs, automatic login, Cookie sharing, real URLs, real accounts, personal information, paid plans, or claims that the feature is already implemented.
All external-page and Codex actions are user initiated. AI and search results are candidates; the person confirms the expected selling price.
```

## PC02 v3

```text
Image 1 is the PC02 v2 edit target.
Keep screens 05, 06, and 08 visually and semantically unchanged.
On screen 07 only, preserve progress, short product number, smartphone photo, brand/category fields, sellability choice, and save action. Redesign the expected selling-price area into a compact panel titled "販売価格を調べる".
Show editable keyword chips such as "デモブランド", "レザー", "ハンドバッグ", "ブラック" and helper text "ブランド・袖・生地・形などをまとめます".
Add three clear actions: "メルカリで検索を開く", "検索語をコピー", and "Codex用の質問文をコピー".
Show the exact note "押した時だけ外部画面を開きます。自動取得・自動送信はしません".
Keep a human-confirmed expected-price field labeled "予想価格（人が確認）" with fictional value "¥8,000" and a small reference range "参考 ¥5,000〜¥15,000".
Make it clear that the app prepares words and a question, but never automatically sends them to Codex or reads Mercari results.
No API badge, no automatic research claim, no autonomous AI action.
```

## PC03 v3

```text
Image 1 is the PC03 v2 edit target.
Keep the 2×2 board, screen numbers, left navigation, screen 11 location photos and capacity, and the overall white/blue/green desktop UI.
Screen 09: show a simple two-option selector with "中古（1点もの・標準）" selected and "新品（同じ商品を複数）" unselected. Replace the separate visible product-number and inventory-number explanation with the heading "中古は商品番号＝在庫番号" and plain helper text "登録した1点を、同じ短い番号で管理します". Show one prominent short number "0123". Add a small note "新品を選んだ時だけ、現物ごとの番号を分けられます".
Screen 10: keep the A4 24-label sheet, but make every small label a different registered used item number. Add a visible summary "登録商品 24点 / ラベル 24枚 / 同じ番号なし". Show a selected-item table with different short numbers such as 0123, 0124, 0125. State "中古は登録商品ごとに1枚". Primary button text is "登録した24商品を1枚ずつ印刷". Keep "手書き（無料・標準）" selected and printing optional.
Screen 12: replace the long inventory number with the same short user-facing number "0123" and label it "商品・在庫番号". Keep the storage-place double check and human confirmation unchanged.
Do not duplicate one used-item number across multiple labels. Do not remove the new-goods option.
```

## PC08 v3

```text
Image 1 is the PC08 v2 edit target.
Keep screens 29 and 30 unchanged except for any tiny continuity label that is necessary. Preserve the temporary order number and optional later transaction ID.
Redesign screen 31 from a universally expected packing-photo step into "発送前の写真" with a clear workflow setting selector. Show three options: "高額商品だけ撮る（おすすめ）" selected, "すべて撮る", and "使わない". Show editable helper "高額の目安 ¥30,000（設定で変更できます）" as fictional UI data.
For this fictional order show a badge "高額商品に該当" and the explanation "すり替え・内容違いの確認用に、発送前の状態を残します". Keep two example photos for the product and packed box, human review checklist, and a primary action "この写真を使う". Add secondary action "今回は使わない" and note "金額が未入力でも、梱包を止めずに選べます".
Screen 32: preserve manual delivery method and shipping record. Add a small confirmation row "発送前の写真 2枚・確認済み" for this high-value example.
Exact safety note: "写真は非公開で保存。外部へ自動送信しません".
Do not make photos mandatory for every solo-operated order. Do not automatically decide shipment from the photos.
```
