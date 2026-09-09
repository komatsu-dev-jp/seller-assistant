# B採用・Slackコメント反映モック用プロンプト v2

- 作成日: 2026-08-26（JST）
- 画像生成: Codex内蔵ImageGen（外部APIキー不要）
- 見た目の基準: 各Boardのv1画像
- 正確な仕様: `mobile-ios-redesign-slack-revisions-v2.md`

## 共通指定

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese iPhone PWA design-review board, landscape 16:9
Style: realistic shippable iOS-inspired product UI; warm off-white background; dark charcoal Japanese text; cobalt-blue primary actions; mint completed states; amber review states; rounded inset cards; thin gray dividers; restrained translucency only around navigation
Composition: separate straight portrait phones, evenly spaced, no overlap, no crop; show a short Japanese screen title above every phone
Navigation: operational screens use bottom tabs in this exact order: "ホーム", "作業", "商品", "在庫", "会計"; settings and login may omit tabs
Interaction: one screen one purpose; one clear primary button; large tap areas; state uses icon plus Japanese text
Product data: fictional unbranded clothing, invoice, shelf, and product photos only
Constraints: no real account, address, company, product ID, profile image, third-party logo, marketplace logo, Apple logo, watermark, API key, automatic listing, automatic approval, browser automation, RPA, or payment prompt
```

## ロゴ・ログイン3案

```text
Primary request: create one comparison board containing exactly three distinct iPhone login concepts labeled "A", "B", and "C"
All three screens: a large original symbol mark at the top; fields "メールアドレス" and "パスワード" below; a cobalt button "ログイン"; small note "安全に作業を始めます"
A: a minimal tag-and-check symbol expressing verified resale work; rounded geometric form; navy and cobalt
B: a minimal open-box-and-shelf symbol expressing inventory location; rounded geometric form; navy and mint
C: a minimal camera-frame-and-garment symbol expressing inspection and photography; rounded geometric form; navy and amber accent
Constraints: symbol-only temporary logos; no invented service name; three genuinely different silhouettes, not color variants; flat vector-friendly marks; no gradients, 3D, existing logos, or trademarks
```

## Board 02 v2 — 卸仕入れ・保管準備

```text
Input image: Board 02 v1 is the visual and layout reference. Keep five phones and the same overall hierarchy; change the sourcing flow only.
Board heading: "B採用｜修正版 2/9　卸仕入れ・保管準備"
07 "仕入れ書類": two large choices; selected "請求書を撮る" with note "卸仕入れ"; secondary "レシートを撮る" with note "店舗で購入"; primary "請求書を撮る".
08 "請求書を撮る": camera frame for a fictional Japanese wholesale invoice with multiple rows; guidance "書類全体を枠に合わせる"; primary "写真を使う".
09 "読み取り確認": invoice thumbnail and editable rows "仕入先", "請求日", "合計", plus a clear badge "読み取り候補・人が確認"; primary "商品行を確認".
10 "商品行を確認": three fictional line-item cards with "商品名", "数量", "単価" and edit icons; primary "確認した内容を保存".
11 "在庫番号と保管場所": next-step cards "在庫番号を作る" and "保管場所を選ぶ"; generic location thumbnail; primary "保管準備へ進む".
```

## Board 03 v2 — 選べる商品確認・格納

```text
Input image: Board 03 v1 is the visual and layout reference. Keep five phones and the same iOS work-card hierarchy.
Board heading: "B採用｜修正版 3/9　選べる商品確認・格納"
12 "商品の確認方法": three large choices "ラベルを読む", "番号を入力", "今回は使わない"; helper "中古品などラベルがない時も進めます"; primary "この方法で進む".
13 "商品を確認": show manual inventory number and a fictional shirt photo; status "番号と写真を人が確認"; primary "この商品で進む".
14 "棚を確認": location photo and hierarchy "作業部屋・棚A・2段目・箱3"; primary "この棚にする".
15 "格納確認": cards "商品" and "保管場所", green "確認済み", human-check note; primary "この棚に格納".
16 "次は検品": card "使わない工程は表示しません" and short summary "商品ラベル：省略済み"; primary "検品を始める".
```

## 作業工程設定

```text
Primary request: create one supplemental comparison board with exactly five iPhone settings screens showing a simple customizable workflow
Board heading: "B採用｜追加　作業工程を自分に合わせる"
1 "作業工程設定": segmented choice "1人" selected and "チーム"; cards "仕入れ", "在庫", "発送"; primary "設定を始める".
2 "仕入れ書類": three choices "請求書を主に使う" selected, "レシートを主に使う", "毎回選ぶ"; primary "この設定にする".
3 "商品の読み取り": choices "使う", "必要な時だけ" selected, "使わない"; helper "ラベルがない中古品は番号と写真で確認"; primary "この設定にする".
4 "梱包写真": toggle-like choices "使う" and "使わない" selected; helper "1人運用では省略できます"; primary "この設定にする".
5 "表示する工程": vertical preview "請求書 → 在庫番号 → 保管場所 → 検品 → 撮影 → 採寸 → 発送"; muted chips "商品ラベルは必要な時だけ", "梱包写真は非表示"; note "進行中の作業は変更しません"; primary "設定を保存".
Constraints: do not allow hiding human confirmation, product-location match, or shipping confirmation
```

## Board 06 v2 — タグ読取・写真受け渡し

```text
Input image: Board 06 v1 is the visual and layout reference. Keep five phones and the same hierarchy, but show tag OCR and the safe manual photo-edit handoff.
Board heading: "B採用｜修正版 6/9　タグ確認・写真を整える"
29 "タグを読み取る": camera frame with a fictional text care tag; primary "タグを撮る".
30 "文字の候補": editable rows "ブランド名", "サイズ", "色", "素材"; badge "文字の候補・人が確認"; primary "確認した内容を保存".
31 "ブランドマーク": fictional non-text emblem photo, two choices "画像からの候補" and "手入力"; badge "自動確定しません"; primary "ブランドを確認".
32 "写真を整える": four-step cards "ZIPを書き出す", "人がPhotoroomで編集", "加工済みZIPを戻す", "原本と比較"; note "Photoroomなしでも進めます"; primary "加工用ZIPを書き出す".
33 "原本と比較": side-by-side fictional shirt thumbnails "原本" and "加工後"; checklist "輪郭", "色", "ロゴ", "タグ", "汚れ・傷"; amber "人が確認"; primary "確認して承認".
Constraints: Photoroom is plain text only, no Photoroom logo; do not show automatic browser control or official API connection
```

## Board 07 v2 — 梱包写真を省略した1人用発送

```text
Input image: Board 07 v1 is the visual and layout reference. Keep five phones and the same hierarchy; show the solo workflow where packaging photo is hidden.
Board heading: "B採用｜修正版 7/9　1人用の注文・発送・棚卸し"
34 "注文入力": fields "注文番号", "販売金額", "注文日" and human-check badge; primary "注文を保存".
35 "商品を取り出す": product and shelf checks, location photo, green "一致"; primary "取り出しを完了".
36 "発送内容を確認": rows "商品", "配送方法", "発送日"; small setting chip "梱包写真：使わない"; note "必要な時は設定から追加できます"; primary "発送内容を確認".
37 "発送完了": rows "配送方法", "発送日時", "担当", green "確認済み"; primary "発送を記録".
38 "棚卸しを始める": location card, photo and "確認する商品 12点"; primary "棚卸しを始める".
```

## Board 10 v2 — スーツ・セットアップ追加

```text
Input image: Board 10 v1 is the visual and layout reference. Create exactly six phones showing only the changed category coverage at a readable scale.
Board heading: "B採用｜追加　スーツ・セットアップ撮影ガイド"
Phones 1-3 are "スーツ": 1 "構成品" with "上着 1点" and "パンツ 1点"; 2 "上着を撮る" checklist "正面", "背面", "襟・ラペル", "袖口", "裏地", "ブランド・サイズ", "気になる箇所"; 3 "パンツを撮る" checklist "正面", "背面", "ウエスト", "留め具", "裾", "品質表示", "気になる箇所".
Phones 4-6 are "セットアップ": 4 "構成品" with "トップス 1点" and "ボトムス 1点" and helper "組み合わせを一組で確認"; 5 "トップスを撮る" category-aware checklist; 6 "ボトムスを撮る" category-aware checklist and a final row "不足 0点".
Each phone has a blue next-photo action and the stable bottom tabs. Use fictional unbranded navy garments.
```
