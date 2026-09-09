# P0 終了監査（2026-09-09 JST）

## 1. 結論

- CodexがPC内で完了できるP0実装・検証: **完了**
- 進捗: **83 / 94（88.3%）**。AC 45 / 52、TA 38 / 42
- 残り: **11項目すべてWAITING_HUMAN**。実機・物理・公式サービス画面・利用者判断が必要
- 最終独立レビュー: **PASS**。Critical 0 / High 0 / P0阻害Medium 0 / Low 2
- P1: 開始していない
- 公開・Git操作: commit、push、PR ready化、merge、GitHub Pages更新、本番公開は行っていない
- 費用・外部連携: 有料サービス、外部runtime API、自動出品、スクレイピング、RPAは0件

この判定は「本番運用がすべて完了」という意味ではない。コードで完了できる範囲を閉じ、人にしか確認できない11項目を成功扱いにせず分離した状態である。正本チェックリストは[`p0-progress-checklist.md`](./p0-progress-checklist.md)とする。

## 2. 固定した候補

- worktree: `_worktrees/opus-audit-integration`
- branch: `codex/opus-audit-integration`
- 基準SHA: `220d6266a3b0975a2af0c81fefde2b316576755b`
- 対象: 基準SHAと、利用者・各担当の保護中未commit差分
- DB migration: `0001_p0_core.sql`から`0046_exact_team_assignment_versions.sql`まで45本（欠番あり）
- GitHubの既存Draft PRは変更せず、ローカル更新案だけを`draft-pr-update-proposal-p20.md`へ保存する

既存の大きな未commit差分は利用者の作業であるため、reset、clean、一括上書き、別branchへの移動を行っていない。

## 3. 最終検証証拠

| 証拠          | 結果                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 全品質ゲート  | `npm.cmd run check` PASS。63 test files / 580 tests、format、lint、全workspace typecheck、API/Web production build、Next 86 routes              |
| Coverage      | statements 83.93%、branches 81.06%、functions 92.06%、lines 89.50%                                                                              |
| 秘密・依存    | 449 text files、未承認secret形状0。オフライン依存監査の脆弱性0                                                                                  |
| Fresh DB      | 新規DB `resale_fresh_p20_20260909f`へ45 migrationを適用し、制限role、RLS、競合、仕入〜会計、返品・棚卸・担当変更をPASS                          |
| Upgrade DB    | 新規DB `resale_upgrade_p20_20260909f`で0001→0046、既存履歴保持、途中失敗rollback、再適用をPASS                                                  |
| 通常restore   | 73 tables / 316 rows / 253 FK。商品、レシート、場所原本、場所派生、棚卸差異、発送の非公開ファイル23個をコピーし、DB全行・ファイル・監査hash一致 |
| Live browser  | 10 route×390/768/1440px = 30/30。HTTP 200、横overflow 0、console error/warning 0、page error 0、外部request 0                                   |
| 役割別browser | ownerの担当解除申請、本人承認不可、別inventory manager承認、追記履歴、mobile overflow 0をPASS                                                   |
| 承認モック    | mobile 75 + PC 52 = 127/127を同一buildから撮影。欠落0、外部resource 0、比較25シート                                                             |
| 独立レビュー  | 修正後Critical 0 / High 0 / P0阻害Medium 0 / Low 2                                                                                              |

通常restoreのファイルmanifest SHA-256は`164eafa655524eab7876dad2ec6c242533b4e1e98fc6fc31869a179c8e7589ba`、DB全行SHA-256は`83aaa38b02dbe9fc5624a1e843621026d97d0d0c717a80b1b9477f3bf7c90cc0`で復元前後が一致した。検証は`127.0.0.1`だけで待ち受けるPostgreSQL 18.6と架空データを使い、実データを使用していない。

## 4. 最終レビューで閉じた不具合

1. 掲載4写真の取得権限
   - 修正前は背面、ブランドタグ、品質表示を管理担当でも取得できなかった。
   - 修正後はowner / inventory managerが`front / back / brand_tag / care_label`を取得できる。
   - field workerは`front / measurement_evidence`と有効担当だけに限定したまま。
2. 非公開画像の復元漏れ
   - 修正前は`media_asset`だけがファイル復元対象だった。
   - 修正後は`receipt_media_asset`、`location_photo`原本/派生、`discrepancy_evidence_media`、`shipping_photo_asset`も対象に含め、23ファイルの存在・実体path・size（保存値があるもの）・SHA-256を確認した。
3. 会計mobileの2px横あふれ
   - 390px幅のtop bar余白を修正し、3 viewportと回帰testで0pxを確認した。
4. 担当変更CSVの数式実行リスク
   - 数式として解釈され得る先頭文字を無害化し、空欄・空白・通常文字も回帰testへ固定した。

## 5. 承認デザインの忠実度

- 承認画像は参考ではなく受け入れ基準として扱った。
- mobileは1画面1目的、固定5項目フッター、白/薄灰、濃紺文字、青い主要操作、琥珀の要確認、緑の完了を維持した。
- PCは細い左ナビ、中央の作業情報、確認・詳細領域という承認済み構成を維持した。
- 比較証拠は`output/playwright/approved-ui-comparison/p20-final-20260909/`、現在画面は`output/playwright/p20-approved-ui-20260909/`にある。
- 固定`9:41`、Dynamic Island、電波、電池、端末外枠、説明用画面番号、架空金額は製品UIへ入れていない。これは実iPhone表示との重複や架空データ固定を防ぐための意図した差分で、承認業務デザインの変更ではない。
- 正式UI評価100/100の回帰基準を維持し、今回の127比較とlive 30条件で重大な構成・導線欠落0を確認した。

## 6. 人の確認待ち11項目

### AC 7件

- AC-053: 実iPhoneのカメラ拒否・非対応時の手入力
- AC-059: Money Forward公式画面へのCSV取込と件数・合計照合
- AC-061: WARMUPと固定10商品の実作業pilot
- AC-063: A4 24面の物理印刷と実Code 128読取
- AC-064: 実iPhoneカメラのCode 128読取と手入力
- AC-065: 商品別写真必須/任意とパンツ・スカート分岐の最終承認
- AC-066: 実iPhoneで撮影、取出し、梱包、発送

### TA 4件

- TA-016: 実iPhone Safari、ホーム画面追加、カメラ、二重確認、オフライン復帰
- TA-037: 破損ラベル、実物上限、GS1未契約運用
- TA-043: 実機accessibilityと固定10商品pilot
- TA-046: 商品別写真項目の利用者判断後の最終統合確認

入口は`real-iphone-api-verification-checklist.md`、`../specs/pilot-protocol-v1.1.md`、`accounting-export-evidence.md`を使う。

## 7. 残るLow 2件

1. IPv6 loopback URLは現在の接続ライブラリとの互換性が未確認。正式な復元手順は実証済みのIPv4 `127.0.0.1`を使うため、現在の無料ローカル運用を止めない。
2. migration 0043だけで作られた旧pending担当変更は0046後に版不一致となる可能性がある。0043〜0046は未公開の同一候補で一括適用し、0043単独運用データが存在しないため現在のP0 blockerではない。将来0043単独版を配布する場合は互換migrationが必要。

## 8. 外部反映と次の操作

- Notionは利用者が指定した既存の進捗チェックリストだけを、この結果へ更新し、再取得で94項目・完了83・未完了11を照合した。
- Slack、GitHub、Pages、PR、外部サービスへは送信しない。
- 実API/DBを公開URLへ配置していない。GitHub Pagesの静的確認版を完成版と表示しない。
- 検証用API・Web・review serverとP20 Playwrightを停止した。復元証拠の架空DBと、loopback限定PostgreSQL試験環境は削除せず保持した。
- 次の作業は、人による11項目の確認結果をチェックリストへ追記すること。失敗項目だけを新しい限定Goalとして修正する。

## 9. 2026-09-09 GitHub反映の追加承認

- 上記8章はP0 Goal終了時点の外部反映状況である。その後、利用者がPR作成・mergeを明示依頼した。
- 利用者は、公開リポジトリの標準`ubuntu-latest`を使うPull Request・`main`自動CIと、GitHub Pages公開を確認後に承認した。
- 既存Draft PR #9を再利用し、PR headとmerge commitに一致するCI・Pagesを確認する。人の確認待ち11項目は合格へ変更しない。
- larger runner、macOS runner、有料Action、有料API、有料SaaS、実データ、外部runtime APIは引き続き使用しない。
