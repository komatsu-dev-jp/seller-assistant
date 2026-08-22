# Opus監査追補モック・全文プロンプト v1

- 作成日: 2026-08-20（JST）
- 方針: ユーザー承認済みA案
- 共通デザイン: 承認済みB「高速ワークベンチ」＋C「チーム・リレー」
- 画像生成: 各成果物につき新規生成1回。参照画像はスタイル参照だけで、編集対象ではない。

## M13: 1人運用・差異解決

```text
Create one polished 16:9 product-design presentation board at 1672×941 showing SEVEN separate iPhone PWA screens for a Japanese resale operations app. Image 1 is STYLE REFERENCE ONLY: inherit its refined white and pale-gray surfaces, navy text, vivid blue primary actions, amber warnings, green completion states, rounded cards, large readable Japanese labels, consistent bottom navigation, and professional B+C “fast workbench / team relay” visual language. Do not edit or reproduce the reference composition. Build a new flow called 「1人運用・差異解決」.

The seven phones, left to right, must communicate one continuous safe workflow:
1. Mode overview: header 「在庫差異」, badge 「1人運用（自動判定）」, supporting text 「有効メンバー1人のため自動適用」 and 「手動で切替できません」. Show a small comparison card that says when two or more members are active the mode becomes 「2人確認」.
2. Initial report: item INV-000128-4, discrepancy type 「見つからない」, expected location 「洋室A・棚02・段3」, buttons 「証拠写真を追加」 and primary 「初回報告を送る」. Include a clear evidence-photo thumbnail placeholder without personal data.
3. Waiting state: large timer card 「24時間後に再確認できます」 with remaining 「23時間42分」, status 「即時確定はできません」, explanation 「別のログインセッションで再確認します」, disabled primary button.
4. Recheck in a separate session: badge 「別セッション確認済み」, photo comparison, required reason selector 「再探索しても未発見」, required memo field, checklist 「証拠写真 1枚」「24時間経過」「別セッション」.
5. Final human confirmation: title 「時間差本人再確認」, before/after inventory status, prominent warning 「この操作は在庫数と履歴を変更します」, primary 「内容を確認して確定」, secondary 「差し戻す」. Show audit mode label `single_actor_delayed` as small monospace metadata.
6. Exception location: card for 「返品隔離」 and 「システム仮置き」, allowed-state chips, item currently 「返品隔離・箱Q-02」, button 「場所を確認」. Make clear that exception items are not treated as normal sellable stock.
7. Audit result: green 「差異を確定しました」, timeline with 初回報告 / 24時間待機 / 別セッション / 証拠 / 最終確認, actor label 「本人（時間差確認）」, and safe photo export action 「位置情報を除いて書き出す」. Include an offline notice card 「棚卸は通信接続が必要です」.

All major Japanese labels above should be legible and correctly spelled. One screen, one purpose. Keep all seven phones fully visible and evenly spaced. Use fictional data only. No real marketplace brand, logo, Notion, Slack, OpenAI, tax advice, automatic listing, automatic price change, paid service, external API, biometric surveillance, or celebratory confetti. No claim that AI made the decision. No watermark. High-fidelity product UI, not a marketing poster.
```

## W11: 1人運用・差異管制

```text
Create one polished 16:9 desktop web-app product-design board at 1672×941 for a Japanese resale operations app. Image 1 is STYLE REFERENCE ONLY: inherit its clean white and pale-gray canvas, navy typography, vivid blue actions, amber risk states, green confirmations, dense but readable B+C “fast workbench / team relay” system, compact left navigation, top search/status bar, cards, tables, and right-side detail drawer. Do not edit the reference image. Create a new screen called 「在庫差異・確認管制」.

Show a realistic full desktop layout with four coordinated zones:
- Top summary: 「有効メンバー 1人」, automatic mode badge 「1人運用・時間差確認」, help text 「人数から自動判定・手動変更不可」, and a small alternate state showing 「2人以上は別担当承認」.
- Main queue table: fictional rows with inventory number, discrepancy, expected location, initial reporter, first report time, remaining wait, evidence count, and status. Include states 「24時間待機中」「別セッション待ち」「再確認可能」「2人目承認待ち」. A selected row INV-000128-4 opens the detail.
- Detail panel: before/after inventory state, evidence-photo thumbnails, expected location 「洋室A・棚02・段3」, current exception location 「システム仮置き」, required reason and memo, checklist for 24h / separate session / evidence photo. Show disabled confirm when any condition fails and active primary button 「内容を確認して確定」 only when all pass. Show small audit mode labels `single_actor_delayed` and `dual_actor`.
- Bottom/right audit and safety: complete event timeline with actor, timestamp, target, before/after, reason; warning 「棚卸はP0では通信必須」; system locations 「システム仮置き」「返品隔離」; safe export action 「位置情報を除いた派生画像を書き出す」 with original unchanged note.

Make the critical Japanese labels crisp and legible. Use a responsive professional operations interface, strong information hierarchy, no cramped inputs, no cut-off buttons, no tiny unreadable tables. Use fictional data only. No real marketplace brand or logo, no Notion, Slack, OpenAI, tax advice, automatic listing, automatic pricing, paid service, external API, GPS map, or claim that AI confirmed anything. No watermark. High-fidelity implementation-ready UI rather than a conceptual infographic.
```

## M14: 会計設定・CSV出力準備

```text
Create one polished 16:9 product-design presentation board at 1672×941 showing SEVEN separate iPhone PWA screens for a Japanese resale operations app. Image 1 is STYLE REFERENCE ONLY: inherit its refined white and pale-gray surfaces, navy text, vivid blue primary actions, amber blockers, green verified states, rounded cards, large readable Japanese labels, and consistent bottom navigation in the approved B+C “fast workbench / team relay” style. Do not edit or reproduce the reference composition. Build a new flow called 「会計設定・CSV出力準備」.

The seven phones, left to right, must communicate this safe workflow:
1. Readiness home: title 「会計CSVの準備」, all four cards marked amber 「未設定」: 「申告方式」「消費税区分」「インボイス登録」「記帳方式」. Large blocked message 「設定が完了するまでCSVは出力できません」.
2. Human configuration: form choices for the same four settings, label 「本人または税理士が確認」 and fixed note 「AIは選択しません」. Primary 「入力内容を確認」, no preselected tax answers.
3. Account mapping: title 「勘定科目の対応表」, rows for 売上 / 仕入 / 販売手数料 / 送料 / 梱包費, version card 「ルール版 1.0」, 「適用開始日」 and 「確認者」. Show unresolved row as amber 「要確認」.
4. Clear separation: four stacked cards labeled 「運用上の利益」「仕訳候補」「会計帳簿」「税額」 with arrows stopping between them, statement 「同じものではありません」, and no computed tax amount.
5. Export blocked: header 「出力前チェック」, blockers 「消費税区分が未設定」「未対応の勘定科目 1件」「証憑不足 2件」, disabled button 「CSVを作成」, link 「停止理由を確認」.
6. Ready for human confirmation: green checklist for period, profile version, mapping, missing evidence 0, duplicate 0; summary 「2026年8月・12件」; warning 「内容を確認してから出力」; primary 「確認してCSVを作成」.
7. Export history: rows for active / cancelled / replaced, hash and rule version metadata, buttons 「取消」 and 「置換版を作る」, disclaimer 「税額の確定や申告は行いません」.

All major Japanese labels above should be legible and correctly spelled. One screen, one purpose. Keep all seven phones fully visible and evenly spaced. Use fictional amounts and no personal information. No real marketplace brand, logo, Notion, Slack, OpenAI, tax advice, tax recommendation, automatic filing, automatic account determination, paid service, external API, or claim that AI approved the export. No watermark. High-fidelity product UI, not a marketing poster.
```

## W12: 会計プロファイル・出力ガード

```text
Create one polished 16:9 desktop web-app product-design board at 1672×941 for a Japanese resale operations app. Image 1 is STYLE REFERENCE ONLY: inherit its clean white and pale-gray canvas, navy typography, vivid blue actions, amber blocking states, green verification, dense but readable B+C “fast workbench / team relay” system, compact left navigation, top search/status bar, cards, tables, and right-side drawer. Do not edit the reference image. Create a new screen called 「会計プロファイル・CSV出力ガード」.

Show a realistic full desktop layout with four coordinated zones:
- Left/main profile: cards for 「申告方式」「消費税区分」「インボイス登録」「記帳方式」, all defaulting to amber 「未設定」. Prominent note 「AIは選択しません。本人または税理士が確認します」. Do not preselect any tax status.
- Account mapping table: operational event, debit account, credit account, tax treatment, mapping status, rule version, effective date, approver. Use rows 売上 / 仕入 / 販売手数料 / 送料 / 梱包費. One row should show 「要確認」 and prevent export.
- Export preflight panel: period 「2026年8月」, candidate count 12, blockers list 「消費税区分が未設定」「未対応の勘定科目 1件」「証憑不足 2件」, duplicate check, source reference check, and disabled primary 「CSVを作成」. Beside it show a green resolved example where all checks pass and the action becomes 「内容を確認してCSVを作成」.
- Right/bottom history and boundaries: export ID, file hash, profile version, rule version, created by, cancelled/replaced links; explicit separation cards 「運用上の利益」「仕訳候補」「会計帳簿」「税額」 and disclaimer 「本画面は記録整理と候補作成です。税額の確定や申告は行いません」.

Make critical Japanese labels crisp and legible. Professional implementation-ready accounting operations UI, accessible color contrast, no cramped form controls, no cut-off text. Use fictional data only. No real marketplace brand or logo, no Notion, Slack, OpenAI, tax recommendation, automatic tax decision, automatic filing, paid service, external API, or claim that AI confirmed anything. No watermark. Do not render a marketing infographic; render a believable product screen.
```

## W11 v2: 選択行と詳細の状態整合だけを修正

```text
Edit this existing Japanese desktop web-app mockup with the smallest possible change. Preserve the entire layout, typography, colors, tables, photos, navigation, audit timeline, safety cards, all other rows, and all other text. Do not redesign or regenerate unrelated areas.

Fix only the selected inventory row INV-000128-4 and its matching right-side detail so they describe the same ready state:
- In the selected table row, change remaining wait from 「17時間05分」 to 「0時間00分」 and change status from 「24時間待機中」 to green 「再確認可能」.
- In the right detail header, change status from 「24時間待機中」 to green 「再確認可能」.
- Keep the three green conditions showing 24 hours elapsed, separate-session confirmation complete, and evidence photos attached.
- Keep the active blue button 「内容を確認して確定」.

Do not change the other queue rows, which should continue demonstrating waiting, separate-session waiting, ready, and second-person approval states. Use no real marketplace logo, no personal data, no watermark. Output a crisp 1672×941 image.
```

## W11 v3: 選択行の残り時間誤記だけを修正

```text
Edit exactly one small text value in this existing Japanese desktop web-app mockup. In the selected blue-outlined row for inventory number INV-000128-4, under the column 「残り待機時間」, replace the incorrect text 「10時間00分」 with green text 「経過済み」. Preserve every other pixel, word, number, color, photo, table row, status, button, panel, and layout exactly as shown. In particular keep the selected row status and the right detail status as green 「再確認可能」. Do not redesign anything. No watermark. Output a crisp 1672×941 image.
```
