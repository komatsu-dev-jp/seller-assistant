# A案・追補4画面の承認記録 v1

- 状態: **修正版Aにより旧版化。承認対象外**
- 作成日: 2026-08-20（JST）
- 対象: Claude Code第二次監査の採用分
- UI正本: 承認済みB「高速ワークベンチ」＋C「チーム・リレー」
- 製品判断: `docs/reviews/2026-08-20-opus-audit-reconciliation-v1.md`
- 全文プロンプト: `docs/design/opus-audit-extension-prompts-v1.md`

## 承認対象

| ID | ファイル | 寸法 | bytes | SHA-256 | Slack file ID |
|---|---|---:|---:|---|---|
| M13 | `mobile-13-solo-discrepancy-v1.png` | 1672×941 | 1,450,720 | `92A113D70F6CB6BB4FC8D83692FB86F23C58E9888EC135CFB94FD843C39C01FB` | `F0BRHDBQ2RF` |
| W11 | `web-11-solo-discrepancy-control-v3.png` | 1672×941 | 1,485,599 | `E2B7CB5C82EB8FFAC5CC7E6148DDD0B156829D15AB4FFD84672EF646D4054FA7` | `F0BRFE5LR50` |
| M14 | `mobile-14-accounting-readiness-v1.png` | 1672×941 | 1,355,768 | `077D1BDDFB0A2A611D7ED29D10A74838C904BF267E2F6E0BAFC0474199235FDE` | `F0BR981N81Z` |
| W12 | `web-12-accounting-profile-export-guard-v1.png` | 1672×941 | 1,333,509 | `A0FDD1D75E19336C7FC14DC0E5433786DE43C24A8845E275FCA59401F531B833` | `F0BRDGKGSQN` |

## Slack投稿

- Workspace: `P-evidence開発`
- Channel: `#メルカリ自動化`
- Channel ID: `C0BPZCB25T3`
- Parent TS: `1787201164.618709`
- Parent URL: https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787201164618709
- 依頼文: スレッドへ「この追補4画面で承認」と返信、または画面名と修正点を記載
- 再取得確認: 2026-08-20 13:54:56 JSTにユーザー本人 `U0ANCN37XM4` から返信TS `1787201696.138589` を確認した。承認文言ではなく、24時間待機の理由、Money Forward向けCSV、勘定科目候補の自動入力、用語ヘルプに関する質問・修正希望である。

## 目視確認

- 4画像をoriginal detailで確認した。
- M13は、人数による自動判定、初回報告、24時間待機、別session、証拠、最終確認、例外場所、監査を7画面で示す。
- W11は、選択行と詳細をともに「再確認可能」へ合わせ、残り時間を「経過済み」に修正した。待機中や2人承認待ちの別行は残す。
- M14は、会計4項目の未設定、人の設定、勘定科目対応、4区分の分離、停止理由、最終確認、取消/置換履歴を7画面で示す。
- W12は、未設定profile、mapping、出力不可/可能の比較、履歴、税務境界を一画面で示す。
- 実在マーケットのロゴ、自動出品、自動値下げ、AIによる税務決定、有料サービス、外部API、透かしは見当たらない。

## 生成と修正履歴

- M13、W11、M14、W12を各1回、新規生成した。
- W11だけ、選択行と詳細の矛盾を解消する限定編集を2回行った。v1/v2は承認対象から除外し、プロジェクト内の複製を削除した。画像生成元は保持している。
- 承認対象はW11 v3だけである。

## 次の停止点

本書の4画像は旧版として保持する。修正版モックをSlackで承認するまで、MVP仕様、技術設計、数式正本、AC/TA、Goal、Notion共有ミラー、実装を変更しない。
