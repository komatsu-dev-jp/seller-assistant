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

### P12-A contracts・migration最終結果（2026-08-29）

- 状態: PASS。構造化した検品結果と気になる箇所のDB・公開contractを追加し、実PostgreSQLと独立Sol最終reviewまで合格した。
- リスク: 重大。private写真、担当権限、追記履歴、RLS、pilot入力を横断する。
- 実装担当: `gpt-5.6-sol` / `max`。共有worktreeの唯一のsource書き込み担当とする。
- 確認担当: 実装を担当しない別の`gpt-5.6-sol` / `max`。P12-B以降へ進む前に差分・test・migrationを判定する。
- 変更可能: 新規`0034` migration、`packages/contracts/src/index.ts`と対応test、`packages/db/src/schema.test.ts`、fresh/upgrade PostgreSQL testの0034対応。既存migrationは変更しない。
- 変更禁止: API/Web、発送状態、注文・金額、P13/P14、外部service、公開、PR merge、実データ。
- データ契約:
  - `inspection_check_result`はSKU、検品項目、カテゴリ、定義版、`unconfirmed / no_issue_confirmed / concern_present`、revision、`supersedes`、作成者・確認者・時刻を持つ。
  - `inspection_concern_revision`は変更しないconcern ID、revision、検品項目、部位、marker元写真、0〜1相対座標、種類、程度、全体写真、任意の接写写真、短いmemo、人の確認状態、作成者・確認者・時刻を持つ。
- 不変条件:
  - 写真uploadまたはAIだけで`no_issue_confirmed`や人の確認済みにしない。
  - 見える不備は同一SKUのmarker元写真と全体写真を必須にする。におい等の写らない不備だけは写真省略可とし、説明と別の人の確認を必須にする。
  - 元写真、検品結果、不備内容を更新・削除せず、訂正は新revisionとして追加する。
  - 別workspace、別SKU、担当外、作成者本人だけの確認をAPI以前にDBでも拒否できる契約にする。
  - original storage keyと秘密情報を公開contractへ出さない。
- 受け入れ条件: schemaの未知field拒否、条件付き必須、座標範囲、revision連鎖、同一SKU写真、RLS、追記専用、自己確認拒否、権限外拒否をtestできる。既存データ入りupgradeで履歴を変更しない。
- 検証: contracts unit、migration静的contract、`npm.cmd run check`、fresh PostgreSQL、既存データupgrade PostgreSQL。実DBを実行できない状態ではP12-Aを合格扱いにしない。
- 停止・昇格条件: 既存写真・pilotの意味を変更する、元記録を更新する、self approvalを許す、またはP13/P14へ波及する必要が出たら変更を広げずルートへ戻す。
- 最終証拠:
  - fresh PostgreSQL 18.6: 34 migration、53-table RLS、最新状態の完全一致、自己確認・越境・期限切れ担当拒否、2接続の実Lock競合で成功1／拒否1、枝分かれ0をPASS。
  - upgrade PostgreSQL 18.6: SKU、media、pilot、finance、CSV bytes/hash、auditの更新前後一致をPASS。
  - root check: 34 files / 253 tests、coverage 84.66 / 80.56 / 100 / 90.68、format/lint/typecheck、86 routes buildをPASS。
  - 独立Sol max: Critical 0 / High 0 / Medium 0 / Low 0。P12-A PASS、P12-B technical gate GO。

### P12-B 商品別項目の確認gate（2026-08-29）

- 技術gate: GO。写真の具体的項目`shot_key`と既存5分類`role`を分離し、承認済みmobile20、写真v6、PC13を同時に維持する。
- 製品gate: 利用者確認待ち。PC13は6種類の件数だけを固定しており、具体的な検品・撮影・採寸項目と必須／任意を確定していない。
- 確認資料: `docs/implementation/p12-product-template-proposal-v1.md`。推奨A／代替Bと、パンツ／スカートを別テンプレートへ分けるかの2点だけを確認する。
- 停止条件: 利用者確認前に0035 migration、初期データ、API、実運用画面へ提案値を書き込まない。静的review routeの見た目を変更しない。

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
