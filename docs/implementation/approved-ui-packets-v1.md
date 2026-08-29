# 承認済みUI・Goal継続パケット v1

- 状態: active
- 更新日: 2026-08-27（JST）
- 運転: cost-optimized、共有worktreeは書き込み担当1人
- 正本: `../specs/approved-ui-integration-addendum-v1.md`

## P10 仕様と承認証拠の統合

- リスク: 低
- 担当: ルートCodex。Luna maxは読み取り専用の差分監査のみ。
- 変更: デザイン正本、Goal追補、AC/TA、受け入れ対応表、決定記録。
- 合格: 最新Slack file ID/TS、P0/P1、無料・外部接続なし、人の確認が矛盾しない。
- 検証: Markdown参照、秘密形状0件、`git diff --check`。

## P11 商品別バーコードとスマホ商品検索

- リスク: 中。Webカメラ、印刷、権限内の商品表示を扱うが、DB・状態遷移は変更しない。
- 担当: Terra high相当のWeb実装。ルートCodexが唯一の書き込み担当として統合する。
- 変更可: `apps/web/package.json`、lockfile、在庫ラベル/商品検索の新規Web component・route・helper・test、`globals.css`、在庫/モバイルの入口。
- 変更禁止: DB migration、API権限拡大、在庫状態変更、外部runtime通信、CDN、実個人データ。
- 合格: 1商品1ラベル、最大24枚、番号重複なし、Code 128と人が読める番号、ブラウザ内読取、手入力fallback、検索だけで状態変更0件。
- 検証: helper/unit/contract、`npm.cmd run check`、PC/iPhone幅、印刷preview、loopback以外のrequest 0。実iPhoneは未確認なら明記する。
- 昇格: field_worker検索、API/DB変更、ラベル版契約変更が必要ならSol maxへ渡す。

## P12 気になる箇所と全写真

- リスク: 重大。写真・状態・監査・pilotを横断する。
- 設計/実装: Sol maxがデータ契約を固定。Web表示はTerra high、定型fixtureはLuna max。
- 合格: 位置、場所、種類、程度、証拠写真、メモ、確認状態が欠損なく結びつき、原本不変・外部送信0・AI自動確定0。
- 検証: contracts/API/DB/Web、写真原本/派生、権限、pilot回帰、実画面。

## P13 選択式の発送前写真

- リスク: 重大。金額、非公開写真、発送状態、権限を横断する。
- 設計/実装: Sol max。Web表示だけの分離後にTerra highを使える。
- 合格: 3設定、高額目安、金額未入力時の人の選択、写真非公開、外部送信0、写真だけの発送確定0。
- 検証: contracts/API/DB/Storage/権限/金額欠損/再送/監査/Web。

## P14 本人操作支援と用語整合

- リスク: 中。外部画面への本人操作と注文の任意項目を含む。
- 担当: Terra high。API/DB項目変更が必要ならSol max。
- 合格: 検索語と質問文はコピーだけ、外部自動取得/送信0、予想価格は人が確認、取引ID不明でも作業継続、固定フッターと易しい日本語。
- 検証: route/contract/UI、外部request 0、キーボード/44px/390・768・1440px。

## 再評価

P11〜P14のP0差分後に、P04自動検証、P05 UI評価、P06実利用者pilot、P07証拠整合、P08独立Sol最終レビューを新しい同一SHAでやり直す。P1はP0合格前に開始しない。
