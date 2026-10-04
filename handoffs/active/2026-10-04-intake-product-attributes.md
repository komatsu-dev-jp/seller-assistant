# 箱の商品属性・ブランド選択 — 2026-10-04

## 現状

実装・自動検証・独立レビューが完了。スマホ公開版へのマージ・公開は未実施。

- Repository: `komatsu-dev-jp/seller-assistant`
- Branch: `codex/intake-product-attributes`
- Base: `a16d03271926b9a24dc321c31cfdfd07727f5300`
- Packet: `docs/implementation/intake-product-attributes-packet.md`

## 進捗

- [x] ブランド専用ビュー、日本語／英語検索、使用済みブランド絞り込み
- [x] 一覧外のブランド・ノーブランド・未選択への変更
- [x] 対象・種類・袖・色・サイズの選択、特殊サイズの手入力
- [x] 商品名の自動作成、手直しした商品名の維持、自動作成への明示復帰
- [x] 保存済みv1の厳密検証と、元記録を消さないv2移行
- [x] 同じ商品への復帰・再読み込み・保存失敗時の保持・長い商品名の下書き保存
- [x] 対象83テスト、全体128ファイル1143テスト、root check全gate
- [x] Pages用build：136ページ、139ファイル、全75モバイル・52PC経路
- [x] 別実行Astra mediumレビュー：初回P2 1件修正、再レビューP1/P2/P3 0件
- [ ] 実ブラウザー・iPhoneの描画／ネイティブ履歴確認
- [ ] PRマージ・Pages公開（明示依頼後）

## 検証と境界

`npx vitest run` 対象4ファイル（flow/store/write-lease/options）83成功。`npm run check` はfixture、format、lint、型、1143テスト、secret scan、offline production audit、Web/API buildを完了。`REVIEW_BASE_PATH=/seller-assistant npm run build --workspace @resale/review` も成功。runtime cache版は `resale-review-507ea0844c81`。

正規ブラウザーの一覧が空で接続できず、実画面・実iPhone・ネイティブ履歴操作は未確認。自動テストは実コンポーネントの入力・クリック処理を実行しており、描画確認の代わりとは扱わない。

保存キーを変えず、v1は完全な旧構造だけ受け入れる。旧名・ID・費用・販売事例はそのまま。v2未登録品の合成名は500字まで下書き保存、登録前・登録済み・v1は100字上限。保存失敗時には進まない。既存編集ロック・見込み粗利計算は変更していない。外部API・有料依存・新しい外部送信なし。

主作業フォルダにあった無関係な `work/` と前作業の残存フォルダは触れていない。本作業の専用フォルダとブランチは継続確認用に保持する。

## 次の確認

公開後、箱の登録→点数確定→ブランド検索→レディース／シャツ／半袖／ネイビー／M選択→商品名確認→登録→一覧・見込み利益の一連を実iPhoneで確認する。ブラウザーの戻ると再読み込み、手入力した商品名の保持も確認する。ブランド一覧は無料の端末内リストで網羅性は保証せず、未掲載名は入力できる。
