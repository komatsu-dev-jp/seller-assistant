# PC版Web・全画面モック生成プロンプト v1

- 作成日: 2026-08-26（JST）
- Use case: `ui-mockup`
- 出力: 16:9横長、各ボードに正確に4つのPC画面、2×2配置
- 参照仕様: `pc-web-redesign-screen-map-v1.md`

## 全ボード共通

```text
Use case: ui-mockup
Asset type: stakeholder-review-ready high-fidelity Japanese desktop Web application board
Primary request: Create exactly four coordinated production-quality desktop application screens in a clean 2×2 grid for a Japanese resale-operations Web app. This is an operational product UI, not concept art, not a marketing page, and not a mobile mockup.
Style/medium: friendly iOS-inspired Web design; white and very light warm-gray surfaces; navy text; cobalt-blue primary buttons; green confirmed states; amber review states; red only for blocked actions; restrained rounded cards; thin borders; generous whitespace; readable Japanese sans-serif typography.
Composition/framing: 16:9 landscape board; exactly four equal desktop screens; each screen has the same slim left navigation and top bar; page titles, main numbers, status labels, and primary actions must be readable at board scale.
Navigation text (verbatim): "ホーム", "作業", "仕入れ", "商品", "注文・発送", "在庫", "会計", "メンバー", "設定".
Interaction rules: show lists and details together where useful; one clear primary action per screen; use question-mark help for unavoidable terms; visually distinguish current facts, estimates, proposals, blocked states, and completed states.
Constraints: fictional demo data only; no real addresses, accounts, URLs, product IDs, logos, or personal information; no watermark; no dark mode; no neon; no mobile device frames; no illegible filler text; no garbled Japanese; no automatic marketplace operation; no scraping; no RPA; no private API; no automatic listing, price change, reply, shipment confirmation, accounting decision, or external upload; no implication that future features are implemented.
Avoid these as main UI labels: "OCR", "ロケーション", "mapping", "profile", "プレフライト", "憑依".
Output intent: a coherent, easy-to-understand PC Web approval board that matches the already approved mobile wording and safety boundaries.
```

## PC01 `pc-web-redesign-board-01-home-v1.png`

```text
Exactly four screens labeled 01–04.
01 "ログイン": selected camera-frame-and-shirt symbol, fields "メールアドレス" and "パスワード", primary "ログイン", short note "PC内の業務データへ安全に入ります".
02 "ホーム": cards "今日の確認", "続きの作業", "在庫中", "売上の事実"; alerts "原価未確認", "送料未確認", "90日超在庫", "承認待ち"; primary "未解決を確認".
03 "今日の作業": practical table with work, product, assignee, deadline, remaining items, status; right detail panel; primary "この作業を開く".
04 "通知・見られる範囲": notification list, role summary, hidden-information explanation, offline/send-waiting status; primary "送信待ちを確認".
```

## PC02 `pc-web-redesign-board-02-purchase-box-v1.png`

```text
Exactly four screens labeled 05–08.
05 "仕入れ資料": tabs "請求書ファイル" and "店舗レシート"; PDF/image file selection; receipt photo option; original preview beside "写真から読み取った内容"; candidate fields and human confirmation; note "メール添付は一度ファイルに保存"; primary "内容を確認して保存".
06 "卸箱を数える": item count starts "まだ不明"; very large plus-one, plus-ten, undo controls; running count history; no prefilled total; primary "数え終わった".
07 "1点ずつ簡単登録": short handwritten-friendly item number such as "0128"; quick photo; brand; feature; sellable yes/no/review; expected price band; progress 18/48; primary "保存して次の商品".
08 "詳しく調べる商品": cards for high-price candidate and needs-review; reason, quick photo, item number, priority; normal items remain simple-registration complete; primary "詳しく調べる".
```

## PC03 `pc-web-redesign-board-03-putaway-v1.png`

```text
Exactly four screens labeled 09–12.
09 "商品番号と在庫番号": explain product information versus one physical item; show short item number and checked inventory number; status "発行前" to "発行済み"; primary "在庫番号を発行".
10 "在庫ラベル": two choices "手書き（無料・標準）" and "印刷（任意）"; full checked number; A4 print preview; OS print dialog handoff; reissue reason/history; primary "この方法を使う".
11 "保管場所を選ぶ": room/shelf/level/box tree, room photo, shelf photo, exact-position photo, capacity, current count; use title "保管場所", never "ロケーション"; primary "この場所にする".
12 "格納を確認": product label result and place label result side by side, matching photo, human checklist, no automatic overwrite; primary "この場所に格納".
```

## PC04 `pc-web-redesign-board-04-inspection-v1.png`

```text
Exactly four screens labeled 13–16.
13 "商品の種類": cards for shirt, knit, outerwear, pants/skirt, dress, bag; show that inspection/photo/measurement items change by type; primary "この種類で進む".
14 "検品項目": clear rows "状態", "使用感", "汚れ", "傷", "ほつれ" with states "未確認", "問題なしを確認", "気になる点あり"; never turn unchecked into no-problem; primary "次の項目へ".
15 "気になる箇所": large garment photo with numbered markers; selected marker detail for place, type, severity, evidence photo, memo; human confirmation; primary "この内容を保存".
16 "検品まとめ": complete and missing checklist, evidence thumbnails, unresolved row in amber, summary notes; primary disabled until missing items resolved, then "検品を完了".
```

## PC05 `pc-web-redesign-board-05-photo-measure-v1.png`

```text
Exactly four screens labeled 17–20.
17 "商品の写真": gallery grouped "正面", "背面", "ブランドタグ", "品質表示", "気になる箇所"; badges original/edited/approved; user path "商品 > 0128 > 写真"; note "原本はPC内の非公開保管"; primary "写真を追加".
18 "写真の編集方法": role-based recipe cards; front/back white background, center, padding; front optional brand/size text; tags/flaws orientation and brightness only; three choices "自作画像編集（準備中）", "編集用セットを作る", "編集せず進む"; primary "編集用セットを作る".
19 "加工後を確認": five-of-five role matching, original versus edited comparison slider, mismatch warning, reimport history; human approval; primary "確認して採用".
20 "採寸": category-specific measurement list, visual measurement line, unit, previous value, evidence photo, remeasure reason; separate flat width and circumference; primary "確認した値を保存".
```

## PC06 `pc-web-redesign-board-06-product-listing-v1.png`

```text
Exactly four screens labeled 21–24.
21 "タグの文字": original brand/care-label photos beside candidates for brand, size, color, material; confidence shown only as reference; edit controls; primary "確認した内容を保存".
22 "商品まとめ": inspection, photos, measurements, tags in four clear cards; missing and confirmed states; primary "商品説明の候補を作る".
23 "商品説明の候補": editable Japanese description candidate; evidence links; unresolved items; explicit label "候補・人が確認"; primary "コピーする内容を確認".
24 "公式画面へ移る": download photos, copy text, open official page manually; after publishing, one-time fields sales destination, product ID, product URL, last human-verified date; no fake URL, no automatic publishing; primary "公式画面を開く".
```

## PC07 `pc-web-redesign-board-07-sales-support-v1.png`

```text
Exactly four screens labeled 25–28.
25 "保存した商品ページ": rows for destination, product ID, human-entered URL, last checked date, current app status; button "商品ページを開く"; note "リンク先を自動で読み取りません".
26 "販売状況を入力": fields listing days, current price, views, likes, price requests; values are manually copied from official page; record date and source; primary "入力内容を保存".
27 "価格候補を比べる": compare 5%, 10%, 15% candidates with new price, estimated gross margin, minimum price relationship, own sales history, season/event reference with source and checked date; no single correct choice; primary "この候補をコピー".
28 "返信文と本人操作": editable reply templates, price-change text, copy buttons, official page button, checkbox for human-applied result; no auto reply/discount/sale; primary "文章をコピー".
```

## PC08 `pc-web-redesign-board-08-orders-shipping-v1.png`

```text
Exactly four screens labeled 29–32.
29 "注文を記録": separate fields app order number, sales destination, destination transaction ID, optional buyer display name, sales amount; do not store address when anonymous delivery makes it unnecessary; primary "注文を保存".
30 "商品を取り出す": assigned order only, product label then place label, location photo, match result; cost/profit/private details hidden from worker; primary "取り出しを完了".
31 "梱包写真": product and package evidence photo, checklist, captured time, reviewer; optional skip only when workflow setting allows; primary "この写真を使う".
32 "配送方法と発送": destination-specific enabled methods, human-checked official date, editable catalog, selected historical fee frozen for order, shipment date/time; no automatic external lookup; primary "発送を記録".
```

## PC09 `pc-web-redesign-board-09-inventory-v1.png`

```text
Exactly four screens labeled 33–36.
33 "在庫と保管場所": place tree, room/shelf/exact-position photos, inventory-number table, assignee, movement history, capacity; primary "保管場所を開く".
34 "棚卸し": fixed start snapshot, selected area, scanned count, remaining count, progress, offline warning; primary "棚卸しを始める" or "作業を続ける".
35 "数が合わない商品": separate tabs "見つからない", "別の棚", "予定外に発見"; product/place reread and evidence; banner "自動で在庫数を変えません"; primary "この商品を確認".
36 "仮状態・復元・返品": one-person reversible confirmation and multi-person separate confirmation explained in plain Japanese; delete never; found-item restore; return quarantine; primary actions "3秒押して仮状態にする", "在庫に戻す", "確認結果を保存".
```

## PC10 `pc-web-redesign-board-10-team-v1.png`

```text
Exactly four screens labeled 37–40.
37 "メンバー": member list, role, status, last sign-in, invite and stop; fictional short surnames only; primary "メンバーを招待".
38 "担当を割り当てる": exact product, place, photo, or order targets; start/end time; visible information preview; cost/address hidden by default; primary "この担当を割り当てる".
39 "変更を確認": before/after, evidence photo, reason, requester, approver; actions "承認", "差し戻す", "コメント".
40 "変更履歴": append-only timeline/table with who, when, target, action, before, after, approval; no delete button; primary "履歴を書き出す".
```

## PC11 `pc-web-redesign-board-11-analytics-v1.png`

```text
Exactly four screens labeled 41–44 and keep each purpose separate.
41 "箱の見込み": exact cards "実数 48着", "販売候補 39着", "見込売上 ¥138,000〜169,000", "仕入額 ¥75,000", "見込手数料・送料 ¥32,000〜41,000", "見込粗利 ¥31,000〜53,000", "損益分岐 24着"; label as estimate; primary "販売後の実績を見る".
42 "販売後の実績": exact cards "販売済み 31 / 48着", "実売上 ¥124,000", "実手数料・送料 ¥29,600", "仕入額 ¥75,000", "実粗利 ¥19,400", "未販売 17着"; compare estimate and actual without merging them; primary "月別KPIを見る".
43 "月別KPI": 30-day sales rate, monthly sales estimate, monthly gross-margin estimate, remaining inventory; trend and period; do not call tax/accounting profit; primary "対象月を確認".
44 "仕入先・在庫の比較": supplier and purchase-month table with sample size, observation period, missing costs/shipping, inventory age, returns; note "継続・停止は人が判断"; primary "不足データを確認".
```

## PC12 `pc-web-redesign-board-12-accounting-v1.png`

```text
Exactly four screens labeled 45–48.
45 "売上の事実": sales, refund, fee, shipping, purchase cost shown separately; source and confirmation state; no tax/profit conclusion; primary "会計の基本設定へ".
46 "会計の基本設定": plain-language cards for filing method, consumption-tax handling, bookkeeping method, invoice registration; question-mark help drawer with meaning and example; only human can save; primary "内容を確認して保存".
47 "会計項目の候補": event rows sale, purchase, selling fee, shipping, packing; proposed debit/credit categories from approved rules; adopt/change and evidence; unknown/low-confidence blocked; primary "確認した項目を保存".
48 "ファイル作成・履歴": creation checklist, blocker list, read-only first rows, formats "Money Forward向け" and "汎用", manual download, manual import result, replacement/cancel history; no external API/send; primary "確認してダウンロード".
```

## PC13 `pc-web-redesign-board-13-settings-v1.png`

```text
Exactly four screens labeled 49–52.
49 "アプリの基本設定": office name, display, notifications, work-step editor, destination-specific shipping methods; plain language; primary "設定を保存".
50 "写真の保管": diagram device capture to PC private storage; distinct original, editing copy, edited image, thumbnail; permission and retention; explicit "GitHub・Slack・Notionへ自動保存しません"; primary "保存場所を確認".
51 "書き出し・バックアップ": manual CSV and ZIP export, destination folder, created date, file contents, history, restore check; no cloud auto-sync; primary "書き出し内容を確認".
52 "外部連携の状態": P0 card "外部連携なし・無料"; future optional cards all "準備中" with contract, cost, permission, commercial-use checks; no connect button that appears active; note "勝手に外部へつなぎません"; primary "条件を確認".
```
