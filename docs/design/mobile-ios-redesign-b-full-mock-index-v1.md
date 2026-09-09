# スマホ版B+C統合モック 納品一覧 v1

- 更新日: 2026-08-25
- 状態: 画像QA完了 / Slack送信・再読確認済み
- 採用方向: B案「iOS現場カード」＋C案「写真上の気になる箇所チェック」
- 対象: P0の全49画面と、商品種類別の撮影ガイド
- 承認元: Slack `#メルカリ自動化` 親TS `1787631209.774569`、明示返信TS `1787633592.565739`
- 画像生成: Codex内蔵の画像生成を使用。利用者の外部API契約、APIキー、課金サービスは使用していない。

## 納品画像

| No. | ファイル | 画面 | 内容 | 大きさ | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `mobile-ios-redesign-b-board-01-entry-v1.png` | 01–06 | ログイン、初期設定、ホーム、作業キュー | 1672×941 / 1,352,637 bytes | `4e677ad6c96c54d9018dcec3f6b63d163ea8e7db3e66dafe81597c2169d98806` |
| 2 | `mobile-ios-redesign-b-board-02-purchase-v1.png` | 07–11 | 仕入れ入力、レシート、商品登録 | 1672×941 / 1,409,854 bytes | `6ac0536353cada7ab69977d4a5388af02bc87bd1c73e1d11b52fc06b16212f0d` |
| 3 | `mobile-ios-redesign-b-board-03-putaway-v1.png` | 12–16 | 在庫番号、保管場所、場所写真、棚入れ | 1672×941 / 1,382,532 bytes | `ea381c27ffd40f3a3e0b52bf2d61bcc1284629285279ef46fb445c80215e872a` |
| 4 | `mobile-ios-redesign-b-board-04-inspection-v1.png` | 17–22 | 検品、気になる箇所、写真上の番号マーカー | 1672×941 / 1,402,455 bytes | `78e9a6ca411adecb88a1773fb4746f531aaa7c00f2a37e798480e36073abcedc` |
| 5 | `mobile-ios-redesign-b-board-05-photo-measure-v1.png` | 23–28 | 撮影、撮り直し、採寸、確認 | 1672×941 / 1,616,939 bytes | `3722ef0aa43475be37c784938536ad369fa317f4a3f8c2120515938184b6361c` |
| 6 | `mobile-ios-redesign-b-board-06-product-info-v1.png` | 29–33 | 商品情報、説明文候補、公開前の確認 | 1672×941 / 1,410,948 bytes | `67d488a8ace83669deb825adb80591142b08cec5447201c32fef7c73daf17f0f` |
| 7 | `mobile-ios-redesign-b-board-07-shipping-v1.png` | 34–38 | 売れた商品、梱包、発送、受取確認 | 1672×941 / 1,403,264 bytes | `eac2fb1730d7866f504909328403398ce6485272d9ab2a6bc214cbfeeb3f8d2d` |
| 8 | `mobile-ios-redesign-b-board-08-exceptions-v2.png` | 39–43 | 数量差異、商品不明、返品、売上事実 | 1672×941 / 1,434,033 bytes | `da967c185a054e0cb3c5ad7e16b6cccf58ca0b34da3328375114eeb3e76185b8` |
| 9 | `mobile-ios-redesign-b-board-09-accounting-v1.png` | 44–49 | 会計候補、根拠、確認、CSV受け渡し | 1672×941 / 1,451,913 bytes | `2c94379a556256bfa560bffa31402c854f17899b9e4a485ab09247d8cdc0a445` |
| 10 | `mobile-ios-redesign-b-board-10-genre-guide-v1.png` | 20の状態違い | 商品種類別の撮影チェック項目 | 1672×941 / 1,380,939 bytes | `c07c1ba5210c7f2b48933fc6295401b25faeece597773026f5e19de53e38e148` |

`mobile-ios-redesign-b-board-08-exceptions-v1.png` は、各画面の上部タイトルが同じだったため不採用とした。送信・実装参照には修正版の `v2` だけを使用する。

## 画面網羅の確認

- ボード1〜9で画面ID 01〜49を重複なく網羅している。
- ボード10は新しい画面IDではなく、画面20「撮影ガイド」の商品種類別状態を補足する。
- 対応する正確な文言と画面遷移は `mobile-ios-redesign-screen-map-v1.md` を正本とする。生成画像内の細かな文字は実装用コピーの正本にしない。
- フッターは `ホーム / 作業 / 商品 / 在庫 / 会計` を基本としている。
- 実在のアカウント名、商品ID、出品画像、住所、売上データはモックへ使用していない。

## 撮影と検品の反映

- トップス、ニット、ジャケット、パンツ・スカート、ワンピース、バッグで撮影チェック項目を切り替える。
- 「未確認」「問題なしを確認」「気になる点あり」を分け、確認していない状態を問題なしとして保存しない。
- シミ、傷、ほつれなどは写真をタップして番号を置き、場所、種類、程度、補足写真を関連付ける。
- AIや画像認識は候補だけを提示し、人が確認して保存する。
- 詳細ルールは `mobile-ios-redesign-genre-capture-v1.md` を参照する。

## 実装前に残る確認

- 現行の写真roleと固定pilotを勝手に増やさず、`写真チェック項目 / 検品部位 / 気になる点 / 証拠写真` の関係をSolが設計する。
- 今回はデザインモックと仕様資料まで。実装コード、公開、本番反映、PR、マージは行っていない。
- 実際のiPhoneでの読みやすさ、指で押しやすい大きさ、カメラ操作は実装後に実機確認が必要。

## Slack送信記録

- 送信先: `#メルカリ自動化`
- 親スレッド: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787631209774569>
- 案内メッセージ: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787635930034649?thread_ts=1787631209.774569&cid=C0BPZCB25T3>
- 完了メッセージ: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787636090930069?thread_ts=1787631209.774569&cid=C0BPZCB25T3>
- 再読確認: 2026-08-25 14:34 JST時点でスレッド17返信、今回の10画像すべてをファイル名とIDで確認した。
- Slack file IDs:
  - 1: `F0BS0M0LBFZ`
  - 2: `F0BSE490ATY`
  - 3: `F0BSKNH4X9A`
  - 4: `F0BSE4BA946`
  - 5: `F0BSKNKFPFE`
  - 6: `F0BSC5NRLAH`
  - 7: `F0BS0M750F9`
  - 8: `F0BS9R2LY03`
  - 9: `F0BSE4FMADC`
  - 10: `F0BS9R47VU3`
