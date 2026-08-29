# B採用・Slack画像コメント反映モック用プロンプト v6

- 作成日: 2026-08-26（JST）
- 画像生成: Codex内蔵ImageGen
- 正確な仕様: `mobile-ios-redesign-slack-revisions-v6.md`
- 調査・実装照合: `../research/mobile-ios-slack-followup-v6.md`

## 共通指定

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese iPhone PWA design-review board, landscape 16:9
Style: shippable iOS-inspired UI; warm off-white board; dark charcoal Japanese text; cobalt primary actions; mint confirmed states; amber review states; rounded cards; thin gray dividers; generous spacing
Composition: straight portrait phones, evenly spaced, no overlap, no crop; short Japanese title above every phone
Navigation: bottom tabs in this exact order: ホーム, 作業, 商品, 在庫, 会計
Interaction: one screen one purpose; one clear primary action; large tap targets; state uses icon plus Japanese text
Constraints: fictional data; no real account, address, third-party logo, Apple logo, watermark, exposed credential, automatic listing, automatic price change, automatic external editing, browser automation, RPA, scraping, private API, or public photo storage claim
```

## A v3 — 05・06を戻して07へKPIを分離

```text
Image 1 is the edit target: mobile-ios-redesign-wholesale-box-inspection-v2.png.
Image 2 is a supporting reference: mobile-ios-redesign-wholesale-box-inspection-v1.png. Restore the information structure and exact values of phones 05 and 06 from Image 2 while retaining phones 01-04 from Image 1.
Create exactly seven phones in one landscape board.
Board heading: B採用｜再修正版　箱の見込み・実績・月別KPI
01 仕入箱を登録: preserve Image 1 screen 01.
02 入っている数を数える: preserve Image 1 screen 02.
03 1点を簡単登録: preserve Image 1 screen 03 with simple paper number 0128 and no decorative tag.
04 あとで詳しく調べる: preserve Image 1 screen 04.
05 箱の見込み: restore exact rows 実数 48着, 販売候補 39着, 見込売上 ¥138,000〜169,000, 仕入額 ¥75,000, 見込手数料・送料 ¥32,000〜41,000, 見込粗利 ¥31,000〜53,000, 損益分岐 24着; amber 見込み・人が確認; primary 見込みを確認.
06 販売後の実績: restore exact rows 販売済み 31 / 48着, 実売上 ¥124,000, 実手数料・送料 ¥29,600, 仕入額 ¥75,000, 実粗利 ¥19,400, 未販売 17着; green 販売記録から集計; primary 月別KPIを見る with a right arrow.
07 月別KPI: rows 30日販売率（回転）35%, 9月 売上見込 ¥54,000, 9月 粗利見込 ¥16,000, 10月 売上見込 ¥47,000, 10月 粗利見込 ¥13,000, 残り在庫 31着; amber 見込み・人が確認; small note 運用の参考値です; primary KPIの内訳を見る.
Constraints: screen 05 is forecast, screen 06 is actual, screen 07 is monthly KPI; keep them visually distinct; no tax-profit claim; no external data retrieval.
```

## C v6 — 全写真の保存と編集受け渡し

```text
Edit mobile-ios-redesign-b-board-06-product-info-v5.png as the visual style reference and replace its flow with exactly seven phones numbered 29-35.
Board heading: B採用｜再修正版 6/9　全写真の保存と編集受け渡し
29 撮影した写真: grid of five thumbnail cards labelled 正面, 背面, ブランドタグ, 品質表示, 気になる箇所; green 5枚保存済み; helper 商品ごとにまとめます; primary 5枚を確認.
30 写真の保存先: breadcrumb 商品 > AP-2608-0142 > 写真; compact list 正面 保存済み, 背面 保存済み, タグ2枚 保存済み, 気になる箇所 保存済み; card PC内の非公開写真保管庫; note GitHub・Slack・Notionには保存しません; note 原本は上書きしません; primary 保存内容を確認.
31 ブランド・サイズ確認: editable rows ブランド CleanStyle, サイズ M, 色 ネイビー, 素材 綿100%; helper 編集前に人が確認; primary この内容で進む.
32 編集レシピを選ぶ: cards 正面・背面 白背景／中央／余白, 正面だけ ブランド左上・サイズ右下, タグ・気になる箇所 向き／明るさのみ; badge 役割ごとに型を設定; primary 編集方法を選ぶ.
33 編集方法を選ぶ: three options 自作画像編集（準備中） with helper 同じレシピで将来差し替え, 編集用セットを作る selected and available, 編集せず進む; note 外部アプリを自動操作しません; primary 編集用セットへ.
34 編集用セットを作る: card 5枚を1つにまとめる; file examples AP-2608-0142_01_front.jpg, _02_back.jpg, _03_brand-tag.jpg; include manifest and recipe; green 位置情報を除いたコピー; note 原本はアプリに残ります; primary ZIPを作成.
35 加工後を戻して確認: action ZIPまたは画像を選ぶ; status 5 / 5枚 一致; before/after mini comparison; checklist 色・ロゴ・傷を人が確認; note 契約済み編集ソフトで手動編集, 将来の自作編集も同じ確認; primary 5枚を承認.
Constraints: all photos, not front only; physical originals remain in PC private storage; no public cloud claim; no automatic Photoroom connection, API, RPA, login, click, or batch claim; plain text may say 契約済み編集ソフト but show no third-party logo; do not present Photoroom Free as commercial-use safe; future self-built editor is visibly 準備中, not implemented.
```
