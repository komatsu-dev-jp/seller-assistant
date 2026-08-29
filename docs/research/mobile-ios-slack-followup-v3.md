# スマホ版Slack再コメント・技術確認 v3

- 確認日: 2026-08-26（JST）
- 対象: 請求書ファイル、在庫ラベル、Photoroom手動Batch、販売中の価格・返信、販売先別の配送方法
- 対象Slack: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787631209774569>

## 確認できた事実

### 請求書とGoogle Drive

- Appleは、Google Driveなどの他社クラウドをiPhoneの「ファイル」アプリの場所として追加できると案内している。
- Googleも、Drive上のファイルを「ファイルに保存」して別アプリで開く手順を案内している。
- したがってP0では、アプリがGoogleアカウントへ直接接続するより、標準の`ファイルから選ぶ`を使う方が、追加API・OAuth・認証情報保存を不要にできる。
- 出典:
  - <https://support.apple.com/ja-jp/102238>
  - <https://support.google.com/drive/answer/2423534?co=GENIE.Platform%3DiOS>

### PhotoroomのBatch

- Photoroom Web AppのBatchは、複数画像またはPC上のフォルダを読み込んでまとめて編集できる。
- 公式手順は`Import images`または`Import folder`であり、ZIPファイルをそのままBatchへ送る手順ではない。
- このアプリのZIPは、SKU付き画像を一つにまとめてPCへ渡すための運搬用ファイルとする。利用者がPCで展開し、展開した画像またはフォルダをPhotoroomへ手動で読み込む。
- Batchの書出しは有料プラン条件があるため、P0の無料必須機能にしない。既存契約が確認できる場合だけ任意で使う。
- 出典:
  - <https://help.photoroom.com/en/articles/14170189-create-a-batch-of-images-web-app>
  - <https://help.photoroom.com/en/articles/11784338-what-is-the-batch-feature>

### 現在の在庫ラベル実装

- 商品作成時に`INV-000001-7`形式のチェック値付き在庫番号を発行し、`manual_code`ラベルとしてDBへ保存する処理はある。
- スマホ画面には在庫番号の手入力と、商品・場所を人が最終確認する導線がある。
- 旧ラベルを無効化し、同じ短縮番号の新しい版を再発行して監査へ残す処理がある。
- 一方、バーコード／QR画像の生成、印刷用レイアウト、ブラウザの印刷画面は現行コード内に見当たらない。したがって「発行から印刷まで実装済み」とは扱わない。
- 根拠:
  - `apps/api/src/p0-item-repository.ts`
  - `apps/web/src/components/mobile-scan-workflow.tsx`
  - `apps/api/src/stocktake-repository.ts`
  - `apps/web/src/components/stocktake-workspace.tsx`

## 採用する設計案

### 請求書

`メール添付をファイルへ保存 → アプリの「ファイルから選ぶ」 → PDFまたは画像を確認 → 読み取り候補を人が確認`

- Google Driveを利用している場合も、iPhoneのファイル選択画面から利用者が選ぶ。
- アプリはGoogle Driveへ直接ログインせず、Googleの認証情報を保存しない。
- 選択した原本はアプリの非公開保存領域へ複製し、元のDriveファイルを勝手に変更しない。

### 在庫番号ラベル

- 無料の標準: 大きく表示した在庫番号を、利用者が取り外し可能な紙タグへ手書きする。
- 任意: 同じ番号をバーコードまたはQR付きのA4ラベルへ配置し、OSの印刷画面から利用者が印刷する。
- 印刷の有無にかかわらず、番号、商品写真、保管場所を人が確認する。
- 手書き時はチェック値を含む全文を入力し、入力ミスを検出する。

### 販売中の価格と返信

- アプリは価格変更候補、下限確認、期限、返信テンプレートを準備する。
- `文章をコピー`または`変更内容をコピー`まではワンクリックにする。
- 公式画面での価格変更、タイムセール設定、返信送信は本人が行い、完了結果だけを記録する。
- スクレイピング、非公開API、ブラウザ自動操作、自動値下げ、自動返信は行わない。

### 販売先ごとの配送方法

- 利用者が販売先ごとに使う配送方法を登録・有効化し、注文で選んだ販売先に対応する方法だけを表示する。
- 実在サービスの仕様変更をアプリが推測せず、公式画面を人が確認して設定を更新する。
