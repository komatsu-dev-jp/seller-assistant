# B採用・Slack再コメント反映モック用プロンプト v3

- 作成日: 2026-08-26（JST）
- 画像生成: Codex内蔵ImageGen
- 正確な仕様: `mobile-ios-redesign-slack-revisions-v3.md`
- 調査根拠: `../research/mobile-ios-slack-followup-v3.md`

## 共通指定

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese iPhone PWA design-review board, landscape 16:9
Style: realistic shippable iOS-inspired product UI; warm off-white background; dark charcoal Japanese text; cobalt primary actions; mint confirmed states; amber review states; rounded inset cards; thin gray dividers; generous spacing
Composition: straight portrait phones, evenly spaced, no overlap, no crop; short Japanese title above every phone
Navigation: operational screens use bottom tabs in this exact order: "ホーム", "作業", "商品", "在庫", "会計"
Interaction: one screen one purpose; one clear primary action; large tap targets; state uses icon plus Japanese text
Constraints: fictional data; no real account, address, company, third-party logo, marketplace logo, Apple logo, watermark, exposed credential, automatic listing, automatic price change, automatic reply, browser automation, RPA, scraping, or private API
```

## Board 01 v2 — Cロゴ確定

```text
Input images: Image 1 is Board 01 v1 edit target; Image 2 is the logo comparison reference, with C selected.
Keep exactly six phones and preserve screens 02-06 in structure and meaning.
Board heading: "B採用｜修正版 1/9　入口・作業キュー"
01 "ログイン": replace the shirt hero with the selected C symbol, an original navy camera-frame-and-garment mark with one restrained amber dot. Put "メールアドレス", "パスワード", and "ログイン" below the logo; note "安全に作業を始めます". No tabs.
02-06: preserve the existing titles, task cards, progress, primary actions, and stable tabs from Image 1.
Constraints: do not show A or B logo; do not invent a service name.
```

## Board 02 v3 — 請求書ファイル

```text
Input image: Board 02 v2 is the visual reference. Keep exactly five phones.
Board heading: "B採用｜修正版 2/9　請求書ファイル・仕入れ確認"
07 "仕入れ書類": selected card "請求書ファイル" with note "卸仕入れ"; secondary "レシートを撮る" with note "店舗で購入"; primary "請求書を追加".
08 "請求書を追加": large file card "ファイルから選ぶ"; supported "PDF・画像"; source chips "このiPhone内", "iCloud Drive", "Google Drive"; helper "メール添付は一度ファイルに保存"; note "Googleのログイン情報は預かりません"; primary "ファイルから選ぶ".
09 "ファイル確認": fictional file "invoice-2026-08.pdf", "2ページ", a generic invoice preview, status "原本を人が確認"; primary "この請求書を使う".
10 "読み取り確認": editable candidate rows "仕入先", "請求日", "合計"; badge "読み取り候補・人が確認"; primary "商品行を確認".
11 "商品行を確認": three line-item cards "商品名", "数量", "単価"; primary "確認した内容を保存".
Constraints: no direct Google Drive connection button, OAuth screen, real invoice, or real company.
```

## 在庫番号ラベル — 手書きと印刷

```text
Primary request: create one supplemental board with exactly six iPhone screens explaining two inventory-label methods.
Board heading: "B採用｜追加　在庫番号ラベルは2つの方法"
01 "在庫番号を作る": large "INV-000128-4", note "末尾の数字で入力ミスを確認"; primary "この番号を使う".
02 "ラベル方法": selected "手書き（無料・標準）" and secondary "印刷（任意）"; note "あとから変更できます"; primary "この方法で進む".
03 "手書きラベル": large number on a removable paper tag illustration; short steps "番号を写す", "商品に付ける", "書いた番号を確認"; primary "書いた番号を確認".
04 "印刷プレビュー": human-readable number plus simple barcode or QR candidate, A4 label-sheet preview, note "普通のプリンターで印刷"; primary "印刷画面を開く".
05 "商品を確認": choices "カメラで読む" and "番号を手入力"; shirt photo; badge "番号と写真を人が確認"; primary "この商品で進む".
06 "格納確認": cards "商品 INV-000128-4" and "棚A・2段目・箱3" with green "確認済み"; primary "この棚に格納".
Constraints: label rendering and printing are a proposal, not shown as already completed; no paid label printer, external API, automatic printing, or real barcode data.
```

## 販売中サポート — 価格と返信

```text
Primary request: create one supplemental board with exactly six iPhone screens for manual sales support.
Board heading: "B採用｜追加　販売中の価格・コメント対応"
01 "販売中の作業": channel selector "販売先A"; cards "価格を見直す 2件" and "コメントへ返信 3件"; primary "作業を開く".
02 "価格変更の候補": rows "現在価格", "変更候補", "下限価格", "原価・送料確認済み"; amber badge "候補・人が確認"; primary "内容を確認".
03 "公式画面で変更": steps "変更内容をコピー", "公式画面を開く", "表示を目視確認"; note "自動で価格は変えません"; primary "変更内容をコピー".
04 "返信テンプレート": cards "在庫の質問", "状態の質問", "値段の相談", "発送予定"; primary "テンプレートを選ぶ".
05 "返信内容を確認": editable friendly Japanese reply; note "相手と商品に合わせて直してください"; primary "文章をコピー".
06 "結果を記録": checks "公式画面で価格を確認", "返信を送信"; audit rows "本人操作", "確認時刻"; primary "作業結果を保存".
Constraints: no automatic sale, automatic price change, automatic message send, fake discount wording, platform logo, or claim of direct marketplace integration.
```

## Board 06 v3 — Photoroom手動Batch

```text
Input image: Board 06 v2 is the visual reference. Keep exactly five phones and preserve tag-reading meaning on screens 29-31.
Board heading: "B採用｜修正版 6/9　タグ確認・写真の手動編集"
29 "タグを読み取る": preserve tag camera and primary "タグを撮る".
30 "文字の候補": preserve editable rows and badge "文字の候補・人が確認".
31 "ブランドマーク": preserve "画像からの候補", "手入力", and "自動確定しません".
32 "画像をまとめて渡す": ordered steps "画像ZIPを書き出す", "PCでZIPを展開", "展開したフォルダをPhotoroomで読み込む"; prominent note "ZIPをそのまま送るものではありません"; card "既存契約がある場合だけ"; secondary "編集せず進む"; primary "画像ZIPを書き出す".
33 "加工後を戻す": ordered steps "加工画像をダウンロード", "同じファイル名を確認", "加工済みZIPを選ぶ"; side-by-side thumbnails "原本" and "加工後"; amber "人が比較"; primary "加工済みZIPを選ぶ".
Constraints: Photoroom plain text only, no Photoroom logo; never imply ZIP direct upload, free Batch export, browser automation, or API connection.
```

## Board 07 v3 — 販売先別の配送方法

```text
Input image: Board 07 v2 is the visual reference. Keep exactly five phones.
Board heading: "B採用｜修正版 7/9　販売先に合う配送方法"
34 "注文入力": fields "販売先", "注文番号", "販売金額", "注文日"; selected "販売先A"; primary "注文を保存".
35 "商品を取り出す": preserve product and shelf confirmation with green "一致"; primary "取り出しを完了".
36 "配送方法を選ぶ": header chip "販売先Aで使う方法"; options "小型ポスト", "宅配便（標準）", "持込発送"; text action "配送方法を編集"; primary "この方法にする".
37 "発送内容を確認": rows "商品", "販売先", "配送方法", "発送日"; note "公式画面でも条件を確認"; primary "発送内容を確認".
38 "発送を記録": green "確認済み"; rows "配送方法", "発送日時", "担当"; small settings card "販売先ごとの方法を追加・非表示にできます"; primary "発送を記録".
Constraints: neutral fictional channel labels only; no platform logo, automatic method lookup, auto-shipping, or direct external connection.
```
