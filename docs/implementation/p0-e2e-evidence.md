# P0一気通貫・実画面検証証拠

- 実施日: 2026-08-15（JST）
- 環境: Windows、ローカルNext.js本番ビルド、PostgreSQL、インストール済みChrome
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
9. 会計CSVをPC内に生成し、日付、借方、貸方、金額、参照ID、hash、作成履歴を確認した。
10. ページを再読込し、同じSKUの写真4種、採寸4項目、文章候補、確認根拠、会計CSV履歴がDBから復元されることを確認した。
11. 管理者が配送担当を注文へ期限付き割当し、担当者本人だけが最大5分の住所表示、pick、pack、shipを実行できることを確認した。
12. 在庫番号と場所コードのcheck digitを検査し、1文字変更したコードを拒否した。

## 自動確認値

- 採寸4件の説明文反映と再読込復元: 合格
- 会計CSV履歴のDB保存と再読込復元: 合格
- ブラウザconsole error: 0件
- 取引貢献利益カード: 背景 `rgb(23, 35, 59)`、文字 `rgb(255, 255, 255)`
- PC表示: 1440×1000
- iPhone相当表示: 390×844

## 画面証拠

- `output/playwright/p0-workflow-purchase.png`
- `output/playwright/p0-workflow-mobile.png`
- `output/playwright/p0-workflow-accounting.png`
- `output/playwright/p0-workflow-accounting-mobile.png`
- `output/playwright/iteration-21-login.png`
- `output/playwright/iteration-21-workflow-reloaded.png`
- `output/playwright/iteration-21-mobile-390x844.png`
- `output/playwright/iteration-21-shipping-role.png`

## DB・権限の実証

- 新規の使い捨てPostgreSQLへmigration 0001〜0015を順番に適用した。
- 33業務テーブルでRLS（別の利用組織のデータをDB自身が拒否する仕組み）を確認した。
- 配送担当なし、期限切れ、別注文の住所/pick/pack/shipを拒否した。
- 商品写真4種と採寸4項目が不足した撮影確認、古い根拠を使った出品確認、汎用APIによる注文進捗の直接完了を拒否した。
- 住所は暗号化して保存し、平文を監査・ログ・画面HTMLへ残していない。

## 外部接続の確認

- 実行中のアプリが呼ぶのは同じWebサイト内の`/v1`だけで、メルカリ等の外部サービスへ接続する処理はない。
- APIサーバーの接続先はPC内PostgreSQLとPC内private media directoryだけである。
- Slack、Notion、GitHub push、外部AI、画像加工SaaS、deploy、外部CIはこの検証で0件。

## 未確認

- 実iPhone Safari、ホーム画面追加、カメラ、オフライン復帰。
- HEIC/WebP写真。P0はJPEG/PNGだけを受け付け、未対応形式を黙って変換しない。
- 実写真、実住所、実売上、実会計データは安全上使用していない。
