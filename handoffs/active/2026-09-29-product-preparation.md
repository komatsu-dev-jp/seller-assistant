# Handoff: 商品単位の出品準備

- Status: implementation-verified / draft-pr-stage / browser-verification-pending
- Branch: `codex/product-preparation-simplify`
- Worktree: `_worktrees/product-preparation-simplify`
- Base: `a94d98703a7368ee53ad6782370584d5df9b855f`

## 依頼と範囲

利用者は写真ごとの確認・加工後比較・編集用セットが難しく、元のiPhoneショートカットより手間が増えたと指摘。商品情報・採寸・写真を一つの商品へまとめ、説明文に使い回す操作改善を実装中。

今回は確認用1点、同じブラウザー内への保存。実商品登録・複数端末共有・自動加工・API連携・本番DB変更は行わない。9月29日時点では公開、PR、マージ、Slack送信は未実施。10月1日は下記のDraft PR提出工程へ続行する。

## 変更

- 商品一覧→商品情報・写真・出品文の切替→内容を確認してコピー。
- 旧photo-01/02/03/06/07と29/30/31の直接URLも同じ商品へ接続。
- 個別の「写真を確認」操作を通常導線から除外。写真は拡大・選び直し、原本を保持した下書き保存。
- 商品情報を既存v1保存データへ後方互換で追加。採寸、検品、保管場所、保存した写真を再利用。保管場所は説明文へ入れない。
- 入力失敗時は未保存のまま保持。別タブの新しい保存を上書きしない。
- 別タブとの競合時は保存済み内容と比較し、本人が確認して、この画面で変更した商品情報・採寸だけを最新状態へ反映する。比較中の再更新は拒否し、最新の保管・検品結果を保護する。
- 編集レシピは任意の設定として保持し、終了後は出品準備へ戻す。

## 検証

- 対象3 test files / 38 tests PASS（競合後の明示的な復旧・比較中の再更新を含む）。
- `npm run check` PASS、exit 0。124 files / 1060 tests、coverage、format/lint/typecheck/security、Web/APIを含む全workspace build合格。
- `REVIEW_BASE_PATH=/seller-assistant npm run build --workspace @resale/review` PASS、136ページ生成。cache `resale-review-fc42a0cec00d`。
- 商品一覧とphoto-01/03/06/07のPC内URLはHTTP 200。これはブラウザー実操作の確認ではない。
- 独立レビュー `product_preparation_review`（Astra medium、読み取り専用）: 競合後に復旧できないP2を修正し、再レビューで閉鎖。新たな重大・中優先度指摘なし。レビュー担当によるブラウザー操作やテスト実行は行っていない。
- CUAはタブ一覧取得可だが、create/getTab、直接のtabs.newともwebview接続待ちが時間切れ。visibilityをtrueにしても改善せず。ユーザーへサイドパネルを開くよう非同期で依頼。実画面の検証は未確認のまま。別のUI操作ツールへ無断で切り替えていない。
- `git diff --check` PASS。コミット、push、PR、公開、マージは未実施。
- 10月1日の提出前再検証: 初回の全体checkで既存APIテスト2件が5000msで時間切れ。個別12件と、条件を変えない全体checkの再実行は合格。最終exit 0、124ファイル1060テスト、型・整形・lint・security・全workspace buildすべてPASS。実装者とは別の9月29日レビューから動作・依存関係は変更なし。
- 再発候補: `memory/incidents/2026-10-01-api-first-run-timeout.md`。原因は未確定、lessonへは昇格しない。

## 再開

2026-10-01: 利用者の「次の作業に移ってください」を受け、実画面未確認を明示したDraft PRの準備へ進む。PC内サーバーは再起動後HTTP 200。サイドパネルの操作はブラウザーのURL安全制限で拒否されたため、別のUI操作手段で回避しない。GitHub CLIの認証はネットワーク許可を付けた読取確認で有効と確認。最新origin/mainは基準SHAと同じ。新しいPRマージ・公開は行わない。

1. 今回の修正だけを限定コミット・pushし、関連Issue #11を参照するDraft PRへ提出。画面確認の未実施を本文とチェックリストに残す。
2. PC内だけの確認用サーバーはloopback 4123で起動中。停止していれば `node output/product-preparation/serve.mjs` で再起動する（補助スクリプトは無視対象）。
3. `http://127.0.0.1:4123/seller-assistant/mobile/products/` をサイドパネルで表示。入力・写真・コピー・再読込・旧URL・幅390/PC・コンソールを確認。このURLはPC内専用で、スマホ公開URLではない。
4. 変更が必要なら対象テストと独立レビューを再実施する。実画面未確認のまま完成や公開を主張しない。公開中のアプリは今回の変更前のまま。ユーザーの確認または安全制限が解消した後の実操作確認をもって、画面の未確認項目を更新する。

## 保護

mainの未追跡 `work/`、他のworktree、前回recipe-product-listの残存フォルダ・ブランチへ触れていない。既存の入力・写真を全消去しない。
