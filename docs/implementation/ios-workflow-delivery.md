# iOS風の配置とPC共通作業の公開

確認日：2026-10-20

## 本人の依頼と公開範囲

iOS風の配置・導線を改善する依頼に続き、本人がmergeと公開を依頼。既存の混在作業を残し、今回の画面改善と必要なPC共通処理だけを専用作業フォルダへ切り分ける方針に「公開までお願いします」と回答した。

- モバイルの共通枠：見出しと主操作を通常のスクロール内へ移し、主操作48px・補助操作44px、コンパクトな下部5タブにする。疑似時刻・電池・黒い島は追加しない。
- ホーム・作業一覧：箱の作業、登録商品の続き、別の見本の操作を分ける。
- 箱：点数・検品・利益・一覧の工程表示。登録前の利益移動は禁止。箱名・費用の入力を開閉式にする。
- PC：同じ箱の検品、商品一覧、見本の出品準備・レシピ、会計設定の部品を利用し、PC用経路で戻る。
- 会計：選択式入力と開始日・終了日を維持し、文字を読みやすくする。

## 変更しないもの

保存キー・データ形式・利益式・既存API・認証・依存パッケージ・CI設定。Google共有の未完成コードや接続設定は含めない。同じブラウザー内で画面を切り替えた時の共有と、スマホ・PC間の共有を混同しない。箱の商品とREVIEW-0001の見本を混同しない。

## 確認方針

`npm ci`後に`npm test`、`npm run lint`、`npm run build`を順に実行し、さらに`npm run check`とPages用buildを確認する。実装者と別のAstra lowが凍結差分を読み取りレビューする。PRとmainのCI、Pagesの公開は各変更番号に一致する結果で確認する。

直前の混在フォルダでは1200テスト、320/390pxのホーム、点数→登録→利益→一覧、会計、1280pxのPC表示が成功。今回はGoogle基盤を含まない切り分け後のコードで再確認するため、前回の件数だけを今回の合格証拠にはしない。実iPhone/Safari、キーボード表示中、拡大文字の確認は未実施。

## デザインの根拠

product-ui-craftスキルを使用。青・白の既存デザインを維持し、[Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout)、[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)、[Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)を参考にした。Webの44px操作領域は指針を参考にしたもので、iOSネイティブ準拠の認証ではない。

## 独立レビューと追跡

AGENTSに従い、実装担当と別実行のAstra low（ios_delivery_review）が34ファイルと本文書を読み取りレビューし、P1/P2なしのPASS。保存境界、PCの経路、旧会計値の保持、Googleコードが含まれないことを確認。テスト・ビルド・実ブラウザーはroot担当が実行する。親の実モデル・費用は未確認・未計測。

- [Issue #36](https://github.com/komatsu-dev-jp/seller-assistant/issues/36)：作業と公開のチェックリスト。
- [AI App Delivery](https://github.com/users/komatsu-dev-jp/projects/1)：既存のやること一覧を利用。In Progressは作業中、Doneは完了。
- 未完成のGoogle共有コードと元の混在作業フォルダは保持し、このPRの片付け対象にはしない。
