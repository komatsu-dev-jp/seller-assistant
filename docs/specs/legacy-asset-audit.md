# 旧実装資産監査

- 監査日: 2026-08-13（JST）
- 対象: `C:\Users\softt\Documents\Codex\2026-07-30\1-notion-plugin-notion-openai-curated`
- 方法: 旧資産を変更しない静的監査と既存test suiteの実行。実データ候補の内容は開かない
- 結論: コードを丸ごとコピーせず、安全な振る舞いだけを新しいMediaAsset/ProcessingJob/Storage契約へ移植する

## 1. 規模と除外

- 全672ファイル、126,455,814 bytes。
- `node_modules/**`: 568ファイル、82,924,546 bytes。依存生成物のため移植禁止。新lockfileから再取得する。
- `.git/**`: 18ファイル。commit 0でソースは未追跡。Git内部を移植しない。
- `review/**`: 14ファイル。商品写真、加工結果、レポート等の実利用データ候補なので内容を開かず、移植禁止。
- `runtime/**`: 20ファイル。OCR cache、作業画像、実験生成物なので移植禁止。
- `.env` 実体なし。`.env.example` 等のテキストは値を出さずpattern検査し、token/private-key形状0件。ただし旧service識別子やローカル絶対pathがあるため直コピーしない。
- `review/**` と `runtime/**` は内容検索していないため「秘密なし」とは保証せず、常に機密候補として扱う。

## 2. ソース別判断

| 旧ファイル | 判断 | 新実装で扱う内容 |
|---|---|---|
| `src/pipeline.js` | 振る舞い移植 | 原本SHA-256、安定確認、排他、staging→確定、重複/途中変更/部分生成のfail-closed。ローカルFS/iCloud、自動ready、絶対path保存は破棄 |
| `src/fs-utils.js` | 部分移植 | hash、通常ファイル、junction拒否、exclusive write、manifest比較をStorage key/署名URL境界へTypeScript化 |
| `src/config.js` | 思想のみ | 安全下限、危険root拒否をschema検証へ。旧環境変数、iCloud既定、識別子は破棄 |
| `src/photo/safety.js` | 部分移植 | 操作allowlistと生成系OFF。白背景判定だけで確定せず、人の原本比較承認を必須化 |
| `src/photo/renderer.js`, `layout.js` | MVP保留 | 自作画像engineは対象外。原本不変と失敗時出力0だけ共通契約へ移す |
| `src/photo/ocr.js` | 実装破棄 | Tesseractを使わずApple Visionへ。不正入力拒否と候補止まりだけ移す |
| `src/notion/parser.js` | 分割移植 | 旧自由記述parserは破棄。正規化/部分一致拒否を候補比較に限定 |
| `src/notion/repository.js` | 破棄 | 旧Notion読取正本は新方針と逆。allowlist一方向projectionへ置換 |
| `src/watcher/index.js` | 実装破棄 | iCloud watcherをoutbox+workerへ。1ジョブ失敗で全体停止しない性質だけ移す |
| `src/index.js` | 破棄 | 新Web/API/worker/iOS入口を作る |
| 旧Agent設定 | 破棄 | 現在の `AGENTS.md`、memory、handoffへ一本化 |

## 3. テストの現物確認

依頼資料の「48件」と現物は一致せず、現在は9ファイル・51 test定義。`npm.cmd test` は51 pass、0 fail、0 skip、約7.35秒。旧フォルダの更新ファイル0件を確認した。48件は `renderer-text-safety.test.js` の3件を除いた件数と一致するが、commitがないため追加時期は確認不能。

| test file | 件数 | 判断 |
|---|---:|---|
| `config.test.js` | 4 | 安全な既定/下限だけ新schemaへ部分移植 |
| `layout.test.js` | 4 | 自作画像engineまで保留 |
| `notion-repository.test.js` | 2 | 破棄しprojection allowlist/upsert/revision/archiveへ置換 |
| `ocr-safety.test.js` | 3 | 不正入力拒否と候補止まりだけ移植 |
| `parser.test.js` | 6 | OCR部分一致拒否を候補判定へ移植 |
| `pipeline.test.js` | 24 | 原本不変、冪等、競合、途中失敗、欠損/重複、path/junction越境防止を最優先移植 |
| `renderer-text-safety.test.js` | 3 | 原本hashと失敗時出力0だけMVPへ |
| `safety.test.js` | 3 | 操作allowlist/生成系OFFをprovider契約へ |
| `watcher.test.js` | 2 | workerの障害分離・再試行へ置換 |

旧testの名称と実体に2つの不足がある。Notion repositoryの「0件または複数件」は0件だけ、parserの「ブランドまたはサイズ重複」はブランド重複だけを検査しているため、新testでは両分岐を追加する。

## 4. 補助資産

- `.gitignore`: 秘密/生成物/商品写真を除外する思想だけ使い、monorepo用を新規作成。
- `package.json` / lockfile: 旧依存の台帳としてだけ参照し、コピーしない。
- `scripts/verify-whitespace.mjs`: 新formatterで代替できなければ再利用候補。
- `scripts/verify-safety.mjs`: 文字列検索は使わず、provider契約testへ置換。
- `docs/photo-workflow.md`: 原本保護、撮影、人確認だけ新仕様へ移す。
- `docs/research-workflow.md`, `restart-plan.md`: no-scraping、人選定、試験SKU、誤自動確定0の考え方を移す。
- `docs/notion-setup.md`: 旧識別子と旧正本方式を含むため破棄。
- `templates/iphone-shortcut-spec.md`: SKU/写真役割の考え方をupload manifest/採寸定義へ移す。
- CSV template: 列案だけDB schema/fixtureへ写し、実データファイルはコピーしない。

## 5. Goalでの移植ゲート

1. 旧pathはread-onlyの参照元とし、新workspaceから書き込まない。
2. 上表の明示allowlistにある振る舞いだけを新testとして先に書く。
3. source codeの直接コピーを標準にせず、新architectureに合わせて再実装する。
4. 旧絶対path、service識別子、秘密候補、商品/個人データ、生成物、dependency、Git内部が移植差分に0件であることをscanする。
5. Notion読取正本、自動ready、iCloud watcher、Tesseract、自作画像engineをP0へ持ち込まない。
6. 移植testは新AC/TAへ紐付け、旧test 51件が通ることを新製品の合格証拠に数えない。
