# B採用・Slack再コメント反映モック用プロンプト v4

- 作成日: 2026-08-26（JST）
- 画像生成: Codex内蔵ImageGen
- 正確な仕様: `mobile-ios-redesign-slack-revisions-v4.md`
- 調査根拠: `../research/mobile-ios-slack-followup-v4.md`

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

## 卸の仕入箱 — 2段階検品

```text
Edit the inventory-label board only as a visual style reference; replace its content with exactly six phones.
Board heading: "B採用｜修正版　仕入箱50着をすばやく検品"
01 "仕入箱を登録": fields "仕入箱番号 BOX-2026-014", "仕入先 卸A", "仕入日 2026/08/26", "箱の仕入額 ¥75,000", "予定 50着"; helper "仕入箱は保管箱とは別です"; primary "この箱を登録".
02 "高速検品を始める": progress "12 / 50着", two-step explainer "1周目 すべてを簡単登録" and "2周目 必要な商品だけ詳しく調査"; primary "次の商品を検品".
03 "1点を仮登録": one simple navy T-shirt photo, handwritten inventory number "INV-000128-4", compact rows "ブランド CleanStyle", "種類 Tシャツ", "特徴 ロゴ刺繍", choice chips "販売候補" selected, "要確認", "販売しない"; price band "¥3,000〜4,000"; primary "保存して次へ".
04 "あとで詳しく調べる": queue summary "要確認 8着" with cards "高く売れそう 5", "状態を確認 3"; note "すべてを最初から詳しく調べません"; primary "優先商品を開く".
05 "箱の見込み": rows "実数 48着", "販売候補 39着", "見込売上 ¥138,000〜169,000", "仕入額 ¥75,000", "見込手数料・送料 ¥32,000〜41,000", "見込粗利 ¥31,000〜53,000", "損益分岐 24着"; amber badge "見込み・人が確認"; primary "見込みを確認".
06 "販売後の実績": rows "販売済み 31 / 48着", "実売上 ¥124,000", "実手数料・送料 ¥29,600", "仕入額 ¥75,000", "実粗利 ¥19,400", "未販売 17着"; green badge "販売記録から集計"; primary "箱の実績を見る".
Constraints: distinguish purchase batch box from storage location box; forecast and actual must not be visually confused; no claim of automatic research or final tax profit.
```

## 販売中サポート v2 — 商品ページURL

```text
Edit the existing sales-support board and keep exactly six phones.
Board heading: "B採用｜修正版　商品ページを登録して販売作業を短縮"
01 "販売中の作業": card "商品ページ未登録 2件", cards "価格を見直す 2件" and "コメントへ返信 3件"; primary "作業を開く".
02 "商品ページを登録": product "AP-2608-0142", selector "販売先 メルカリ", field "販売先の商品ID m123456789", field "商品URLを貼り付け" with fictional safe-looking URL; note "出品後に1回だけ登録"; primary "リンクを確認".
03 "リンクを確認": rows "商品 AP-2608-0142", "販売先 メルカリ", "商品ID m123456789", "公式ドメインを確認"; amber badge "人が商品ページを確認"; primary "このリンクを保存".
04 "価格を見直す": rows "現在 ¥6,800", "候補 ¥6,300", "下限 ¥5,900"; secondary action "商品ページを開く"; note "自動で価格は変えません"; primary "変更内容をコピー".
05 "返信文を作る": template chip "状態の質問", editable short Japanese reply, secondary "商品ページを開く"; note "内容を直して公式画面で送信"; primary "文章をコピー".
06 "結果を記録": checks "公式画面で価格を確認", "返信を送信", audit rows "本人操作", "確認時刻"; primary "作業結果を保存".
Constraints: the app stores and opens a user-confirmed URL only; never imply scraping, automatic login, automatic price update, automatic reply, or background access to the URL.
```

## Board 06 v4 — 無料の写真テンプレート

```text
Edit Board 06 v3 and keep exactly five phones numbered 29-33.
Board heading: "B採用｜修正版 6/9　タグ確認・写真テンプレート"
29 "タグを読み取る": preserve tag camera, human confirmation badge, and primary "タグを撮る".
30 "文字の候補": preserve editable rows "ブランド名", "サイズ", "色", "素材" and amber "文字の候補・人が確認"; primary "確認した内容を保存".
31 "テンプレートを選ぶ": selected category "Tシャツ" with a clean preview; alternate cards "シャツ", "バッグ"; rule preview "正面・中央", "ブランド 左上", "サイズ 右下"; primary "この型を使う".
32 "写真の位置を整える": white-background navy T-shirt centered inside safe-margin guides; controls "中央", "余白", "回転"; text overlays preview "CleanStyle" at top-left and "M" at bottom-right; note "端末内で調整・外部送信なし"; primary "仕上がりを確認".
33 "仕上がりを確認": large square thumbnail preview with brand top-left and size bottom-right; green badge "無料・端末内で作成"; optional card "背景をさらに整える" with note "商用利用できる契約済みソフトを自分で開く"; warning "無料版Photoroomは商用利用不可"; primary "この写真を保存".
Constraints: no Photoroom batch, ZIP, API, automatic external-app control, paid feature presented as free, background-removal claim, or third-party logo.
```

## Board 07 v4 — 個人間取引の注文・配送

```text
Edit Board 07 v3 and keep exactly five phones numbered 34-38.
Board heading: "B採用｜修正版 7/9　注文情報と送料を分かりやすく"
34 "注文を登録": read-only auto field "アプリ内注文番号 ORD-20260826-0012"; selector "販売先 メルカリ"; field "販売先の取引ID"; optional field "購入者表示名（任意）"; helper "匿名配送なら住所は保存しません"; primary "注文を保存".
35 "商品を取り出す": preserve product and storage-location double check with green "一致" and primary "取り出しを完了".
36 "配送方法を選ぶ": selector "メルカリ"; compact selectable rows "ゆうパケットポストmini 160円", "ネコポス 210円", "ゆうパケットポスト 215円", "ゆうパケットプラス 455円", "宅急便コンパクト 450円＋箱"; scroll cue "ほかのサイズを見る"; badge "公式確認 2026/08/26"; primary "この方法にする".
37 "発送内容を確認": rows "商品", "販売先 メルカリ", "取引ID", "配送方法 ネコポス", "送料 210円"; buttons "公式料金を確認" and primary "内容を確認しました"; amber note "料金は変わることがあります".
38 "発送を記録": green "確認済み"; rows "配送方法", "送料", "発送日時", "担当"; settings card "送料一覧", "メルカリ / Yahoo!フリマ・オークション", "公式確認日つき", action "送料一覧を編集"; primary "発送を記録".
Constraints: plain-text marketplace names only, no platform logo; distinguish app order number, marketplace transaction ID, and optional buyer display name; no automatic rate lookup, scraping, API, address display, or auto-shipping.
```
