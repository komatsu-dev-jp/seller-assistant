# B採用・Slackコメント反映モック一覧 v2

- 作成日: 2026-08-26（JST）
- 対象スレッド: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787631209774569>
- 画像生成: Codex内蔵ImageGen。外部APIキー・有料APIは不使用
- 状態: Slackの同じスレッドへ7枚を送信し、ファイル名・file ID・本文を再読確認済み

## 修正版

| 対象 | ファイル | 画像情報 | SHA-256 | 再承認内容 |
|---|---|---|---|---|
| Board 01補足 | `mobile-ios-redesign-logo-login-concepts-v1.png` | 1672×941 / 994,152 bytes | `f6289117b1172ca6b5ce4e9fcb537ee7fb2f1a303bb18c056750310c96b7bc24` | ロゴA・B・Cから1案を選ぶ |
| Board 02 | `mobile-ios-redesign-b-board-02-purchase-v2.png` | 1672×941 / 1,466,423 bytes | `7822f92e8693f26b475cf72e10edd5de24efbcbf494bbc5bdf4bc6fe277792c4` | 請求書中心・レシートも選択可 |
| Board 03 | `mobile-ios-redesign-b-board-03-putaway-v2.png` | 1672×941 / 1,503,744 bytes | `4a23cc77b2f7de4920e50e497613ee89de32cba4003b7a15d799121eed94f8fa` | 商品ラベルを読む工程の選択・省略 |
| 追加設定 | `mobile-ios-redesign-workflow-settings-v1.png` | 1672×941 / 1,282,653 bytes | `f987838e1219cf89c3074018543c778713f015d77a5ce084281bea2acd51aff6` | 1人／チーム、仕入れ書類、読取、梱包写真 |
| Board 06 | `mobile-ios-redesign-b-board-06-product-info-v2.png` | 1672×941 / 1,501,440 bytes | `9a1079ff1569c0259c3e6c460950dbb3434b2119f2cbd2af7ada64254973642e` | タグ文字候補、ブランドマーク候補、写真の手動受け渡し |
| Board 07 | `mobile-ios-redesign-b-board-07-shipping-v2.png` | 1672×941 / 1,367,740 bytes | `4c6abe740aa9f402c21843dbf398b3f88635b1ca67e810b141dfce11107d3a0d` | 1人運用では梱包写真を非表示 |
| Board 10 | `mobile-ios-redesign-b-board-10-genre-guide-v2.png` | 1672×941 / 1,404,849 bytes | `4c89e9e37688b2b7183847b1a23cfa7aa07f754e8ba0e3b12ed12356550a8f00` | スーツ・セットアップ追加 |

## 変更しない承認済み画像

- Board 04（画面17〜22）
- Board 05（画面23〜28）
- Board 08（画面39〜43）
- Board 09（画面44〜49）

## Slack送信確認

- 案内メッセージ: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787723267858719?thread_ts=1787631209.774569&cid=C0BPZCB25T3>
- 完了メッセージ: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787723441007629?thread_ts=1787631209.774569&cid=C0BPZCB25T3>

| ファイル | Slack file ID | 投稿TS |
|---|---|---|
| `mobile-ios-redesign-logo-login-concepts-v1.png` | `F0BSVG9625A` | `1787723306.321839` |
| `mobile-ios-redesign-b-board-02-purchase-v2.png` | `F0BSVG9L812` | `1787723316.132149` |
| `mobile-ios-redesign-b-board-03-putaway-v2.png` | `F0BSKJPBQ4T` | `1787723325.057299` |
| `mobile-ios-redesign-workflow-settings-v1.png` | `F0BSRRAJ2P4` | `1787723334.043719` |
| `mobile-ios-redesign-b-board-06-product-info-v2.png` | `F0BSPTP83V4` | `1787723341.294029` |
| `mobile-ios-redesign-b-board-07-shipping-v2.png` | `F0BSTPUF4L9` | `1787723348.763299` |
| `mobile-ios-redesign-b-board-10-genre-guide-v2.png` | `F0BSTPVUQRX` | `1787723356.147019` |

Slackスレッドを投稿後に再読し、上記7件のファイル名、本文、file IDが一致し、次ページがないことを確認した。

## 元コメントのSlackメッセージ

| 対象 | TS |
|---|---|
| Board 01 | `1787635957.140849` |
| Board 02 | `1787635966.108579` |
| Board 03 | `1787635974.366729` |
| Board 06 | `1787636017.382579` |
| Board 07 | `1787636024.407639` |
| Board 10 | `1787636062.075589` |

## 未確定

- ロゴは3案のうち1案が選ばれるまでBoard 01へ固定しない。
- Photoroomブラウザ自動操作は現行の共通ルールとP0仕様に反するため、修正版には含めていない。
- Slackの再承認前に実装へ反映しない。
