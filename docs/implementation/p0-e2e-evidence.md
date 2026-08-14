# P0一気通貫・実画面検証証拠

- 実施日: 2026-08-15（JST）
- 環境: Windows、ローカルNext.js本番ビルド、Playwright Chromium
- 費用: 0円
- データ: 架空の商品・注文・証憑のみ

## 操作結果

1. 架空の仕入証憑と1,500円を人確認した。
2. 正面、背面、ブランドタグ、品質表示の4項目を確認した。
3. 肩幅42cm、身幅52cm、袖丈61cm、着丈70cmを入力し、人確認した。
4. 無料の決定的テンプレートへ4採寸値が正しく反映された。
5. 自動出品をせず、本人が公式画面へ渡す内容を確認した。
6. 注文確認、二重確認、梱包証拠、発送確定を順番に通した。
7. 販売額5,000円、原価1,500円、手数料500円、送料750円、取引貢献利益2,250円を表示した。
8. 税務上の確定値ではない注意を表示し、仕訳候補を人確認した。
9. `test-journal-candidate.csv` をローカル保存し、日付、借方、貸方、金額、参照IDを確認した。

## 自動確認値

- 採寸4件の説明文反映: 合格
- CSVファイル名: `test-journal-candidate.csv`
- ブラウザconsole error: 0件
- 取引貢献利益カード: 背景 `rgb(23, 35, 59)`、文字 `rgb(255, 255, 255)`
- PC表示: 1440×1000
- iPhone相当表示: 390×844

## 画面証拠

- `output/playwright/p0-workflow-purchase.png`
- `output/playwright/p0-workflow-mobile.png`
- `output/playwright/p0-workflow-accounting.png`
- `output/playwright/p0-workflow-accounting-mobile.png`

## 未確認

- 実iPhone Safari、ホーム画面追加、カメラ、オフライン復帰。
- 実PostgreSQLとRLSによる組織越境拒否。
- Web画面からAPI/DBへの保存。
- 実写真、実住所、実売上、実会計データは安全上使用していない。
