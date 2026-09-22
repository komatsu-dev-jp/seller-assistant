# Safariに古いレビュー画面が残る

- status: candidate
- 対象: 公開レビューPWAのService Worker
- 利用者報告: PR #16/#17公開後もSafariの全ページに9:41・疑似電池・島の表示が残る。
- 確認事実: 現ソースには疑似端末markupがない。旧installは全公開ファイルの取得・保存が成功するまでskipWaitingしないため、通信・保存1件の失敗で旧workerを置き換えられない。単なる新URL追加は既存URLの更新完了を証明しない。
- 未確認: 利用者端末で実際に失敗したファイルとSafariログは取得していない。
- 公開確認: `https://komatsu-dev-jp.github.io/seller-assistant/mobile/__next.mobile/__PAGE__.txt` と `https://komatsu-dev-jp.github.io/seller-assistant/mobile/screens/01/__next.mobile/screens/$d$screen/__PAGE__.txt` がHTTP 404。両方とも旧installの必須先読みリストに含まれるため、旧処理の更新失敗条件が公開先で成立している。
- 対策: 全先読みをinstallの条件から外す。実workerを動かす失敗系テストと、旧cacheから既存URLが更新する確認を受け入れ条件へ追加する。
- 教訓への昇格: 独立レビュー・公開検証と重複確認が完了するまでcandidateのまま保持する。
- 追加原因: activateのwaitUntil内でclient.navigate完了をawaitすると、navigation fetchがactivatedを待つため循環待ちになる。初回VMテストのnavigateは即解決するmockだったため見逃した。未解決のnavigate Promiseを使う回帰テストを追加し、activateはnavigateを要求したら完了させる。
- 継続報告: PR #19公開後も本人の正しい`/mobile/screens/04/` URLに旧表示が残る。公開ファイル一致や別ブラウザ合格を、本人のSafariでの解消と同一視しない。端末固有の原因は未確認。
- 復旧経路: `refresh.html`で利用者のclick時だけ自アプリのworker登録を解除する。既存入力・写真・cacheは消去しない。VMテストと旧workerを使った実ブラウザ試験で、新画面への移動と架空入力の保持を確認した。利用者端末の解消確認まではcandidateを維持する。
