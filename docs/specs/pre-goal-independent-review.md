# Goal開始前・独立レビュー結果

- レビュー日: 2026-08-13、在庫追補再レビュー 2026-08-14（JST）
- レビュー方式: 実装担当と分離した読み取り専用レビュー → 仕様修正 → 再レビュー
- 最終判定: PASS
- Critical（重大）: 0
- High（高）: 0
- Medium（中）: 0（再レビューで見つかった2件も反映済み）
- Low（低）: 0
- 外部開始条件: 未成立。GitHub再認証、macOS Actions枠/費用上限、対応iPhone情報、ユーザー最終承認

## 1. 初回レビュー

初回はCritical 0、High 8、Medium 6だった。以下を仕様へ反映した。

| 指摘 | 対応 |
|---|---|
| worker/RLS/Storageの組織越境 | 制限DB role、tenant context、複合FK、Storage policy、worker/署名URL/直接uploadの越境否定test |
| 監査ログへ機密値が入り得る | 固定AuditEvent schema、秘匿差分/参照ID、住所/token/証憑本文/AI全文0件test |
| 外注iPhoneの端末内保護 | Keychain、Data Protection、backup除外、ログアウト消去、割当lease、住所をoffline保存しない |
| Photoroom有料前提との矛盾 | P0は有料なしで完了し、既存契約/利用権が確認できた場合だけ任意ON |
| 割引/返金の二重控除 | 整数金額、通貨/税/負担者/source semantics/取消/rule版と固定fixture |
| 状態遷移/冪等が抽象的 | 在庫引当、承認、ExportBatchの許可遷移、DB unique、payload hash、同時実行test |
| 数値受け入れ条件不足 | ZIP/画像上限、署名URL期限、RPO/RTO、負荷/p95、coverage、必須suite 100% |
| GitHub/macOS/実機経路未成立 | 未成立ならGoalを開始しない外部開始条件へ固定 |
| ローカル/Notion正本矛盾 | ローカルMarkdownを内容正本、Notionを承認・共有ミラーへ統一 |
| Notion schema不足 | 固定allowlist、自由記述拒否、upsert key、revision、archive、schema test |
| Shops画像URL境界 | 対象asset/GET・HEAD/60分/20取得/即時失効/再発行/監査 |
| MVPが広すぎる | P0縦導線→P1運用拡張、機能flag、P0失敗時停止 |
| 旧資産の扱い | 51 testを監査し、コードではなく安全な振る舞いだけを明示allowlist移植 |
| EXIF位置情報 | 派生画像のGPS等0件、除去失敗時出力0、原本hash不変 |

## 2. 再レビュー

再レビューはCritical 0、High 0で安全仕様PASS。Medium 2件を追加検出した。

1. Shops更新CSVが新規登録CSVと分離されていない。
2. 修正版のNotion再同期・再取得が必要。

対応後の証拠:

- `docs/specs/mvp-product-spec-v1.md`: AC-001〜AC-041。AC-041に更新CSVのID/変更前後/件数/重複/対象外/結果照合を追加。
- `docs/specs/technical-architecture-v1.md`: TA-001〜TA-028。新規/更新CSVを別schema/adapterへ分離。
- Notion親仕様、技術設計、Goal契約を再同期し、AC-041、TA-028、P0/P1、外部開始条件を再取得確認。

## 3. 2026-08-14 在庫ロケーション追補レビュー

M12/W10のSlack承認後、AC-042〜AC-055、TA-029〜TA-037と関連するP0/P1、権限、オフライン、ラベル、写真、棚卸を、実装担当と分離した担当が読み取り専用で監査した。

初回判定はCritical 0、High 1、Medium 4で、補足2件があった。

| 指摘 | 反映 |
|---|---|
| 場所の容量・混載・同時格納 | 単品専用、最大点数、混載禁止、空き1枠への同時格納は1件だけ成功するDB条件をAC-044/TA-029へ追加 |
| 固定場所の定義 | 同一workspace、active、直接保管可能、正確に1場所とし、場所なし/複数/停止/廃止/保管不可の拒否fixtureを追加 |
| ラベルの一意性 | token hash全体一意、短いコードworkspace内一意、対象/種別ごとの有効版1件、旧版失効を追加 |
| 二重読取証拠 | 期待現物/現在地/移動先、商品/場所ラベル版、日時、確認者を1回限りのscan sessionへ保存し、欠落/不一致/旧版/再利用/未確認を拒否 |
| 位置写真の承認前境界 | 要確認/差戻し中は表示用派生生成、署名URL発行、API取得を100%拒否 |
| 棚卸の二者確認 | 最初の棚卸担当と再確認者、依頼者と承認者を分離し、最低2人を監査で証明 |
| スキャン不可時 | 商品と場所の両方をチェック値付き番号で手入力できるfallbackを明記 |
| 有料機器なしのP0 | 画面、A4/PDF、手書きラベルで完了し、専用プリンターSDKを前提にしない |

初回修正後の再レビューで、前回High 1とMedium 4は解消した一方、AC-050の2人確認条件をTA-032が直接検証していないMedium 1が残った。TA-032へ `initial_counter_id != reconfirmer_id`、`requester_id != approver_id`、`distinct human actor >= 2` の監査/DB/domain testを追加した。

最終独立再レビューは **PASS**。Critical 0 / High 0 / Medium 0 / Low 0。AC-050とTA-032は識別子、監査、DB制約またはdomain testの測定条件まで対応し、AC-001〜AC-055とTA-001〜TA-037に欠番・重複はない。これは仕様の測定可能性と相互整合の判定であり、実装またはテスト実行済みという意味ではない。

## 4. Goal開始判定

仕様品質はPASSだが、次の外部条件が1つでも未成立ならGoalを開始しない。

1. ユーザーが `docs/specs/goal-contract-v1.md` を一度だけ最終承認する。
2. `komatsu-dev-jp/resale-ops-app/private` とGit初期化・初回push・Draft PR作成を承認する。
3. GitHub CLIを `gh auth login -h github.com` で再認証する。
4. private repositoryの標準macOS Actions利用枠、または超過費用上限を確認する。
5. 実機確認に使うiPhone機種、iOS版、確認者を記録する。

これらは仕様不備ではなく、ユーザー側の権限・費用・実機を必要とする開始条件である。
