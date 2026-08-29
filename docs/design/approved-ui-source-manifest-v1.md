# 承認済みUI・実装正本一覧 v1

- 更新日: 2026-08-27（JST）
- 状態: 実装用に固定
- 目的: 古い画像と最終修正版を混ぜず、各画面の参照元を一つにする

## PC版

| 画面   | 正本画像                                          |
| ------ | ------------------------------------------------- |
| 01〜04 | `pc-web-redesign-board-01-home-v1.png`            |
| 05〜08 | `pc-web-redesign-board-02-purchase-box-v3.png`    |
| 09〜12 | `pc-web-redesign-board-03-putaway-v4.png`         |
| 13〜16 | `pc-web-redesign-board-04-inspection-v1.png`      |
| 17〜20 | `pc-web-redesign-board-05-photo-measure-v1.png`   |
| 21〜24 | `pc-web-redesign-board-06-product-listing-v1.png` |
| 25〜28 | `pc-web-redesign-board-07-sales-support-v2.png`   |
| 29〜32 | `pc-web-redesign-board-08-orders-shipping-v3.png` |
| 33〜36 | `pc-web-redesign-board-09-inventory-v1.png`       |
| 37〜40 | `pc-web-redesign-board-10-team-v1.png`            |
| 41〜44 | `pc-web-redesign-board-11-analytics-v1.png`       |
| 45〜48 | `pc-web-redesign-board-12-accounting-v1.png`      |
| 49〜52 | `pc-web-redesign-board-13-settings-v1.png`        |

PC版は52画面で重複がなく、上表以外の同名v1〜v3は履歴として扱う。

## モバイル版・基本導線

| 画面   | 正本画像                                                         | 補足                                       |
| ------ | ---------------------------------------------------------------- | ------------------------------------------ |
| 01〜06 | `mobile-ios-redesign-b-board-01-entry-v2.png`                    | Cロゴ、入口、作業キュー                    |
| 07〜11 | `mobile-ios-redesign-b-board-02-purchase-v3.png`                 | 請求書ファイルを標準、レシートも選択可能   |
| 12〜16 | `mobile-ios-redesign-b-board-03-putaway-v2.png`                  | 全体承認を根拠に、現存する最終修正版を使用 |
| 17〜22 | `mobile-ios-redesign-b-board-04-inspection-v1.png`               | 気になる箇所の写真マーカーを含む           |
| 23〜28 | `mobile-ios-redesign-b-board-05-photo-measure-v1.png`            | 写真と採寸                                 |
| 29〜33 | `mobile-ios-redesign-b-board-06-product-info-v6.png` の先頭5画面 | 全写真の保存と編集方法の選択               |
| 34〜38 | `mobile-ios-redesign-b-board-07-shipping-v4.png`                 | 注文、取り出し、配送、発送                 |
| 39〜43 | `mobile-ios-redesign-b-board-08-exceptions-v2.png`               | 差異、返品、売上の事実                     |
| 44〜49 | `mobile-ios-redesign-b-board-09-accounting-v1.png`               | 会計設定、候補、ファイル、履歴             |

## モバイル版・承認済み追加フロー

番号が基本導線と重なる画像は内容を捨てず、別の画面キーで実装する。

| 画面キー                         | 正本画像                                              | 内容                                                                                   |
| -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `photo-01`〜`photo-07`           | `mobile-ios-redesign-b-board-06-product-info-v6.png`  | 撮影済み写真、保存先、ブランド・サイズ、編集レシピ、編集方法、編集用セット、加工後確認 |
| `box-01`〜`box-07`               | `mobile-ios-redesign-wholesale-box-inspection-v3.png` | 仕入箱登録、実数カウント、簡単登録、詳しい調査、見込み、実績、月別KPI                  |
| `sales-01`〜`sales-06`           | `mobile-ios-redesign-sales-support-v3.png`            | 見直し候補、状況、根拠、値下げ幅、行事、公式画面で本人操作                             |
| `genre-suit-01`〜`genre-suit-06` | `mobile-ios-redesign-b-board-10-genre-guide-v2.png`   | スーツ・セットアップの構成品別撮影ガイド                                               |

## 文言の扱い

- 画面名と主ボタンは、画像の最終修正版を優先する。
- 基本画面番号と画像内番号が衝突する場合、画像の内容を上書きせず追加キーへ分ける。
- 難しい用語へ戻さず、承認済みの初心者向け日本語を使う。
- 画像内の架空値は動的データへ置き換えられるが、構造・表示順・状態色は変えない。

## 承認根拠

- モバイル最終承認: Slack親TS `1787631209.774569`
- PC最終承認: Slack親TS `1787754933.967639`
- PC03 v4: Slack file ID `F0BSM3XPRQF` / TS `1787818024.476329`
- 詳細: `mobile-ios-redesign-approval-v1.md`、各 `revision-index`、`pc-web-redesign-revision-index-v4.md`
