# B採用・Slack再コメント反映モック v3 一覧

- 作成日: 2026-08-26（JST）
- Slack: `#メルカリ自動化`
- 親スレッドTS: `1787631209.774569`
- 正確な仕様: `mobile-ios-redesign-slack-revisions-v3.md`
- 画像生成指示: `mobile-ios-redesign-b-revision-prompts-v3.md`
- 状態: Slack送信・再読確認済み、利用者の再承認待ち
- 送信案内TS: `1787728713.840109`
- 送信完了TS: `1787728891.213449`

## 再確認する6画像

| 順番 | ファイル | 内容 | 寸法 | SHA-256 | Slack file ID |
|---:|---|---|---|---|---|
| 1 | `mobile-ios-redesign-b-board-01-entry-v2.png` | Cロゴを反映した入口 | 1672×941 | `d024d0ba5e2d59fd856494d1f059b5a5279531aa43aa7404d50dab3ef0515559` | `F0BSL5J3QRH` |
| 2 | `mobile-ios-redesign-b-board-02-purchase-v3.png` | メール添付・Files・請求書確認 | 1672×941 | `5394e85a7945e8edbfbc293201deffab6ab867f05e673c6e25edacf84a08c544` | `F0BTLPKR64Q` |
| 3 | `mobile-ios-redesign-inventory-label-methods-v1.png` | 在庫番号の手書き／印刷案 | 1672×941 | `9d9142d3c10b4ec38ffb3fd0fe4bea69c5ef5b0de7f446f17d64c3ef5b0a89ef` | `F0BSQEK3J5C` |
| 4 | `mobile-ios-redesign-sales-support-v1.png` | 販売中の価格・返信サポート | 1672×941 | `17a6ca483a08585022151988a49f3e3391f537e96c2a88fcc5b14f2d743f9191` | `F0BSB22K1ST` |
| 5 | `mobile-ios-redesign-b-board-06-product-info-v3.png` | Photoroomへの手動フォルダ受渡し | 1672×941 | `5c5471feb222cfc699d74e6ea88bdcd1b3eda09e73743db436f9f78085bbdc49` | `F0BSW3CNJ6Q` |
| 6 | `mobile-ios-redesign-b-board-07-shipping-v3.png` | 販売先別の配送方法 | 1672×941 | `da1dc092c325ee7b4f809c7491473042bb0ecdfe5db8011b1a53e34450b72186` | `F0BSNE1DC05` |

## 維持する承認済み画像

- Board 04、05、08、09: 画像本文に修正コメントがないため維持する。
- Board 10 v2: 画像本文の `問題なし` により承認済み。v3では再生成・再送しない。

## 実装状態の注意

- 在庫番号の生成、チェック数字、手入力、再発行履歴は現行実装に存在する。
- バーコード／QR描画、A4ラベル配置、ブラウザ印刷は追加案であり未実装。
- この6画像は再承認用モックであり、実装完了や外部サービス接続の証拠ではない。
