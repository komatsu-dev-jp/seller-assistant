# 固定10商品pilot v1.1 素材

- すべて架空のローカル検証データです。実顧客・実在ブランド・個人情報は含みません。
- 外部AI、外部API、有料サービス、販売サイトへ接続しません。費用は0円です。
- WARMUP-01は計測外の練習用です。TOP-01〜KNIT-02だけを固定順で本計測します。
- 各フォルダーの `front.png`、`back.png`、`brand_tag.png`、`care_label.png` を対応する4つの写真欄へ選びます。
- 固定属性と採寸値は `CHECKLIST.csv`、機械検証値は `manifest.json` を参照します。
- PNGは800×800、25MB未満です。アプリの上限はJPEG/PNG、1枚25MB以下、1辺12,000px以下です。

## 同一素材の確認

`node scripts/generate-pilot-fixtures.mjs --check` を実行します。PASSにならない場合は本計測を始めません。

manifest SHA-256: `a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`

SHA-256は素材の取り違えや変更を検出するための64文字の指紋です。manifestの値は、`manifestSha256`自身を除くpayloadをJavaScriptの安定した挿入順で`JSON.stringify`したUTF-8 bytesから計算します。

このREADMEは素材準備だけを説明します。実10商品pilotはまだ実施済みではありません。現行commitのUI再評価が完了するまで開始しません。
