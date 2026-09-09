# B採用・Slack画像コメント反映モック用プロンプト v5

- 作成日: 2026-08-26（JST）
- 画像生成: Codex内蔵ImageGen
- 正確な仕様: `mobile-ios-redesign-slack-revisions-v5.md`
- 調査根拠: `../research/mobile-ios-slack-followup-v5.md`

## 共通指定

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese iPhone PWA design-review board, landscape 16:9, 1672x941
Style: shippable iOS-inspired product UI; warm off-white board; dark charcoal Japanese text; cobalt primary actions; mint confirmed states; amber review states; rounded inset cards; thin gray dividers; generous spacing
Composition: straight portrait phones, evenly spaced, no overlap, no crop; short Japanese title above every phone
Navigation: bottom tabs in this exact order: ホーム, 作業, 商品, 在庫, 会計
Interaction: one screen one purpose; one clear primary action; 44pt or larger tap targets; state uses icon plus Japanese text
Constraints: fictional data; no real account, address, company, third-party logo, marketplace logo, Apple logo, watermark, exposed credential, automatic listing, automatic price change, automatic sale, automatic reply, browser automation, RPA, scraping, private API, or live external-data claim
```

## A v2 — 仕入箱の点数と月別KPI

```text
Edit mobile-ios-redesign-wholesale-box-inspection-v1.png, preserve its visual language, and replace the content with exactly six phones.
Board heading: B採用｜再修正版　仕入箱を数えて月別KPIを確認
01 仕入箱を登録: fields 仕入箱番号 BOX-2026-014, 仕入先 卸A, 仕入日 2026/08/26, 箱の仕入額 ¥75,000; count row 入っている数 まだ不明; helper 点数は箱を開けて数えます; primary 箱を登録して数える.
02 入っている数を数える: huge counter 48点, huge blue ＋1点, secondary 1点戻す, helper 数えてから検品を始めます, primary 48点で確定.
03 1点を簡単登録: progress 1 / 48, navy T-shirt photo, plain removable white rectangular sticker or paper with simple bold 商品番号 0128; absolutely no hang tag, string, decorative tag, barcode, QR, or long inventory ID; compact rows ブランド CleanStyle, 種類 Tシャツ, 状態 販売候補, 価格の目安 ¥3,000〜4,000; primary 保存して次へ.
04 あとで詳しく調べる: queue cards 高く売れそう 5点, 状態を確認 3点; note 全商品を最初から詳しく調べません; primary 優先商品を開く.
05 月別KPIの見込み: rows 30日販売率（回転）35%, 9月 売上見込 ¥54,000 / 粗利見込 ¥16,000, 10月 売上見込 ¥47,000 / 粗利見込 ¥13,000, 残り在庫 31点; tiny helper 販売率＝30日で売れる見込み÷月初在庫; amber badge 見込み・人が確認; primary 月別の見込みを確認.
06 販売後の実績: rows 9月 販売 17点, 30日販売率 35%, 粗利実績 ¥15,200, 見込みとの差 −¥800, 残り在庫 31点; green badge 販売記録から集計; primary 実績を見る.
Constraints: distinguish purchase batch box from storage box; count before inspecting; use 点, not 着, for unknown mixed inventory; user-facing number is simple; forecast and actual must not be confused; no tax-profit claim.
```

## B v3 — 根拠つき値下げ・セール提案

```text
Edit mobile-ios-redesign-sales-support-v2.png, preserve its visual language, and replace the content with exactly six phones.
Board heading: B採用｜再修正版　根拠つきの値下げ・セール提案
01 見直し候補: cards 今週見直す 3件, 季節に合う 2件, 値下げ依頼あり 1件; note 自動で価格は変えません; primary 候補を見る.
02 商品の状況を確認: product AP-2608-0142; rows 出品から 18日, 現在 ¥6,800, 下限 ¥5,900, 閲覧 128, いいね 7; helper 公式画面を見て入力; primary 入力内容を確認.
03 提案の理由: cards 自分の販売履歴 同じ種類は平均21日, 季節 9月は秋物の準備時期, 公式公開情報 確認 2026/08/26; amber badge 参考・人が確認; note 販売サイトから自動取得しません; primary 値下げ幅を比べる.
04 値下げ幅を比べる: three selectable cards 5% ¥6,460 粗利見込 ¥1,660, 10% ¥6,120 粗利見込 ¥1,320 おすすめ, 15% ¥5,780 下限より低い; clearly block the 15% candidate; note 正解を固定せず利益も確認; primary 10%を候補にする.
05 行事に合わせる: editable timeline 衣替え 9月上旬, Green Friday / Black Friday 11月, クリスマス前 12月上旬; each shows 出典・確認日 and この商品に合うか確認; amber badge 予定・人が確認; primary 提案に追加.
06 公式画面で実行: summary 候補 ¥6,120, 見込み粗利 ¥1,320, 下限より ¥220上; actions 公式の価格機能を開く and 変更内容をコピー; note このアプリは自動値下げしません; primary 結果を記録.
Constraints: do not claim a universal best percentage or time; official platform and Shops-only information are references, not guarantees; no live price/like retrieval, scraping, API, automatic platform action, or sale execution.
```

## C v5 — 写真テンプレートが行うこと

```text
Edit mobile-ios-redesign-b-board-06-product-info-v4.png, preserve its visual language, and keep exactly five phones numbered 29-33.
Board heading: B採用｜再修正版 6/9　テンプレートが行うこと
29 タグを読み取る: preserve tag camera and amber 人が確認; primary タグを撮る.
30 ブランド・サイズ確認: editable rows ブランド CleanStyle, サイズ M, 色 ネイビー, 素材 綿100%; helper 写真を整える前に確認します; green-or-amber badge 人が確認; primary この内容で進む.
31 テンプレートを選ぶ: selected Tシャツ and alternate シャツ, バッグ; explicit checklist 自動で行う: 商品を中央へ, 余白をそろえる, ブランドを左上, サイズを右下; primary この型を自動適用.
32 自動で整えた結果: clear before/after preview of navy T-shirt; information card 自動：位置・余白・文字; amber card 背景の切り抜きはしません; visible controls 位置, 明るさ, 白さ; primary 微調整する.
33 仕上がりを保存: final square preview; checklist ZIPは不要, アプリ内で1枚ずつ保存, 契約済み編集ソフトへ書き出しは任意; note 外部API・自動操作なし; primary この写真を保存.
Constraints: no Photoroom logo, no claim of background removal or perfect white cutout, no ZIP workflow, no automatic external-app control, no paid feature presented as free; make the boundary understandable without reading external notes.
```
