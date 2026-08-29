# PC版Web・修正版モック生成プロンプト v2

- 作成日: 2026-08-27（JST）
- Use case: `ui-mockup`
- 共通参照: `pc-web-redesign-prompts-v1.md`
- 修正仕様: `pc-web-redesign-slack-revisions-v2.md`

## 共通の編集条件

```text
Input image: the matching v1 PC board is the edit target.
Preserve exactly four screens, their 2×2 positions, screen numbers, left navigation, colors, typography, whitespace, and every unaffected screen purpose.
Change only the items listed for that board. Keep fictional data and plain Japanese.
Do not add external automatic connections, marketplace automation, scraping, RPA, private APIs, real URLs, real accounts, personal information, paid plans, or claims that the feature is already implemented.
```

## PC02 v2

```text
05: Replace every PC-camera action with "写真ファイルを選ぶ". Add help text "iCloud Driveなど、PCに表示されるフォルダーから選べます". Keep invoice/PDF/image selection and human comparison.
06: Preserve the unknown-start wholesale-box counter unchanged.
07: Replace the camera/retake control with a panel titled "スマホから届いた写真". Show status "接続中", "最新 10:42", "3件受信", one new thumbnail, and "写真を選ぶ" as the PC fallback. Keep the quick-registration fields and progress.
08: Preserve the high-price/needs-review triage unchanged.
Exact safety note: "写真はこの業務アプリ内で共有。外部サービスへ自動送信しません".
```

## PC03 v2

```text
09, 11, 12: preserve their purpose and layout.
10: Replace the one-large-label A4 preview with an A4 24-label sheet preview containing a realistic grid of many small inventory barcode labels. Show "A4一括印刷", "選択 24件", "開始位置 1", "24面", a compact selected-item list, and primary "選んだ24件を印刷". Keep "手書き（無料・標準）" as the default alternative. State "1商品につき1枚のラベル" and "印刷前に対象と枚数を確認します". OS print handoff only.
```

## PC07 v2

```text
25: Add a prominent segmented switch "一覧表示 / ギャラリー表示" with "ギャラリー表示" selected. Show a practical thumbnail card gallery with item number, destination, current price, last checked date, and badges "今日確認" or "確認済み". Keep "商品ページを開く" and the no-auto-reading note.
26: Redesign as "販売状況を確認". Left side is "今日確認する商品 8件", ordered by oldest check date, with thumbnails and days since last check. Right side shows the selected item and two tabs: "数字を直接入力" and "スクリーンショットから候補". Include fields current price, views, searches, likes, price requests; uploaded screenshot preview; amber badge "候補・人が確認"; buttons "公式ページを開く" and "確認した数値を保存"; next-check date. Exact note: "公式ページを自動で読み取りません".
27 and 28: preserve price-candidate comparison and human-only reply/action screens.
```

## PC08 v2

```text
29: Redesign the order form so "仮注文番号 #0048" is automatically assigned and not an input. Show destination as the first field. Label transaction ID "取引ID（任意・あとで入力できます）". Buyer display name remains optional. Allow unknown sales amount to be marked "あとで確認". Add an amber summary "未入力 2件・作業は続けられます" and primary "仮登録して取り出しへ".
30: Header uses "仮注文 #0048" rather than requiring an external transaction ID; product/place double-check remains unchanged.
31 and 32: preserve packing evidence and manual shipping record. Before final shipment, show a small reminder that missing order information must be checked, without blocking earlier picking/packing.
```
