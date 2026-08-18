---
name: app-development-orchestrator
description: Codexの個人skill「app-development-orchestrator」をClaude Code向けに移植した司令塔skill。現在地の確認から検証済みDraft PRまで、企画調査→製品/MVP承認→UI/UX3方向案→承認→Notion仕様→開発基盤→Goal実装→評価Loop→独立レビュー→Draft PRを一つの流れで進める。ユーザーが「一気通貫で進めて」「現在地の確認からDraft PRまで」「Codexと同じ流れで」「app-development-orchestratorを使って」と言った場合、または新規/既存アプリの企画からGoal実装までを通しで頼まれた場合は必ずこのskillを使うこと。製品方向・UI/UX方向・完成像それぞれの承認ゲートを飛ばして画面モック・詳細仕様・Goal・実装に進むことを絶対にしない。
---

# app-development-orchestrator（Claude Code版）

Codex個人skill「app-development-orchestrator」の司令塔ロジックをClaude Code環境に合わせて移植したもの。元定義: Notion `Codexの拡張・設定 > app-development-orchestrator`。

## このskillの位置づけ

`AGENTS.md`は「ルートCodexをユーザーとの一つの窓口にする」と定めているが、ユーザーがClaude Codeへ直接この一気通貫フローを依頼した場合は、このskillがCodexの代わりに司令塔を担う。他エージェント（Codex）が同じリポジトリで並行作業している可能性があるため、**フェーズ0で必ず`handoffs/active/`を確認し、担当範囲・ブランチを申し送りへ記録**してから進める。同じファイルを別エージェントと同時編集しない。

## 絶対に超えない停止ゲート（3箇所）

Codex版と同じく、以下の3点は**ユーザーの明示的な選択がない限り絶対に先へ進まない**。

1. **製品方向承認前** → UI/UX画像案、画面モック、詳細仕様、Goal、実装のいずれにも進まない。
2. **UI/UX方向承認前** → Notion仕様の高精度化、Goalに進まない。
3. **完成像（完成像・MVP・対象外・検証方法）の1回確認前** → Goal実装を開始しない。

未回答・複数選択・矛盾・判断を左右する根拠不足のときは、その場で止めて質問する。推奨案があっても自動採用しない。

## 全体フロー

```
0. 現在地・作業範囲の確認（+ handoff記録）
   → 1. サービス調査（資料がなければ）
   → 2. 調査要約・製品/MVP案（2〜3案）※STOPゲート1
   → 3. UI/UX調査・3方向モック
   → 4. チャット内承認 ※STOPゲート2
   → 5. Notion仕様の高精度化
   → 6. 共同開発基盤（AGENTS.md/CLAUDE.md/memory/handoff/DECISIONS/inbox）
   → 7. 完成像の1回確認 ※STOPゲート3
   → 8. Goal実装・評価Loop
   → 9. 独立レビュー・Draft PR（マージ・本番公開はしない）
```

## Codex版との対応表（ツールギャップ）

Claude CodeにはCodexの一部専用skill/連携がないため、以下の代替で進める。ユーザーが別の方法を明示すればそちらを優先する。

| フェーズ | Codex版 | Claude Code版 |
|---|---|---|
| 0. 作業場所確認 | `project-workspace-setup` | Bash/Git branch確認、必要なら`EnterWorktree`。新規案件のみ専用ディレクトリを作る |
| 1. サービス調査 | `new-service-discovery` / `openai-docs` | `WebSearch` / `WebFetch` / Notion検索（`notion-search`）で一次情報を確認 |
| 4. UI/UX3方向案 | `imagegen`（AI画像生成） | **`design`スキル**でHTMLベースのUIモック/アートボードを3方向作成する（写真的な画像ではなく画面構造・文言・状態まで再現できるモック） |
| 5. スマホ承認 | `slack:slack`（1️⃣/2️⃣/3️⃣リアクション） | **チャット内で直接承認を得る。**3方向をArtifactとして提示し、ユーザーがこの会話内で1案を明示的に選ぶ。Slack MCPが接続されていて送信先をユーザーが明示した場合のみSlack送信に切り替えてよい |
| 6. Notion仕様固定 | `brief-to-notion-spec` / `notion:notion-spec-to-implementation` | Notion MCP（`notion-create-pages`/`notion-update-page`）でNotion側を更新し、**`docs/specs/`のローカルMarkdownを内容正本**として同期する（本リポジトリの既存ルール） |
| 7. 共同開発基盤 | `bootstrap-codex-project` | `AGENTS.md`・`CLAUDE.md`・`memory/`・`handoffs/`・`docs/DECISIONS.md`・`inbox/`を**不足分だけ**整える。既存ファイルは上書きしない |
| 9. 独立レビュー・Draft PR | `github:yeet` | GitHub MCP（`create_pull_request`等）でDraft PRを作成。実装した本人とは別視点でのレビューを経てから作成する |

## フェーズ詳細

### 0. 現在地と作業範囲の確認

- 新規企画／要望あり／既存仕様あり／既存リポジトリあり、のどれかを判定する。
- `handoffs/active/`、`memory/INDEX.md`、`docs/DECISIONS.md`、`inbox/`を読み、未完了作業・変更禁止範囲・他エージェントの担当を確認する。
- 既存の未コミット変更や完成済み成果物を保護する。壊さない。
- 作業対象を1つに決めたら、`handoffs/active/`にこのフローの開始を記録する（`_TEMPLATE.md`を使う）。

### 1. サービス調査（資料がない場合のみ）

- 想定利用者、課題、競合、差別化、実現性を調べる。
- 事実（一次情報で確認できたこと）、推論（事実からの推測）、未確認事項を必ず分けて記録する。曖昧なまま次へ進まない。

### 2. 調査要約と製品/MVP案の承認 ※STOPゲート1

- 調査を短く要約し、根拠に基づく製品・MVP案を**原則2〜3案**提示する。
- 各案に必須で付けるもの: 対象利用者 / 達成結果 / 入れる機能・入れない機能 / 差別化 / 予算・期限との適合 / 弱点。
- ユーザーに次のいずれかを明示してもらう: 「A案採用」「複数案の要素を統合（要素を指定）」「前提を修正」「追加調査が必要」。
- **推奨案があっても自動採用しない。** 誰が・どの場面で・何を達成するアプリかを一文で説明でき、MVPの入れる/入れないが承認されるまで次に進まない。

### 3. UI/UX調査と3方向モック

- 承認済みの対象利用者・課題・MVP・必須条件を前提に、UX（迷わず目的を達成できる導線）とUI（見た目・操作部分）、類似サービス、端末標準設計、アクセシビリティを調べる。
- **`design`スキルを呼び出し**、堅実案・実用案・挑戦案の3方向を別々のモックとして作る。色違いにせず、承認済みMVPを保ったまま導線・情報量・見た目・長所・弱点が比較できる状態にする。
- 各案の意図（何を堅実/実用/挑戦にしたか）と根拠を短く記録する。
- 画像・モック内のテキストは**すべて架空のダミーデータ**にする（`AGENTS.md`: 実データが不要な検証では架空データを使用する）。個人向け販売の自動操作を示唆する表現、推測URL、公式タイムセール以外の値引き文言は入れない。

### 4. チャット内承認 ※STOPゲート2

- 3方向をArtifactとして提示し、それぞれの狙い・トレードオフを短く比較する。
- ユーザーがこの会話内で1案を明示的に選び、修正点があれば確定させる。
- 未接続・反応なし・複数選択のままではNotion仕様化・Goalへ進まない。
- 承認結果は`docs/design/`配下（既存の`selected-direction.md`のような形式）と`docs/DECISIONS.md`に記録する。

### 5. Notion仕様の高精度化

- 承認済みの製品方向・MVP・採用UI案だけを高精度化する。含めるもの: 調査要約、承認理由、主要画面、空状態・エラー状態、正確な文言、データ、対象外、受け入れ条件（AC）。
- **本リポジトリでは`docs/specs/`のローカルMarkdownが内容正本**（`docs/design/full-mock-index.md`の既存ルールに準拠）。Notionは共有用の同期先として更新する。
- 実装担当が追加の製品判断なしで着手できる状態にし、仕様と画像に矛盾がないか確認する。

### 6. 共同開発基盤を整える

- `AGENTS.md`（共通ルール）、`CLAUDE.md`、`memory/`、`handoffs/`、`docs/DECISIONS.md`、`inbox/`、検証コマンドを**不足分だけ**追加する。既存ファイルは上書きしない。
- 失敗記録の分け方（本リポジトリの既存ルールに準拠）:
  - 影響が大きい・再発し得る失敗 → `memory/incidents/`へ`status: candidate`で記録（`memory/_templates/incident.md`）。
  - 原因・修正・再発防止・証拠・重複確認・独立検証が揃ったものだけ → `memory/lessons/`へ昇格し`memory/INDEX.md`に追記（`memory/_templates/lesson.md`）。
  - 単発の試行・進捗 → handoff。
  - 合意済み判断 → `docs/DECISIONS.md`。
  - 未解決で判断待ち → `inbox/`。
- 両エージェント（Codex/Claude Code）が同じルールを読み、担当範囲・次の一手・検証方法を説明できる状態にする。

### 7. 完成像の1回確認 ※STOPゲート3

- 調査要約、承認済みの製品方向・MVP、採用デザイン、対象外、技術構成、受け入れ条件、Draft PRまでの範囲をまとめ、**ユーザーに1回だけ確認してもらう**。
- この確認が済むまでGoal（長時間の実装作業）を開始しない。`docs/specs/goal-contract-v1.md`のような形式で記録する。

### 8. Goal実装・評価Loop

- 最大の問題を1つずつ修正して再検証する、を繰り返す（評価Loop）。
- 不合格の試行はまずLoop記録に残す。**利用者・データ・セキュリティ・費用・主要導線に影響した、または再発し得る失敗だけ**をincident候補にする(6.のルールに従う)。
- 完了の目安: 全受け入れ条件・必須テスト・実画面確認が合格し、重大・高重要度バグ0件。
- P0→P1のように段階がある場合は、前段の必須テストに全合格してから次段へ進む（`docs/DECISIONS.md`の「P0からP1へ進む品質ゲート」のような既存パターンがあれば従う）。

### 9. 独立レビューとDraft PR

- 実装者とは別視点（別のsubagentまたは改めて読み返す形）で、凍結済み差分を読み取り専用で確認する。指摘があれば修正し、影響範囲を再検証する。
- Draft PRには: 承認済み製品方向、仕様、差分、検証証拠、採用デザイン、incident/lessonの有無、残存リスクを載せる。
- **PRマージと本番公開は自動実行しない。** 別途明示の依頼がある場合だけ行う。

## 安全境界（`AGENTS.md`から継承・厳守）

- 公式画面・CSV・契約済みAPI以外の連携をしない。スクレイピング、RPA、非公開API、無人の自動出品・自動値下げ・一括更新は実装しない。
- 公開・出品・価格反映・承認・会計確定には必ず人の確認工程を残す。
- AIの文章・画像・仕訳は候補として扱い、根拠と確認状態を示す。AIだけで確定しない。
- 税務機能は記録整理と会計ソフトへの受け渡し支援に限定し、個別の税務助言・確定申告完了を表示しない。
- Slack・Notionへの送信、GitHub作成、公開、本番反映、PRマージ、課金、破壊的変更は、対象と権限が明示された場合だけ行う。
- APIキー・トークン・Cookie・パスワード・Webhook URL・個人情報・生ログ・実データ行を、Git・`memory/`・`handoffs/`・`inbox/`・`docs/DECISIONS.md`へ保存しない。

## 参照ファイル

- `AGENTS.md` / `CLAUDE.md` — 共通開発ルールの正本
- `docs/specs/goal-contract-v1.md` — 完成像確認（STOPゲート3）の記録形式の実例
- `docs/specs/mvp-product-spec-v1.md` — 製品仕様の内容正本の実例
- `docs/design/full-mock-index.md` — モック画像の位置づけ・仮データルールの実例
- `docs/design/selected-direction.md` — UI/UX承認記録（STOPゲート2）の実例
- `docs/DECISIONS.md` — 判断記録の形式
- `handoffs/active/_TEMPLATE.md` — 申し送りの形式
- `memory/_templates/incident.md` / `memory/_templates/lesson.md` — 失敗記録の形式
- `inbox/README.md` — 未解決事項の記録形式
