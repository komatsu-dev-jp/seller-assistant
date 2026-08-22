# 修正版A・追補モック全文プロンプト v2

- 作成日: 2026-08-20（JST）
- Use case: `ui-mockup`
- 固定デザイン: 承認済みB「高速ワークベンチ」＋C「チーム・リレー」
- 方針: 24時間待機なし、即時で可逆な紛失候補、Money Forward向けCSV、勘定科目候補、用語ヘルプ
- 画像生成: 組み込みImageGen。各成果物を独立した1回の新規生成で作る。

## M13 v2: 1人運用・その場確認

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese iPhone PWA workflow presentation board, 1672×941 landscape
Input images: Image 1 is STYLE REFERENCE ONLY. Reuse its white and pale-gray surfaces, navy typography, bright-blue primary actions, amber cautions, green success states, rounded cards, readable Japanese labels, and consistent bottom navigation. Do not copy its obsolete 24-hour workflow or edit its composition.
Primary request: Create SEVEN fully visible iPhone screens for a new workflow titled 「1人運用・その場確認」. It must let one person safely complete a reversible inventory discrepancy on the spot. There must be NO 24-hour wait and NO separate-session requirement.

Screen 1 「運用モード」: badge 「1人運用（自動判定）」, mode card 「即時・可逆確認」, explanation 「有効メンバー1人のため自動適用」「手動切替はできません」. Small secondary card: 「2人以上は別担当確認」.
Screen 2 「商品ラベルを再読取」: camera scanner for inventory number 「INV-000128-4」, green check 「商品一致」, manual-entry fallback, primary 「次へ」.
Screen 3 「場所ラベルを再読取」: expected location 「洋室A・棚02・段3」, location code 「PLACE-A-02-3」, result 「現物なしを確認」, clear action 「場所を再読取」.
Screen 4 「証拠と理由」: evidence photo of an empty shelf position, required reason selector 「再探索しても未発見」, required short memo, checklist 「商品再読取」「場所再読取」「証拠写真 1枚」「理由入力」.
Screen 5 「最終確認」: before card 「販売可能」, after card 「紛失候補」, strong note 「商品は削除されません」「見つかったら元に戻せます」, audit mode `single_actor_reversible`, large press-and-hold control 「3秒長押しで紛失候補にする」, secondary 「戻る」.
Screen 6 「紛失候補」: amber result 「紛失候補に変更しました」, status chips 「販売対象外」「在庫履歴を保持」, current system location 「システム仮置き」, primary recovery action 「見つかったので戻す」.
Screen 7 「復帰と監査」: green result 「販売可能へ戻しました」, timeline 「商品再読取」「場所再読取」「証拠と理由」「紛失候補」「発見・復帰」, actor 「本人確認」, safe photo action 「位置情報を除いて書き出す」, offline notice 「棚卸は通信接続が必要です」.

Text constraints: The exact phrases above should be legible and correctly spelled. Use one screen per purpose and large tap targets. Use fictional data only. Do not include the phrases 「24時間」「翌日」「別セッション」 anywhere. No irreversible disposal or delete action. No marketplace logo, no Slack, Notion, OpenAI, external API, paid service, automatic listing, automatic pricing, tax advice, AI decision, GPS map, watermark, or confetti.
```

## W11 v4: 1人運用・即時差異管制

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese desktop operations web app, 1672×941 landscape
Input images: Image 1 is STYLE REFERENCE ONLY. Preserve the approved clean white/pale-gray canvas, navy typography, blue actions, amber exceptions, green restored states, compact left navigation, top search/status, dense readable tables, and right detail panel. Do not copy its obsolete time-delay data or edit the reference composition.
Primary request: Create a new screen titled 「在庫差異・即時確認」 for a one-person reversible discrepancy workflow. There must be NO 24-hour wait and NO separate-session requirement.

Top summary: 「有効メンバー 1人」, automatic badge 「1人運用・即時可逆」, metadata `single_actor_reversible`, explanation 「人数から自動判定・手動変更不可」. Next card 「2人以上は別担当確認」 with `dual_actor`.
Main queue table: columns 在庫番号 / 差異 / 予定場所 / 商品再読取 / 場所再読取 / 証拠 / 理由 / 状態. Use fictional rows showing 「再読取待ち」「写真待ち」「確認可能」「紛失候補」「復帰済み」「2人目承認待ち」. Do not show any waiting-time column.
Selected row INV-000128-4: state green-blue 「確認可能」. Right detail panel shows expected location 「洋室A・棚02・段3」, item-scan result 「一致」, location-scan result 「現物なし」, three evidence thumbnails, required reason 「再探索しても未発見」, memo, and four completed checks.
Before/after cards: 「販売可能」 → 「紛失候補」. Exact safety note 「削除せず、見つかったら復帰できます」. Large primary press-and-hold action 「3秒長押しで紛失候補にする」.
Bottom zone: audit timeline with actor, timestamp, target, before/after, reason; a selected missing-candidate item with primary action 「見つかったので販売可能へ戻す」; system locations 「システム仮置き」「返品隔離」; offline warning 「棚卸はP0では通信必須」; safe evidence export 「位置情報を除いた派生画像を書き出す」.

Text constraints: Critical Japanese labels must be crisp and correctly spelled. Accessible contrast, no cramped inputs, no cut-off buttons. Use fictional data. Do not include 「24時間」「翌日」「別セッション」. No irreversible disposal/delete, marketplace logo, Slack, Notion, OpenAI, external API, automatic listing, automatic pricing, tax advice, AI decision, GPS map, or watermark.
```

## M14 v2: 会計候補・Money Forward向けCSV

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese iPhone PWA workflow presentation board, 1672×941 landscape
Input images: Image 1 is STYLE REFERENCE ONLY. Reuse its white and pale-gray surfaces, navy typography, blue primary actions, amber blockers, green confirmed states, rounded cards, large Japanese labels, and consistent bottom navigation. Do not edit the reference composition.
Primary request: Create SEVEN fully visible iPhone screens for 「会計候補・CSV出力」. Show Money Forward-compatible file preparation without API connection, automatic account suggestions as editable candidates, and tap-to-open glossary help. Keep human confirmation and tax-safety boundaries explicit.

Screen 1 「出力形式を選ぶ」: two cards 「Money Forward向けCSV」 and 「汎用CSV」, selected first card, note 「ファイルを作成し、公式画面から人が取り込みます」「自動送信しません」.
Screen 2 「会計設定」: cards 「申告方式 ?」「消費税区分 ?」「インボイス登録 ?」「記帳方式 ?」, all initially amber 「未設定」, fixed note 「AIは選択しません」「本人または税理士が確認」.
Screen 3 「勘定科目の候補」: rows 売上 / 仕入 / 販売手数料 / 送料 / 梱包費. Show automatically prefilled editable candidate chips such as 「売上高（候補）」「仕入高（候補）」「荷造運賃（候補）」, source label 「確認済みルール v1.0」, one low-confidence row amber 「要確認」, buttons 「採用」「変更」.
Screen 4 「用語ヘルプ」: a bottom sheet opened from the `?` beside 「借方勘定科目」. Show sections 「かんたんな意味」「物販の例」「なぜ必要？」「確認先」 and text 「個別の税務判断は行いません」. Large close button.
Screen 5 「出力前チェック」: selected format 「Money Forward向け」, blockers 「消費税区分が未設定」「未確認の候補 1件」「証憑不足 2件」, disabled button 「CSVを作成」, link 「停止理由を見る」.
Screen 6 「CSVプレビュー」: columns/chips 「取引日」「借方勘定科目」「借方金額」「貸方勘定科目」「貸方金額」「税区分」「摘要」, period 「2026年8月・12件」, duplicate 0, note 「内容を確認してから出力」, primary 「確認してCSVを作成」.
Screen 7 「出力履歴」: filename, hash, mapping version, statuses 「作成済み」「取消済み」「置換済み」, buttons 「取消」「置換版を作る」, note 「外部サービスへ自動接続しません」「税額の確定や申告は行いません」.

Text constraints: Exact labels above should be legible. One screen per purpose, large `?` help icons and tap targets. Use fictional values only. Money Forward may appear as plain text only; no logo or copied brand styling. No tax recommendation, automatic tax selection, automatic filing, API connection, paid-service claim, marketplace logo, Slack, Notion, OpenAI, watermark, or claim that AI confirmed the accounts.
```

## W12 v2: 会計候補・CSV出力ガード

```text
Use case: ui-mockup
Asset type: high-fidelity Japanese desktop accounting operations web app, 1672×941 landscape
Input images: Image 1 is STYLE REFERENCE ONLY. Preserve the approved white/pale-gray canvas, navy typography, blue actions, amber blockers, green confirmation states, compact left navigation, top search/status, readable dense tables, and right-side detail/help drawer. Do not edit or reproduce the reference composition.
Primary request: Create a new screen titled 「会計候補・CSV出力ガード」 that clearly supports a Money Forward-oriented CSV file, a generic CSV file, automatic editable account candidates, glossary help, and human confirmation without external API connection.

Header area: segmented selector 「Money Forward向けCSV」「汎用CSV」 with the first selected, note 「公式画面から人が取り込み・自動送信なし」.
Profile area: four cards 「申告方式 ?」「消費税区分 ?」「インボイス登録 ?」「記帳方式 ?」, all default amber 「未設定」. Banner 「AIは選択しません。本人または税理士が確認します」.
Account mapping table: columns 取引イベント / 借方候補 / 貸方候補 / 税区分 / 候補の根拠 / 状態 / ルール版 / 確認者. Rows 売上 / 仕入 / 販売手数料 / 送料 / 梱包費. Use badges 「候補」「確認済み」「要確認」. Make candidates visibly editable with actions 「採用」「変更」. One row remains 「要確認」 and blocks export.
Open right-side glossary drawer from a visible `?`: title 「借方勘定科目とは？」, sections 「かんたんな意味」「物販の例」「なぜ必要？」「確認先」, disclaimer 「個別の税務判断は行いません」.
Preflight area: period 「2026年8月」, candidate count 12, selected format Money Forward, blockers 「税設定未完了」「未確認候補 1件」「証憑不足 2件」, duplicate and required-column checks, disabled 「CSVを作成」. Also show a compact green ready example with action 「内容を確認してCSVを作成」.
Preview/history area: columns 「取引日」「借方勘定科目」「借方金額」「貸方勘定科目」「貸方金額」「税区分」「摘要」, export ID, filename, file hash, mapping/rule version, creator, cancelled/replaced links. Boundary text 「運用上の利益・仕訳候補・会計帳簿・税額は同じものではありません」「税額の確定や申告は行いません」.

Text constraints: Critical Japanese labels should be crisp. Accessible contrast, no cramped inputs or cut-off text. Use fictional data. Money Forward may appear as plain text only; no logo or copied brand styling. No automatic tax selection, tax recommendation, automatic filing, external API, paid-service claim, marketplace logo, Slack, Notion, OpenAI, watermark, or claim that AI approved anything.
```
