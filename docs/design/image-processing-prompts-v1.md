# 画像加工フロー UI モック生成プロンプト v1

生成方式: built-in `image_gen`。各アセットを独立した1回の呼び出しで生成。

## mobile-07-image-processing-v1.png

```text
Use case: ui-mockup
Asset type: Japanese image-processing operations app, one 16:9 landscape mobile product-design board
Primary request: Create a polished 16:9 design board containing exactly six complete, separate, tall iPhone screens that explain a safe product-photo processing workflow from queue to approval. This is a coherent six-step flow, not one wide dashboard.
Input images: Image 1 is a style reference only. Borrow its B+C hybrid enterprise visual language: white surfaces, pale cool-gray dividers, deep navy text, vivid accessible blue primary actions, restrained amber warnings, calm green completion states, thin borders, rounded cards, precise spacing, and subtle shadows. Do not copy its product, people, names, or page content.
Scene/backdrop: Clean pale gray-white presentation canvas with generous margins and no decorative scenery.
Style/medium: Shippable high-fidelity iOS product UI, crisp modern Japanese sans-serif typography, practical operations software, not concept art.
Composition/framing: Exactly six uncropped portrait iPhone screens in one evenly spaced horizontal row, all the same size, no overlap, no perspective angle. Add step numbers 1–6 above the phones. Use short, large, readable Japanese labels. One screen has one purpose. Keep a consistent bottom navigation on all phones: “ホーム”, “商品”, “加工”, “作業”, “設定”; “加工” is active.
Screen 1 — 加工待ち: heading “加工待ちキュー”; summary cards “未処理 24”, “要確認 3”; product rows with fictional SKU values such as “NV-2508-0042”, thumbnail, assigned person, and status; blue action “加工を準備”.
Screen 2 — 標準レシピ: heading “標準レシピ”; prominent preset card with the exact text “標準：白背景・中央・余白10%・2000×2000”; highly visible neutral badge “生成AI不使用”; checked rows “白背景”, “中央配置”, “余白10%”, “2000×2000”; blue action “この設定を使う”. Make it unmistakable that this preset is deterministic/non-generative.
Screen 3 — 手動バッチ: heading “連携を選択”; selected card “MVP 手動バッチ”; secondary locked or muted card “検証中 公式API”; exact note “APIはPro契約と別”; section “Photoroom Pro用ZIP”; blue action “ZIPを書き出す”. Use the Photoroom name only as plain text, never its logo.
Screen 4 — 再取込: heading “加工済ZIP再取込”; upload card “ZIPを選択”; progress card “SKU自動照合”; results “一致 23”, “未一致 1”; one amber warning row and action “照合結果を確認”.
Screen 5 — 品質比較: heading “原本／加工後”; large side-by-side product thumbnails labeled “原本” and “加工後”; checklist “輪郭”, “色”, “ロゴ”, “タグ”, “汚れ・傷”; one amber item “要確認”; action “拡大して確認”. Use a fictional unbranded handbag or garment with a generic tag.
Screen 6 — 最終確認: heading “承認”; review summary, assignee, timestamp, and audit note; green state “確認済み”; two clear actions “承認” and “差戻し”; short note “人が最終確認”.
Color palette: White, very light cool gray, deep navy, accessible blue, restrained amber, calm green.
Text (verbatim): “加工待ちキュー”, “標準：白背景・中央・余白10%・2000×2000”, “生成AI不使用”, “MVP 手動バッチ”, “検証中 公式API”, “APIはPro契約と別”, “Photoroom Pro用ZIP”, “ZIPを書き出す”, “加工済ZIP再取込”, “SKU自動照合”, “原本／加工後”, “輪郭”, “色”, “ロゴ”, “タグ”, “汚れ・傷”, “承認”, “差戻し”. Render these major labels verbatim with clear typography and no garbled characters.
Constraints: Exactly six phones and six purposes. Preserve the reference's clean enterprise information hierarchy. Use only fictional SKUs, fictional products, generic icons, and generic people names. Make all required major labels readable at presentation scale. Show “MVP 手動バッチ” as selected and “検証中 公式API” as secondary, not live.
Avoid: Any marketplace name or logo; any third-party logo including the Photoroom logo; browser/RPA automation concepts or imagery; automatic listing concepts; credential-sharing concepts; AI-generated backgrounds in the standard recipe; claims that the API is included in Pro; dark mode; decorative gradients; extra phones; cropped phones; illegible microtext; watermark.
```

## web-06-image-processing-queue-v1.png

```text
Use case: ui-mockup
Asset type: Japanese image-processing operations SaaS, one 16:9 landscape web product-design board
Primary request: Create a polished 16:9 product-design board containing exactly four distinct desktop browser dashboard screens for managing product-photo processing. The four screens must cover queue, recipe/integration settings, before-after quality review, and failures/usage. This is a four-screen presentation board, not a single dashboard divided into arbitrary widgets.
Input images: Image 1 is a style reference only. Borrow its B+C hybrid enterprise visual language: white surfaces, pale cool-gray dividers, deep navy text, vivid accessible blue primary actions, restrained amber warnings, calm green completion states, thin borders, rounded cards, precise dense tables, filter rails, detail panels, and subtle shadows. Do not copy its product, people, names, or page content.
Scene/backdrop: Clean pale gray-white 16:9 presentation canvas. Arrange four complete desktop browser frames in a readable 2×2 grid, equal size, with generous gutters, no overlap, no angled perspective, and small labels “1” through “4”.
Style/medium: Shippable high-fidelity Japanese B2B web UI, crisp modern sans-serif typography, realistic information density, not concept art.
Shared shell: Each desktop frame has a compact top bar, left navigation, main content, and consistent sections “加工キュー”, “レシピ”, “品質確認”, “履歴・監査”, “設定”. Use fictional brand name “NOVA STOCK” only as plain text, with no logo mark.
Screen 1 — 加工キュー: heading “加工キュー”; KPI cards “待ち 24”, “処理中 6”, “要確認 3”, “完了 128”; a readable table with columns “SKU”, “商品”, “レシピ”, “状態”, “担当”, “期限”; fictional SKU rows; filters and blue action “ZIP書き出し”; a right detail panel with assignment and recent audit activity.
Screen 2 — レシピ・連携設定: heading “レシピ”; prominent selected preset “標準：白背景・中央・余白10%・2000×2000”; exact badge “生成AI不使用”; recipe controls for background, centering, padding, and output size. A settings panel must display “Photoroom Pro：手動ZIP” and “公式API：未接続／許諾確認待ち”, plus the exact note “APIはPro契約と別” and security note “秘密鍵はサーバー保管”. Show generation controls “AI背景”, “フラットレイ”, “生成系：既定OFF”, “人の承認必須”; every generative control is visibly OFF and locked/muted.
Screen 3 — 原本／加工後比較: heading “原本／加工後比較”; large side-by-side fictional product images with zoom controls and diff overlay; checklist “輪郭”, “色”, “ロゴ”, “タグ”, “汚れ・傷”; status badges for pass and amber review; fields “SKU”, “担当”, “監査ログ”; actions “承認” and “差戻し”; show a short timeline of who reviewed what and when.
Screen 4 — 失敗・再処理と使用量: heading “失敗／再処理”; failure table with “SKU”, “エラー”, “試行”, “担当”, “状態”; actions “再処理” and “手動確認へ”. On the same screen, include compact cards “API使用量 128枚”, “概算原価 $12.80”, “今月の上限”, and an amber note “公式API：未接続”. Include a readable “監査” timeline for recipe changes and retry actions.
Color palette: White, very light cool gray, deep navy, accessible blue, restrained amber, calm green.
Text (verbatim): “加工キュー”, “レシピ”, “標準：白背景・中央・余白10%・2000×2000”, “生成AI不使用”, “Photoroom Pro：手動ZIP”, “公式API：未接続／許諾確認待ち”, “APIはPro契約と別”, “秘密鍵はサーバー保管”, “AI背景”, “フラットレイ”, “生成系：既定OFF”, “人の承認必須”, “原本／加工後比較”, “輪郭”, “色”, “ロゴ”, “タグ”, “汚れ・傷”, “失敗／再処理”, “再処理”, “SKU”, “担当”, “監査”, “API使用量”, “概算原価”. Render these major labels verbatim with clear typography and no garbled characters.
Constraints: Exactly four complete desktop screens in a 2×2 grid; one purpose per screen. Use only fictional SKUs, fictional unbranded product photos, generic icons, and fictional names. Make the queue table, recipe status, review checklist, failure table, audit trail, API usage, and cost visibly distinguishable. The official API must appear disconnected and pending permission, never production-ready.
Avoid: Any marketplace name or logo; any third-party logo including the Photoroom logo; browser/RPA automation concepts or imagery; login credential sharing; automatic listing concepts; live or exposed API keys; generative features shown ON; automatic approval of generated results; claims that API is included in Pro; dark mode; decorative gradients; illegible microtext; extra browser frames; cropping; watermark.
```
