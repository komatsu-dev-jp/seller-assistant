# 販売事例と見込み価格の引き継ぎ修正

- 対象: `komatsu-dev-jp/seller-assistant`
- Branch: `codex/invalidate-intake-evidence`
- Base: `17df50cda4966465ebc7fb01e3c0f549a620b6aa`
- Packet: `docs/implementation/intake-evidence-invalidation-packet.md`
- 許可: 修正・テスト・修正ブランチのpush・Draft PRまで。マージ・auto-merge・公開は未許可。

商品情報・検品内容が実際に変わる場合に登録を解除し、全販売事例を未確認、見込み販売価格を空にする。再確認に必要な事例入力と費用は保持。同一値の再選択では確認を保持する。保存構造・移行と履歴操作は変更しない。

## 実行済みの検証

- 修正前の追加15ケースが失敗し、不具合を再現。修正後は関連4ファイル99テスト成功。登録・再編集・再登録・再読み込み・利益合計、全10項目の変更、自動名・手動名、同じ値の保持、v1移行、保存失敗の再試行を含む。
- `npm run check` 成功。128ファイル1159テスト、fixture、整形、lint、型確認、秘密情報検査、offline実行時依存監査、Web/API buildを通過。
- `REVIEW_BASE_PATH=/seller-assistant npm run build --workspace @resale/review` 成功。
- 別実行 `gpt-6-astra` / medium の読み取り専用レビューはP1/P2/P3各0件。担当も関連99テストを独立実行して成功。最終lint修正後も確認済み。
- 隔離したheadless Chrome、390×844で、Pages exportの実操作を確認。架空の2商品で商品1700円・販売不可商品-1100円・箱600円を確認し、ブランド変更で箱合計が保留され、再登録・reload後も旧価格で計算できないことを確認。事例の再確認と価格選択で商品1700円・箱600円へ復帰した。手動名・比較入力・費用・他商品は保持された。

## 残る確認と引き継ぎ

提出時のDraft PR URL、head SHA、CIはGitHubの当該PRと最終報告を参照する。CIはそのheadに紐づく実行結果で判断する。ローカルの実装・検証を完了した記録として本handoffをarchiveに置く。

実iPhoneのSafariとホーム画面追加PWAは未実行。端末では、販売事例と価格を確認済みにした商品を編集し、再登録・アプリ再起動後も確認と価格が復活しないこと、再確認後の粗利・箱合計、v1保存からの商品名保持、既存Service Workerからの更新を確認する。今回の許可範囲で公開デプロイは行わない。

既存mainの未追跡 `work/` と他worktreeを保護するため独立clone/worktreeで作業した。PR33の履歴ナビゲーション・既存ヘルプ、apparel-research-skillは対象外。
