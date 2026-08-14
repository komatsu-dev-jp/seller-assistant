# Slack追加要望への回答案

確認日: 2026-08-13（JST）

## 1. 個人メルカリとメルカリShopsを無料で自動連携できるか

結論は、同じ方法ではできない。

- 個人メルカリには、外部SaaSが写真・文章を自動登録し、下書きIDやURLを受け取る一般公開APIがない。MVPでは「画像を書き出す」「説明文をコピーする」「公式出品画面を開く」までを当アプリが行い、本人が公式画面で下書き保存・出品する。公開後のURLは本人が貼り付け、確認日時を残す。
- メルカリShopsは、契約前でも公式形式のCSVと画像フォルダを当アプリから書き出し、公式管理画面へ人がアップロードできる。商品ステータスを非公開に固定すれば、確認前の公開事故を避けられる。
- メルカリShops APIは正式契約後の拡張にする。契約、書面承認、`API_CLIENT_NAME`発行の3条件が揃うまで本番接続ボタンをロックする。

画面ラベルは次の4つに統一する。

- 個人メルカリ: `手動・本人確認`
- Shops CSV: `公式CSV`
- Shops API契約前: `連携準備中`
- Shops API契約後: `公式API`

参考:

- [個人メルカリの出品手順](https://help.jp.mercari.com/guide/articles/62/)
- [メルカリShopsの商品一括登録CSV](https://support.mercari-shops.com/hc/ja/articles/8859698858649-%E5%95%86%E5%93%81%E3%82%92%E4%B8%80%E6%8B%AC%E7%99%BB%E9%8C%B2%E3%81%99%E3%82%8B%E9%9A%9B%E3%81%AECSV%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB%E3%81%AE%E4%BD%9C%E3%82%8A%E6%96%B9)
- [メルカリShops API](https://api.mercari-shops.com/docs/index.html)

## 2. iPhone撮影後の画像保管方法

結論は、「アプリで撮影または選択し、暗号化した非公開クラウド保管庫へ直接送る」方式が最適である。

1. アプリ内カメラ、または利用者が選んだ写真だけを扱えるPhotosPickerを使う。
2. 通信が切れても再送できる端末内一時キューへ保存する。
3. 非公開ストレージへ直接アップロードする。
4. サーバー側でファイルハッシュ、形式、容量、順番、SKUを照合する。
5. 原本、出品用加工画像、サムネイルを分け、原本を上書きしない。
6. サーバー保存を確認してから端末の一時ファイルを削除する。
7. 個人端末では写真アプリへ残すかを選択可能にし、外注端末では既定で残さない。

Notionは正本にせず、個人情報を除いたサムネイルと進行状況だけを一方向で写す。

参考:

- [Apple PhotosPicker](https://developer.apple.com/documentation/PhotoKit/selecting-photos-and-videos-in-ios)
- [Apple URLSessionUploadTask](https://developer.apple.com/documentation/foundation/urlsessionuploadtask)

## 3. 白色・青色申告とMoney Forward CSV

結論は、「確定申告を完成させるAI」ではなく「人が承認した仕訳を会計ソフトへ取り込める状態にするアプリ」として設計する。

- 白色・青色・未決定は利用者本人が選ぶ。AIは適用可否を決めない。
- AIは証憑OCR、事実抽出、計算、照合、承認済みルールによる仕訳候補、一般情報と根拠の表示までを行う。
- 必要経費、家事按分、所得区分、棚卸評価、減価償却、税区分、インボイス区分、青色控除の適用可否は自動確定しない。
- Money Forward公式A〜AA列形式を出力し、貸借一致、行数、文字数、年度、未確認税区分、重複バッチを事前検査する。
- 出力履歴には元イベント、バッチID、行数、貸借合計、ファイルSHA-256、作成者、承認者、取込確認状態を保存する。
- 完了表示は `会計ソフト取込準備完了` とし、`確定申告完了` と表示しない。
- CSVでは自動反映されない地代家賃、減価償却、専従者等は「年度決算パック」の未入力一覧へ残す。

参考:

- [国税庁: 個人事業者の記帳](https://www.nta.go.jp/taxes/shiraberu/shinkoku/kojin_jigyo/index.htm)
- [国税庁: 青色申告制度](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2070.htm)
- [Money Forward: 仕訳帳をインポートする](https://biz.moneyforward.com/support/account/guide/import-books/ib01.html)
- [Money Forward: 申告書への自動反映項目](https://biz.moneyforward.com/support/tax-return/faq/features2/fe01.html)

## 4. モックの承認条件

次のモバイル6枚、Web5枚を同じSlackスレッドへ投稿し、最終承認を得る。

- モバイル: 初期設定、仕入・証憑、撮影・採寸、AI文章・出品引渡し、注文・在庫・チーム、収支・CSV
- Web: 仕入・在庫、出品・注文、チーム・承認、年度決算・CSV、設定・連携

承認されるまでNotion仕様書、Goal、実装へ進まない。
