# 全画面モック確認インデックス

更新日: 2026-08-14（JST）  
採用方向: B「高速ワークベンチ」＋ C「チームリレー」  
状態: M01〜M12・W01〜W10を承認済み。標準ホームはC「オーナーパルス」

## ホーム画面の追加比較

| 案 | 画像 | 最初の判断 | 状態 |
|---|---|---|---|
| A | `home-concept-a-today-guide-v1.png` | 次に何をすればよいか | 比較済み・不採用 |
| B | `home-concept-b-operations-tower-v1.png` | どこが滞り、誰が対応するか | 比較済み・業務画面へ考え方を採用 |
| C | `home-concept-c-owner-pulse-v1.png` | 収益・在庫で何を確認すべきか | Slack承認済み・標準ホーム |

3案とも同じMVPと安全境界を保ち、PCとiPhoneの情報優先順位だけを変えている。Cを標準ホームとして採用し、C画像内のグラフ仮番号は実装時に実データから生成する。

## モバイル（iOS）

| ID | 画像 | 主な画面 |
|---|---|---|
| M01 | `mobile-01-onboarding-workbench.png` | ログイン、招待、初期設定、権限、今日の作業、続きから、通知、その他 |
| M02 | `mobile-02-purchase-receipt.png` | 仕入登録、レシート撮影、OCR確認、商品分割、原価配賦、オフライン送信待ち |
| M03 | `mobile-03-capture-measure.png` | 商品開始、撮影ガイド、写真確認・加工、採寸、タグOCR、再測定 |
| M04 | `mobile-04-ai-listing-v2.png` | AI文章候補、差分・根拠、出品検証、個人メルカリ手動引渡し、Shops CSV・API状態、確認済みURL |
| M05 | `mobile-05-orders-inventory-team.png` | 注文、ピッキング、梱包証拠、発送、棚卸、外注タスク・承認 |
| M06 | `mobile-06-finance-export.png` | 収支、証憑、取引照合、AI仕訳候補、未解決、年度確認、Money Forward CSV |
| M07 | `mobile-07-image-processing-v1.png` | 加工待ち、非生成の標準レシピ、Photoroom Pro手動Batch、ZIP再取込、SKU照合、原本比較、人の承認 |
| M08 | `mobile-08-category-measurement-v1.png` | カテゴリ別採寸、トップス・スカート・パンツ、靴・バッグ・帽子、測定証拠、再測定、監査 |
| M09 | `mobile-09-monthly-supplier-analytics-v1.png` | 月間収支、入金・返品調整、仕入先比較、30/60/90日販売率、在庫年齢、データ充足率 |
| M10 | `mobile-10-product-research-inspection-v1.png` | JAN・タグOCR、商品候補、公式検索への引渡し、比較根拠、人による採用・除外、参考価格範囲、監査 |
| M11 | `mobile-11-price-operations-v1.png` | 単品の価格案、採算・下限、公式経路、承認、本人による反映確認、監査・観測結果 |
| M12 | `mobile-12-inventory-location-operations-v1.png` | 在庫担当、商品/場所の二重読取、場所写真、在庫番号、格納・移動・ピッキング、棚卸差異 |

## Web（PC）

| ID | 画像 | 主な画面 |
|---|---|---|
| W01 | `web-01-purchase-inventory.png` | 仕入バッチ、証憑OCR・按分、SKU・棚番・在庫、棚卸競合 |
| W02 | `web-02-listings-orders-v2.png` | 販売チャネル、出品検証、注文・配送、公開・配送例外 |
| W03 | `web-03-team-approval-audit.png` | チーム概要、権限、引継ぎ、変更承認・差戻し、監査ログ |
| W04 | `web-04-finance-yearend-export-v2.png` | 年度チェック、仕訳レビュー、Money Forward出力前検査、出力・取込履歴 |
| W05 | `web-05-settings-integrations.png` | 事業・会計設定、販売チャネル、写真・データ保管、メンバー権限・通知 |
| W06 | `web-06-image-processing-queue-v1.png` | 加工キュー、レシピ、Pro手動ZIP、公式API許諾状態、原本比較、失敗・再処理、使用量・監査 |
| W07 | `web-07-monthly-supplier-analytics-v1.png` | 月次ウォーターフォール、仕入先比較、仕入月コホート、在庫日数、データ欠損、運用・会計照合 |
| W08 | `web-08-product-research-workbench-v1.png` | タグ原本、OCR・候補、公式検索、比較根拠、販売中希望価格と売却済み観測価格、人の結論、承認・監査 |
| W09 | `web-09-price-campaigns-v3.png` | 値下げキャンペーン、一括採算・例外、個人版手動キュー、Shops公式更新CSV、公式セール、承認・観測比較・監査 |
| W10 | `web-10-inventory-location-workbench-v1.png` | 場所ツリー、部屋/位置写真、在庫台帳、担当、移動履歴、棚卸セッション、差異承認 |

## 目視レビューで行った安全修正

- M04 v1の個人メルカリ下書きID・架空URLを削除。個人版はURLなしの公式内下書きと、公開後に本人確認済みURLを登録する状態へ変更。
- M04 v2のShopsは、非公開商品に商品IDがあっても公開URLはなく、IDからURLを推測しないことを明示。
- W02 v2はメルカリShops APIを契約前ロックし、契約・書面承認・`API_CLIENT_NAME`を必須に変更。架空URLを削除。
- W04 v1の「取込準備完了」と未解決ブロッカーの矛盾を解消。準備完了は未解決0件・全検査合格の時だけ表示。
- M07/W06ではCodex・RPAによるPhotoroomのブラウザ自動操作を採用せず、MVPの手動Batchと、契約・許諾確認後の公式APIを分離。APIはPro契約と別であることを明示。
- M08では「全衣類共通の採寸項目」を廃止し、カテゴリ・形状別テンプレート、平置幅と一周の区別、人による確定、証拠写真、再測定を明示。
- M09/W07では入金、商品粗利益、取引貢献利益、会計帳簿を分離し、母数・観測期間・欠損を表示。税額や仕入継続・停止をAIが断定しない。
- M10/W08ではバーコード・OCR・画像照合を商品候補の生成に限定し、各販売チャネルの公式画面で人が比較対象を選ぶ。販売中希望価格と売却済み観測価格を分け、AIが商品・真贋・価格を確定しない。
- M11/W09では個人版の非公式自動操作を行わず、本人の公式操作と反映確認を必須化。Shopsは商品IDと変更項目を含む公式形式の更新CSVを人がプレビュー・アップロードする。契約APIは未接続表示。
- W09 v3では、公式タイムセール利用時以外の「値引き」「セール」、値引率・値引額、値引前価格を商品名・説明・画像へ記載しないルールへ修正した。
- M12/W10ではSKUと現物の在庫管理番号を分け、商品→場所→人の確認、場所写真、追記型移動履歴、差異を自動修正しない棚卸、外注の場所枝権限を追加した。

## 画像の位置づけ

これらは画面構成と作業導線の承認用モックで、実装済み画面ではない。画像内の細かな文言、件数、氏名、金額、商品例は仮データであり、正式な仕様は`docs/specs/`のローカルMarkdownを内容正本とし、Notionへ共有用に同期する。
