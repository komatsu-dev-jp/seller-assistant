# 公開後の商品URLを保存する実装パケット

状態：実装・ローカル検証完了。承認済み範囲だけを扱い、訂正・他販売先は含めない。
開始日：2026-09-21 JST

## 解消する問題

実運用の `/workflow` には、本人が個人メルカリで公開した後の商品IDと商品URLを保存する場所がない。PC24〜26は承認デザインを確認する架空データ画面であり、実商品へ保存してはならない。このため、公開後URLを商品ごとにデータベースへ1回登録し、再読み込み後も同じ値を確認できる実運用パネルを追加する。

## 承認済み根拠

- `docs/specs/mvp-product-spec-v1.md` のMVP 8：個人版の手動引渡しと公開後URLの本人確認登録。
- `docs/design/mobile-ios-redesign-b-revision-prompts-v4.md`：販売先メルカリ、商品ID、商品URL、本人確認、1回登録。
- `docs/design/mobile-prompts-part2.md`：個人メルカリの公開URL形式は `jp.mercari.com/item/...`、公開済みかつ本人確認済みの場合だけ扱う。
- `docs/design/pc-web-redesign-prompts-v1.md` のPC24〜25：公開後に1回登録し、リンク先を自動で読み取らない。
- `docs/DECISIONS.md` の2026-08-26：URL先をサーバーから取得しない。

## 今回の固定範囲

- 個人メルカリだけを対象にする。販売先keyは `mercari`、表示名は `メルカリ` に固定する。
- 商品IDは `m` と数字、URLは厳密に `https://jp.mercari.com/item/<同じ商品ID>` とする。query、hash、別host、別IDを拒否する。
- 出品準備を本人確認済みにした実SKUだけ登録できる。これは公開済みの自動判定ではないため、登録時に別の本人確認チェックを必須にする。
- 1 SKU×販売先につき1回だけ保存する。同じ内容の再送は同じ結果を返し、異なる内容は409で止める。
- 同じ販売先商品IDを複数SKUへ登録できない。まとめ売りと訂正は今回の範囲外として、勝手に例外を作らない。
- 保存行は追記後に更新・削除しない。訂正・再出品の仕様が承認されるまで上書き導線を作らない。
- 確認者はログイン本人、確認日時はサーバー時刻とする。URLや商品ID全文を監査差分へ複製しない。
- サーバー・ブラウザともURL先を自動取得しない。外部ページは保存成功後、本人が明示的に押した場合だけ新規タブで開く。

## 変更可能範囲

- 新規forward migration `0047`。
- `packages/contracts` の専用request/response契約とテスト。
- `P0ItemRepository` の読取・1回登録、APIのGET/POSTとテスト。
- fresh/upgrade PostgreSQL試験とschema契約試験。
- 実運用 `/workflow` の専用パネル、表示用CSS、コンポーネントテスト。
- 本計画、handoff、検証証拠。

## 変更禁止範囲

- 既存migrationの書換え。
- PC24〜26の架空データを実SKUへ保存する処理。
- 訂正・削除・再出品、Yahoo!フリマ／オークション、Shops。
- 外部URLのfetch、スクレイピング、RPA、自動ログイン、自動出品、自動価格取得。
- 実データ、GitHub送信、Pages公開、PR作成・merge、有料サービス。

## 受け入れ条件

- 契約：正常なメルカリURLだけ通し、別host、HTTP、別ID、query/hash、未確認、余分な項目を拒否する。
- DB：workspace分離、SKU複合FK、管理権限、出品準備後、1 SKU×販売先1件、商品ID重複禁止、更新・削除権限なし、保存と監査の同一transaction。
- API：未認証401、workspace不一致403、非管理者403、不正入力400、異なる再送409、サービスなし503。同一再送は行・監査を増やさない。
- Web：読込中、未登録、入力、確認前停止、保存失敗、保存済みを区別する。SKU切替時に古い応答を混ぜない。保存成功後に再取得し、再読み込み後も同じ商品ID・URL・確認情報が残る。
- ブラウザ：右サイドパネルでPC幅と390×844の両方を操作し、保存、再読み込み、明示クリック、横あふれ0、console error 0を確認する。外部URLは検証中に実際には開かず、href・target・relを確認する。
- fresh/upgrade PostgreSQL、対象テスト、`npm run check`、`git diff --check`、別実行のAstraによる独立レビューを合格させる。

## 停止条件

- 訂正、複数販売先、まとめ売り、公開済みの自動判定が必要になった場合は実装を広げず、未決事項として戻す。
- URL先の存在確認や内容取得が必要になった場合は停止する。
- 既存workflow状態、権限、出品・注文・会計を弱める必要が出た場合は停止する。
- 原因不明のDB失敗、既存データ変更、対象外ファイルの競合を検出した場合は証拠を残して停止する。

## 2026-09-21 実装・検証結果

- 新規 `0047`、厳格な契約、認証済みGET/POST、追記専用DB保存、監査、実運用 `/workflow` パネルを実装した。PC24〜26の架空確認画面には接続していない。
- 右サイドパネルの初回確認で、PWA中継が新しいGET/POSTを許可しておらず404になる問題を再現した。UUID付きの完全一致パスだけをGET/POSTで許可し、PUT/PATCH・不正UUID・余分な階層を拒否する回帰テストを追加した。
- 新規の隔離PostgreSQL 18.6で46 migrationを適用し、fresh試験は66-table RLSを含めPASS。別の空DBによるupgrade試験も0001〜0047までPASSした。既存UI確認用DBは変更していない。
- Codex右サイドパネルで架空商品へ `m987654321` と対応URLを入力し、本人確認後の保存、GET読戻し、ページ再読み込み後の保持を確認した。リンクは正しい `href`、`target="_blank"`、`rel="noopener noreferrer"`。外部ページは開いていない。
- 390×844と1440×900で横あふれ0、console error/warning 0。DBは保存行1・対応監査1で、監査本文への商品ID・URL漏えい0。
- `npm run check` は104ファイル・792テスト、整形、静的解析、型、coverage、安全確認、API/Web本番ビルドまでPASS。別実行のAstra mediumは具体的なP1/P2 0件でPASSした。
- 証拠は `output/playwright/live-published-product-page-persistence-evidence.md`。実iPhone、実メルカリ商品、訂正・再出品、他販売先、複数端末は今回の合格範囲に含めない。
