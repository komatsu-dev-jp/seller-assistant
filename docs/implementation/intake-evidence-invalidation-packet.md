# 商品情報の変更後に古い販売根拠を使わない

## 依頼と境界

2026-10-04の修正依頼。対象は `komatsu-dev-jp/seller-assistant` の箱の検品登録。根拠は [PR32の指摘](https://github.com/komatsu-dev-jp/seller-assistant/pull/32#discussion_r4176800702)。main `17df50cda4966465ebc7fb01e3c0f549a620b6aa` から `codex/invalidate-intake-evidence` を作成した。開始時点でopen PRはなかった。

既存mainの未追跡 `work/` と別worktreeを保護するため、今回の作業フォルダ内に独立cloneとworktreeを用意した。既存main、他ブランチ、apparel-research-skillは編集しない。許可は修正・テスト・修正ブランチのpush・Draft PRまで。マージ、auto-merge、公開は対象外。PR33の履歴ナビゲーションと既存ヘルプの修正を混ぜない。

## 修正契約

- 商品名、ブランド、サイズ、対象、種類、袖、色、状態、検品結果、傷汚れメモの実際の変更で、登録を解除し、全事例を未確認に戻し、見込み販売価格を空にする。
- 自動作成した商品名を更新した後で以前の値と比較する。手入力した商品名の維持と明示的な自動作成への復帰を保つ。
- 事例のID・URL・売れた価格・比較メモは再確認用に保持する。送料・梱包代・手数料・箱費用と他商品は変更しない。
- 同じ値の再選択、同じ商品名のままの入力方式変更、費用・見込み価格の編集では確認を解除しない。
- 再登録・再読み込みだけで古い根拠を有効にしない。本人が事例を確認し直し、価格を選び直すまで売上を含む商品粗利を計算しない。全商品を計算できるまでは箱合計を表示しない。
- 保存構造・キーとv1→v2移行は変更しない。未編集の旧保存の事例を一括で無効化せず、実際に商品情報を変更した時点で無効化する。
- 保存失敗中の入力と無効化は一緒に保持し、保存が成功するまで別画面へ進まない。

変更範囲は `box-intake-flow.tsx`、その実コンポーネントのイベント処理を実行するテスト、関連記録に限定する。

## 担当と確認

実装・統合はルートCodexが単独で書き込む。親の実モデル・推論設定と費用は未確認・未計測。`AGENTS.md` の独立レビュー規則に従い、別実行 `gpt-6-astra` / medium を読み取り専用の確認担当にする。元要件、凍結差分、コード、テスト証拠を直接確認する。

参照した正本: `AGENTS.md`、`apps/web/AGENTS.md`、`memory/INDEX.md`、`docs/DECISIONS.md`、`docs/implementation/model-routing-plan.md`、`docs/implementation/intake-product-attributes-packet.md`、`handoffs/active/2026-10-03-box-intake-profit.md`、`handoffs/active/2026-10-04-intake-product-attributes.md`、box-intake flow/store/write-leaseとintake-product-optionsのsource/test。実装前にインストール済みNext.jsの `use-client` とServer/Client Componentsのガイドも読んだ。チェックアウトに `.agents/skills` はなかった。

検証: 修正前の追加15ケースが失敗し旧価格・確認済み状態の残存を再現。修正後は、自動商品名の追加ケースも含め関連4ファイル99テスト成功。各商品情報の編集→登録解除→箱合計保留→再登録→再読み込み→事例の再確認→価格選択→粗利と箱合計復帰を検証する。保存失敗の再試行、未編集の商品・費用・同一値の保持、v1移行を含む。

`npm run check` は成功。128ファイル・1159テスト、整形、lint、型確認、fixture、秘密情報検査、offlineの実行時依存監査、Web/API buildを通過した。最初のcheckでテスト補助関数の改行に対するlintエラーが出たため、`.at(index)` に変更してから全体checkを再実行した。Pages用 `REVIEW_BASE_PATH=/seller-assistant npm run build --workspace @resale/review` も成功した。

凍結差分の別実行Astra mediumによる独立レビューはP1/P2/P3各0件。確認担当も関連99テストを独立に実行して成功した。確認済みblobはflow `f3060708f848e3dec56c49f3ee6becaa256d4996`、test `7e08ae8f4b5319af90bdce197bda4d1731ee7e13`。最終lint修正後の差分も再確認済み。

Pages exportをループバック限定で配信し、隔離したheadless Chrome、390×844で実操作を検証した。架空の2商品で商品粗利1700円・販売不可の損失1100円・箱合計600円を確認。ブランド変更後に登録・確認済み状態・価格が解除され、手動名、比較資料、費用、他商品を保持した。箱合計は保留され、再登録・再読み込み後も粗利を計算できなかった。事例を本人操作で確認し直し価格を再選択すると、商品1700円・箱600円へ戻った。実iPhoneのSafari、ホーム画面追加PWA、既存Service Workerからの更新、実端末のv1保存移行は未実行。

提出時のDraft PR、リモートhead、CIの結果はPRと最終報告を正本とする。ローカル検証と残る端末確認は `handoffs/archive/2026-10-04-intake-evidence-invalidation.md` に記録する。
