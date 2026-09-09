# B採用＋C機能・全49ページ高精度モック用プロンプト v1

- 作成日: 2026-08-25（JST）
- 画像生成: Codex内蔵ImageGen
- 参照画像: `mobile-ios-redesign-concept-b-task-cards-v1.png`（見た目の基準だけに使用）
- 構成: 9枚の本編でID 01〜49を1回ずつ表示し、10枚目で画面20のジャンル別状態を表示する

## 全画像の共通指定

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese iPhone PWA specification board, landscape 16:9
Input image: use the referenced B案 image only as the visual-language reference; preserve its practical iOS task-card hierarchy, not its exact screen content
Style: realistic shippable product UI, warm off-white background, dark charcoal Japanese text, cobalt-blue primary actions, mint completed states, amber review states, restrained translucency only around navigation, generous spacing, rounded inset cards, thin gray dividers
Composition: place the requested number of separate portrait phone screens evenly across one landscape board; no overlap or cropping; show each screen ID and title above its phone
Navigation: operational screens use the same bottom tabs in this exact order: "ホーム", "作業", "商品", "在庫", "会計"; "作業を続ける" is a separate resume control immediately above the tabs and is not a tab
Interaction: one clear primary button per screen, large 44pt-like tap targets, state labels use icon plus Japanese text, one screen one purpose
Product data: fictional unbranded navy clothing or black bag only; no real account, address, product ID, profile image, listing image, logo, or trademark
Text: render the specified Japanese labels verbatim; no English headings, internal state names, SKU, OCR, 証憑, mapping, profile, run, session, random microtext, watermark, Apple logo, or Mercari logo
```

## Board 01 — 入口・作業キュー（ID 01〜06）

```text
Board heading: "B採用｜全49ページ 1/9　入口・作業キュー"
Create exactly six phones.
01 "ログイン": fields "メールアドレス", "パスワード"; primary "ログイン"; short note "安全に作業を始めます". No bottom tabs.
02 "はじめの設定": simple cards "事業所名", "使う機能"; primary "設定を保存". No bottom tabs.
03 "メンバーと担当": role cards "オーナー", "検品・撮影", "発送", "会計"; permission note "必要な情報だけを表示"; primary "この担当で招待". No bottom tabs.
04 "ホーム": card "今日やること 5件", progress rows "検品", "撮影", "採寸"; primary "作業を続ける"; stable tabs.
05 "作業一覧": task cards with counts "仕入れ 2件", "検品 3件", "撮影 2件", "採寸 4件"; primary "この作業を開く"; stable tabs.
06 "送信待ち": status cards "端末に保存済み", "送信待ち 2件", "最後に送れた時刻"; primary "もう一度送る"; stable tabs.
```

## Board 02 — 仕入れ・保管準備（ID 07〜11）

```text
Board heading: "B採用｜全49ページ 2/9　仕入れ・保管準備"
Create exactly five phones, all with stable bottom tabs.
07 "レシート撮影": camera frame for a fictional receipt, guidance "四隅を枠に合わせる"; primary "写真を使う".
08 "読み取り確認": receipt thumbnail and editable rows "店名", "日付", "合計" with label "写真から読み取った内容"; primary "内容を確認した".
09 "仕入れ内容": rows "商品名", "購入日", "仕入れ代" and human-confirmed check; primary "商品番号を作る".
10 "在庫番号": large code "AP-0825-00421", printable label preview, status "現物1点の番号"; primary "保管場所を選ぶ".
11 "保管場所": hierarchy cards "作業部屋 → 棚A → 2段目 → 箱3", a generic location photo thumbnail, primary "この場所にする".
```

## Board 03 — 格納・検品開始（ID 12〜16）

```text
Board heading: "B採用｜全49ページ 3/9　格納・検品開始"
Create exactly five phones, all with stable bottom tabs.
12 "商品を読み取る": large camera scanning frame, card "商品番号 AP-0825-00421", status "商品を確認済み"; primary "商品を確認".
13 "棚を読み取る": large shelf-label scanning frame, location photo and "棚A・2段目・箱3"; primary "棚を確認".
14 "格納確認": side-by-side cards "商品" and "保管場所", green labels "一致", human-check sentence; primary "この棚に格納".
15 "商品の種類": large selectable cards "シャツ・ポロ", "ニット", "ジャケット・コート", "パンツ・スカート", "ワンピース", "バッグ"; primary "この種類で進む".
16 "検品を始める": progress card "全6項目・約3分", checklist "全体", "襟・袖", "汚れ・傷", "タグ"; primary "検品を始める".
```

## Board 04 — 検品・気になる箇所（ID 17〜22）

```text
Board heading: "B採用｜全49ページ 4/9　検品・気になる箇所"
Create exactly six phones, all with stable bottom tabs.
17 "状態チェック": three large choices "未確認", "問題なしを確認", "気になる点あり"; current progress "2/6"; primary "次の項目へ".
18 "汚れ・傷": large fictional navy shirt photo with two numbered cobalt/amber tap markers; instruction "気になる箇所をタップ"; bottom detail card "場所　左袖", "種類　小さな汚れ", "程度　小さい", "写真", "メモ"; primary "この内容を保存".
19 "検品まとめ": rows "問題なし 4", "気になる点 2件", "未確認 0" and two marker thumbnails; primary "検品を完了".
20 "撮る写真一覧": shirt checklist "正面", "背面", "ブランド・サイズ", "品質表示", "襟元", "袖口", "裾", "気になる箇所" with remaining count; primary "正面を撮る".
21 "撮影ガイド": camera frame around a navy shirt, short checks "明るい場所", "全体を枠の中へ", "影を避ける"; primary "撮影".
22 "写真確認": captured image, checks "ぶれなし", "明るさよし", "切れなし"; secondary text "撮り直す"; primary "この写真を使う".
```

## Board 05 — 写真・採寸をそろえる（ID 23〜28）

```text
Board heading: "B採用｜全49ページ 5/9　写真・採寸をそろえる"
Create exactly six phones, all with stable bottom tabs.
23 "撮り直し": amber card "袖口が暗い", selected shot "袖口", guidance "明るい場所でもう一度"; primary "撮り直す".
24 "写真まとめ": thumbnail grid with labels "正面", "背面", "タグ", "品質表示", "細部", "気になる箇所"; progress "8/8"; primary "採寸へ進む".
25 "採寸の準備": flat-lay illustration of a shirt, list "肩幅", "身幅", "着丈", "袖丈", note "伸ばさず平らに置く"; primary "採寸を始める".
26 "1か所ずつ採寸": shirt with visible blue shoulder measurement line, large value "47.5 cm", help "端から端まで水平に測る"; primary "保存して次へ".
27 "採寸写真": camera view showing ruler position and measurement line, label "肩幅の写真"; primary "写真を使う".
28 "測り直し": comparison card "前回 47.5 cm", "今回 51.0 cm", amber label "差が大きい" and reason choice; primary "もう一度測る".
```

## Board 06 — 商品情報を仕上げる（ID 29〜33）

```text
Board heading: "B採用｜全49ページ 6/9　商品情報を仕上げる"
Create exactly five phones, all with stable bottom tabs.
29 "タグの文字": tag photo plus editable candidate rows "ブランド", "サイズ", "色", "素材"; badge "入力候補・人が確認"; primary "確認した内容を保存".
30 "採寸まとめ": rows "肩幅 47.5 cm", "身幅 55.0 cm", "着丈 72.0 cm", "袖丈 60.0 cm", photo checks and "未入力 0"; primary "商品をまとめる".
31 "商品まとめ": task-card summary "検品 完了", "写真 8/8", "採寸 4/4", "タグ 確認済み", "気になる点 2件"; primary "文章を作る".
32 "商品説明の候補": readable Japanese description candidate, amber row "気になる点を確認", note "アプリの提案・人が確認"; primary "コピーする内容を確認".
33 "公式画面へ移る": prepared items "写真", "商品名", "説明文", "価格候補"; safety note "自動出品は行いません。公式画面で本人が確認します"; primary "公式画面を開く".
```

## Board 07 — 注文・発送・棚卸し開始（ID 34〜38）

```text
Board heading: "B採用｜全49ページ 7/9　注文・発送・棚卸し"
Create exactly five phones, all with stable bottom tabs.
34 "注文入力": fields "注文番号", "販売金額", "注文日" and human-check badge; primary "注文を保存".
35 "商品を取り出す": progress cards "商品を確認済み", "棚を確認済み", location photo, green "一致"; primary "取り出しを完了".
36 "梱包写真": camera frame with fictional folded navy shirt and package, note "商品と梱包状態を一緒に撮る"; primary "この写真を使う".
37 "発送完了": rows "配送方法", "発送日時", "担当", green status "確認済み"; primary "発送を記録".
38 "棚卸しを始める": location card "棚A・2段目・箱3", photo and "確認する商品 12点"; primary "棚卸しを始める".
```

## Board 08 — 差異・返品・売上（ID 39〜43）

```text
Board heading: "B採用｜全49ページ 8/9　差異・返品・売上"
Create exactly five phones, all with stable bottom tabs.
39 "数が合わない商品": three cards "見つからない", "別の棚にある", "予定外の商品", amber count; primary "この商品を確認".
40 "見つからない商品（仮）": checks "商品を再確認", "棚を再確認", "写真", "理由" and hold gesture indicator; primary "3秒押して仮状態にする".
41 "見つかった商品を戻す": cards "商品番号", "現在の棚", green "再確認済み", history note; primary "在庫に戻す".
42 "返品の状態確認": cards "別場所で保管", "状態", "再販売できるか", human choice and one issue marker; primary "確認結果を保存".
43 "売上の事実": separate rows "売上", "手数料", "送料", "仕入れ代", note "事実を分けて確認"; primary "会計の設定へ".
```

## Board 09 — 会計ファイル・履歴（ID 44〜49）

```text
Board heading: "B採用｜全49ページ 9/9　会計ファイル・履歴"
Create exactly six phones, all with stable bottom tabs.
44 "会計の基本設定": owner-confirmed fields "申告の設定", "消費税", "会計年度" and help icons; primary "内容を確認して保存".
45 "会計項目の候補": cards "売上", "販売手数料", "送料", "仕入れ代" with badge "候補・人が確認"; primary "確認した項目を保存".
46 "作成前の確認": checklist "設定", "資料", "重複", one clear green status "作成できます"; primary "ファイル内容を確認".
47 "ファイル内容の確認": read-only compact preview with "列名", "件数 5件", "先頭行", note "外部へ自動送信しません"; primary "確認してダウンロード".
48 "手動取込の結果": choices "取込できた", "一部できなかった", "取込していない" with note field; primary "結果を保存".
49 "作成・取込履歴": history cards with dates and labels "ダウンロード済み", "取込確認済み", "置き換え済み"; primary "履歴の詳細を見る".
```

## Board 10 — ジャンル別の撮る写真（画面20の状態違い）

```text
Board heading: "B採用｜ジャンル別の撮影ガイド"
Create exactly six phones. Each is a state variant of screen 20 "撮る写真一覧" and uses stable bottom tabs.
1 "シャツ・ポロ": "正面", "背面", "ブランド・サイズ", "品質表示", "襟元", "袖口", "裾", "特徴", "気になる箇所".
2 "ニット": "正面", "背面", "ブランド・サイズ", "品質表示", "首元", "袖口", "裾", "編み地・毛玉", "気になる箇所".
3 "ジャケット・コート": "正面", "背面", "ブランド・サイズ", "品質表示", "襟", "袖口", "前開き", "裏地", "ポケット", "裾", "気になる箇所".
4 "パンツ・スカート": "正面", "背面", "ブランド・サイズ", "品質表示", "ウエスト", "留め具", "裾", "脇・ポケット", "裏地", "気になる箇所".
5 "ワンピース": "正面", "背面", "ブランド・サイズ", "品質表示", "首元", "袖", "ウエスト", "裾", "ファスナー・裏地", "気になる箇所".
6 "バッグ": "正面", "背面", "開口部", "底", "左右側面", "内側", "収納部", "持ち手", "角・金具", "表示タグ", "気になる箇所".
Show counts and checkmarks, not dense paragraphs. Add a small footer note across the board: "商品に合わせて必要な写真だけを案内します。状態は人が確認します。"
```
