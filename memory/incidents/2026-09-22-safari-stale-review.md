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
