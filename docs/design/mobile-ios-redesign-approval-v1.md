# スマホ版 iOS 再設計・Slack 承認記録 v1

- 記録日: 2026-08-25
- 状態: **B案を承認済み。C案の気になる箇所チェックを統合**
- 承認方法: Slack スレッドへ `A`・`B`・`C` のいずれか1文字を返信
- 高精細モックの作成範囲: 採用された1案で全49ページ
- 実装状態: 高精度モック10枚をSlackへ送信済み。アプリ実装は未着手

## 承認先

- Workspace: `P-evidence開発` (`T0AP92FGR4G`)
- Channel: `#メルカリ自動化` (`C0BPZCB25T3`)
- Parent message TS: `1787631209.774569`
- Slack URL: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787631209774569>

## 比較対象

| 案 | 方向性 | ローカル成果物 | 画像情報 | SHA-256 | Slack file ID |
|---|---|---|---|---|---|
| A | iOSかんたんガイド（推奨） | `docs/design/mobile-ios-redesign-concept-a-guided-v1.png` | 1672×941 / 1,355,532 bytes | `3263B89F28B6057ACB27D7CD1F7F5CE3728D94625CDAB2C765C651CA8C9A1075` | `F0BS09X0RGF` |
| B | iOS現場カード | `docs/design/mobile-ios-redesign-concept-b-task-cards-v1.png` | 1672×941 / 1,437,063 bytes | `1434BF4E575A434360A3483B9FF47F02934782C64C144CC77A8202C2AC9CE710` | `F0BSBPU12NR` |
| C | iOSカメラフォーカス | `docs/design/mobile-ios-redesign-concept-c-camera-focus-v1.png` | 1672×941 / 1,576,133 bytes | `0FB3DCC13F08704C9A2BFED6CDF5C2A5EB1CF0A01790E058C08EFAC13DB0DE70` | `F0BTA29FU3A` |

共通の全49ページ一覧は `docs/design/mobile-ios-redesign-screen-map-v1.md`、Slack file ID は `F0BSDNJPYG6`。

画像生成には Codex 内蔵の ImageGen を使用した。プロンプトは `docs/design/mobile-ios-redesign-concept-prompts-v1.md` に保存している。外部の有料APIやAPIキーは使用していない。

## 承認として数えないもの

親投稿に付いている `:one:`・`:two:`・`:three:` の3リアクションは、ChatGPTが候補表示として付けたもの。Slack接続ユーザー名で表示されるが、利用者本人の選択ではないため承認として扱わない。親投稿にも同じ注意書きを追記済み。

画像を添付した4件のスレッド返信も、ChatGPTがファイル説明として送信したものなので承認ではない。

## 有効な選択

- 返信者: Yuto（依頼者本人）
- Reply TS: `1787633592.565739`
- 選択: B案
- 統合する修正: C案の、シミなど気になる箇所へ写真上でチェックを付ける機能
- 追加指示: 利用者提供の公開出品例を確認し、ジャンル別の写真の撮り方を撮影フローへ組み込む
- プライバシー境界: 公開出品例は代表商品の画面を手動で目視するだけとし、アカウント名、URL、商品ID、実画像をGitやモックへ保存しない

## 次のゲート

1. ~~利用者が同じSlackスレッドで1案を選ぶ。~~ 完了
2. ~~Codexが返信者、時刻、選択、修正点を確認する。~~ 完了
3. ~~`selected-direction.md` と `docs/DECISIONS.md` に採用判断を追記する。~~ 完了
4. ~~B案＋C機能を全49ページへ展開し、9枚の高精細ボードとして同じSlackスレッドへ送る。~~ 完了。9枚＋商品種類別の補足1枚を送信
5. ~~全ページ承認後にアプリ実装へ反映する。~~ 2026-08-26に最終修正版まで承認完了。実装反映はPC版モック承認後に行う。

## 2026-08-26 最終承認

- v2〜v6の画像コメント修正を経て、コメント対象A・Cへ依頼者本人がそれぞれ`問題なし`と追記した。
- A file ID: `F0BST62CL78`、TS: `1787751903.529929`
- C file ID: `F0BSNSJMJKV`、TS: `1787751913.898589`
- コメントのなかったB、既承認のD、以前に問題なしと確認済みの画像を含め、モバイル版の内容確認は完了とする。
- 最終承認元: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787631209774569>
- 次は、同じ用語・安全境界をPC版Webモック全体へ反映して再承認する。

## 高精度モック送信結果

- 送信日時: 2026-08-25 14:32〜14:34 JST
- 送信内容: 画面01〜49の9枚と、画面20の商品種類別表示1枚
- 送信確認: Slackスレッドを再読し、10ファイルすべてのファイル名とIDを確認
- 完了メッセージ: <https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787636090930069?thread_ts=1787631209.774569&cid=C0BPZCB25T3>
- 詳細一覧: `docs/design/mobile-ios-redesign-b-full-mock-index-v1.md`
