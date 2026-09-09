# PC版Web・全画面モック一覧 v1

- 作成日: 2026-08-26（JST）
- 状態: 9枚はコメントなしで維持、PC07 v2は`問題なし`、PC02・PC03・PC08はv3再承認待ち
- 画面正本: `pc-web-redesign-screen-map-v1.md`
- 生成プロンプト: `pc-web-redesign-prompts-v1.md`
- 承認先: Slack `#メルカリ自動化`
- Slack親メッセージ: `1787754933.967639`
- Slack URL: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787754933967639>
- 最新の修正版一覧: `pc-web-redesign-revision-index-v3.md`

次の表は最初に送ったv1の履歴である。現在の承認対象は、PC02・PC03・PC08がv3、PC07が問題なしとなったv2、その他9枚がv1である。

| Board | ファイル | 画面 | 寸法 | SHA-256 | Slack file ID | Slack TS |
| --- | --- | --- | --- | --- | --- | --- |
| PC01 | `pc-web-redesign-board-01-home-v1.png` | 01〜04 | 1536×1024 | `6337094fc0ebef05ee54cba0ca20850ed37466a1a874ae073b83d52d78e539ed` | `F0BSE82CW4F` | `1787754976.628869` |
| PC02 | `pc-web-redesign-board-02-purchase-box-v1.png` | 05〜08 | 1536×1024 | `d26cfde807758c1e8ae4f3a59d1f8649791f2f75c96ec9523e8b45308e4f73ef` | `F0BSE844E5D` | `1787754989.014169` |
| PC03 | `pc-web-redesign-board-03-putaway-v1.png` | 09〜12 | 1536×1024 | `7ce6aa4a60a1bed96b9999a664d3c0d6273d39e05baef4fd0e39a66bf95582fc` | `F0BSTLN3ZE2` | `1787754969.281539` |
| PC04 | `pc-web-redesign-board-04-inspection-v1.png` | 13〜16 | 1536×1024 | `43526af22fa9aed6d0aef3d8972d95234f63fcce1a7bfff6bd54b839d38a20ad` | `F0BSXGR4ZMX` | `1787754982.090069` |
| PC05 | `pc-web-redesign-board-05-photo-measure-v1.png` | 17〜20 | 1536×1024 | `551244f9508c53a8e10538b48b7a801e9e5235b5b5ca0943f5e23973383d5a46` | `F0BSE896REK` | `1787755030.993109` |
| PC06 | `pc-web-redesign-board-06-product-listing-v1.png` | 21〜24 | 1536×1024 | `8b76d507afd1159c137dfe6b632d870f9b1693a2f712d56621e1688e540ebb18` | `F0BTQ0GU6GG` | `1787755015.805859` |
| PC07 | `pc-web-redesign-board-07-sales-support-v1.png` | 25〜28 | 1536×1024 | `0e2e6c3fc3a207a66c74ef9febb5b0547b94773a7679abac82dfc39522859411` | `F0BSZ9HRPEG` | `1787755022.146049` |
| PC08 | `pc-web-redesign-board-08-orders-shipping-v1.png` | 29〜32 | 1536×1024 | `3037d0dd44140f63425cbaafd7fb4bc53444d7ffa7a0609ecfc23dd18f4c9bdb` | `F0BSRKEEFD3` | `1787755008.593169` |
| PC09 | `pc-web-redesign-board-09-inventory-v1.png` | 33〜36 | 1536×1024 | `96e5acbf1e2d7bd9a473878d6f7a91f0e4e5535e588d27522906a4ada5c6d097` | `F0BTQ0S9CRW` | `1787755077.473089` |
| PC10 | `pc-web-redesign-board-10-team-v1.png` | 37〜40 | 1536×1024 | `0ae16bd9ea1a0e1b66a8cc348704c8e843ef3e225410a9cb5ea5ba9e6f3d52dd` | `F0BSXH1D6QZ` | `1787755049.864809` |
| PC11 | `pc-web-redesign-board-11-analytics-v1.png` | 41〜44 | 1536×1024 | `e753a3525fb4660ff7b872118c0c1e962b53c6c6cf7fff902c48ce292f468da1` | `F0BTQ0PLS8Y` | `1787755059.291199` |
| PC12 | `pc-web-redesign-board-12-accounting-v1.png` | 45〜48 | 1536×1024 | `a5bb863c2fa61ea8f243a08cb9491147fc50ea0fc3c4a7b02d424387c7d834b6` | `F0BSE8FU34P` | `1787755067.744619` |
| PC13 | `pc-web-redesign-board-13-settings-v1.png` | 49〜52 | 1536×1024 | `edb67d46c49353ad080d1efdcc398cc502889857213470af698f7dcc26cc0106` | `F0BSZ9T8M36` | `1787755091.912299` |

## 画像QA

- PC01〜PC13の13枚、画面01〜52を重複なく収録した。
- 全画像は1536×1024で、4画面ずつ同じ読み順に配置した。
- 実在ブランド名と架空URLを除き、配送方法は一般名へ置き換えた。
- 外部連携、自動出品、自動更新を有効に見せる表現は使っていない。
- これらは承認用モックであり、実装済み画面を示す証拠ではない。

## 変更しない安全条件

- モバイル最終承認と同じ言葉・判断境界を使う。
- 自動出品、自動値下げ、自動返信、外部サイトの自動取得・操作、会計の自動確定を表示しない。
- PC内非公開の写真原本、手動書き出し、人の確認を維持する。
- 画像内の細かな文字は参考で、正確な画面名と導線は画面正本を使う。
