# スマホ版 iOS再設計・ImageGenプロンプト v1

- Use case: `ui-mockup`
- 入力画像: `mobile-03-capture-measure.png` は機能範囲だけの参考。レイアウトは踏襲しない
- 共通出力: 16:9のデザインレビュー用ボード、縦長iPhone 5画面、架空商品、ロゴ・透かしなし
- 共通代表画面: ホーム、検品、撮影、採寸、商品まとめ
- 共通正確文言: `ホーム`、`検品`、`撮影`、`採寸`、`商品まとめ`、`検品を始める`、`この写真を使う`、`保存して次へ`、`作業`、`商品`、`在庫`、`会計`

## A 堅実 — iOSかんたんガイド

```text
Use case: ui-mockup
Asset type: smartphone PWA design approval board
Primary request: beginner-friendly iOS-inspired Japanese resale operations app, showing a complete product workflow through five representative screens: home, inspection, camera capture, one-at-a-time measurement, final product summary
Input images: Image 1 is a content reference only for capture and measurement requirements; create a brand-new layout
Style/medium: realistic shippable product UI, current iOS conventions, not concept art
Composition/framing: 16:9 landscape review board with five separate portrait iPhone screens, each screen large enough to read; generous whitespace
Visual hierarchy: large navigation titles, inset grouped lists, one prominent bottom action per screen, simple progress label such as 検品 2/5, clear success and warning rows
Color palette: system white and grouped light gray, dark readable text, restrained system blue, small green/orange semantic accents
Navigation: stable five-item floating tab bar labeled exactly ホーム / 作業 / 商品 / 在庫 / 会計; navigation only, no add or camera action in the tab bar
Text (verbatim): "ホーム", "今日やること", "検品", "検品を始める", "撮影", "この写真を使う", "採寸", "保存して次へ", "商品まとめ"
Constraints: Japanese plain language; one screen one purpose; 44pt-like large tap targets; the photographed product is a fictional navy shirt; show measurement line visually; Liquid Glass only on navigation and transient controls; no English headings; no SKU, OCR, 証憑, mapping, profile, session, run; no Apple logo; no real service logo; no watermark
Avoid: desktop tables, dense dashboards, tiny labels, excessive glass, gradients in content cards, multiple competing primary buttons
```

## B 実用 — iOS現場カード

```text
Use case: ui-mockup
Asset type: smartphone PWA design approval board
Primary request: fast repeatable Japanese resale field-work app, showing home, inspection, camera capture, measurement, and final product summary
Input images: Image 1 is a content reference only for capture and measurement requirements; create a brand-new layout
Style/medium: realistic shippable product UI with current iOS patterns, compact but touch-friendly
Composition/framing: 16:9 landscape review board with five portrait iPhone screens; practical task cards; persistent compact "作業を続ける" accessory above the tab bar
Visual hierarchy: current product photo and remaining count first, short card rows, large primary action, clear progress ring or step bar, easy resume after interruption
Color palette: warm off-white, charcoal text, cobalt blue actions, mint completion, amber attention
Navigation: five stable tabs labeled exactly ホーム / 作業 / 商品 / 在庫 / 会計; the resume accessory is not a tab
Text (verbatim): "ホーム", "作業を続ける", "検品", "残り3項目", "撮影", "残り2枚", "採寸", "肩幅", "保存して次へ", "商品まとめ"
Constraints: Japanese plain language; one screen one purpose even with higher density; 44pt-like controls; fictional navy shirt; no internal jargon; Liquid Glass only on the tab bar and resume accessory; no Apple logo, real logos, watermark
Avoid: spreadsheet look, hidden primary action, small chips that must be tapped, English status words, action buttons inside the tab bar
```

## C 挑戦 — iOSカメラフォーカス

```text
Use case: ui-mockup
Asset type: smartphone PWA design approval board
Primary request: camera-first iOS-inspired Japanese resale app that keeps the physical item at the center, showing home, visual inspection, guided camera capture, overlay measurement, and final product summary
Input images: Image 1 is a content reference only for workflow requirements; create a brand-new layout
Style/medium: realistic shippable product UI, visually distinctive current iOS feel, restrained Liquid Glass control layer
Composition/framing: 16:9 landscape review board with five portrait iPhone screens; edge-to-edge product imagery on inspection/camera/measurement; floating step capsule; details appear in a bottom sheet; summary returns to a calm list
Visual hierarchy: product image first, one large camera or confirm control, short plain-language instruction, obvious close/back, progress dots with text label
Color palette: soft neutral photo background, deep navy text, electric blue action, translucent navigation controls with strong contrast
Navigation: five stable tabs labeled exactly ホーム / 作業 / 商品 / 在庫 / 会計 outside full-screen camera; full-screen camera is a temporary modal with 閉じる
Text (verbatim): "ホーム", "検品", "気になる所をタップ", "撮影", "この写真を使う", "採寸", "肩幅を測る", "保存して次へ", "商品まとめ", "閉じる"
Constraints: Japanese plain language; familiar camera behavior; 44pt-like controls; fictional navy shirt; Liquid Glass only for navigation and camera controls, never the content cards; no swipe-only required action; no internal jargon; no Apple logo, real service logos, watermark
Avoid: sci-fi HUD, concept art, unreadable translucent text, gesture-only navigation, decorative glass on every card, tiny typography
```
