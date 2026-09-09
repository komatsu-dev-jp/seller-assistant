# 承認モックと実機能の対応表

- 更新日: 2026-09-09（JST）
- 対象候補: `codex/opus-audit-integration` の基準SHA `220d6266a3b0975a2af0c81fefde2b316576755b` と保護中の未commit差分
- 目的: 承認モック（見た目と操作順を確認する画面）と、実際にローカルDBへ保存する画面を混同しないようにする

## 2種類の画面

| 種類       | URL                                           | 保存   | 用途                                                                  |
| ---------- | --------------------------------------------- | ------ | --------------------------------------------------------------------- |
| 承認モック | `/mobile/screens/{画面ID}` / `/pc/{画面番号}` | しない | Slackで承認した全ページの見た目、文言、余白、状態、前後移動を確認する |
| 実機能     | 下表のlive route                              | する   | ログイン後、実APIとPostgreSQLを使って仕入れから会計候補まで作業する   |

承認モックに「架空データ・保存されません」と表示するのはこの区別のためである。P1（MVP後に作る機能）は「準備中・P0対象外」と表示し、実機能へのリンクを持たせない。

## モバイル75画面

P0は基本49画面とスーツ・セットアップ6画面の合計55画面で、すべてlive routeへ対応する。残り20画面はP1の確認用モックで、live routeは`null`である。

| 承認画面          | 内容                                       | live route             | P0/P1 |
| ----------------- | ------------------------------------------ | ---------------------- | ----- |
| 01                | ログイン                                   | `/login`               | P0    |
| 02〜03            | 初期設定・メンバー                         | `/team`                | P0    |
| 04〜06            | ホーム・作業・送信待ち                     | `/`                    | P0    |
| 07〜11            | 仕入れ書類・読み取り・商品行確認           | `/workflow`            | P0    |
| 12〜14            | 商品・棚の二重読取                         | `/mobile/scan`         | P0    |
| 15〜33            | 格納、検品、撮影、採寸、商品情報、出品準備 | `/workflow`            | P0    |
| 34〜38            | 注文登録、取出し、配送、発送確認・記録     | `/shipping`            | P0    |
| 39〜42            | 数違い、未発見、再発見、返品確認           | `/inventory/stocktake` | P0    |
| 43〜49            | 売上事実、会計設定、CSV作成・履歴          | `/accounting`          | P0    |
| genre-suit-01〜06 | スーツ・セットアップ撮影案内               | `/workflow`            | P0    |
| photo-01〜07      | 外部写真編集の受け渡し                     | なし                   | P1    |
| box-01〜07        | 卸箱の一括作業                             | なし                   | P1    |
| sales-01〜06      | 販売見直し支援                             | なし                   | P1    |

画面38「発送を記録」が棚卸へ誤対応しないよう、`/shipping`への境界を単体テストで固定した。

## PC52画面

P0は35画面、P1は17画面である。P1は実機能へ接続しない。

| 承認画面 | live route             | P0/P1 |
| -------- | ---------------------- | ----- |
| 01       | `/login`               | P0    |
| 02       | `/`                    | P0    |
| 03〜04   | `/team`                | P0    |
| 05       | `/workflow`            | P0    |
| 06〜08   | なし                   | P1    |
| 09       | `/inventory`           | P0    |
| 10       | `/inventory/labels`    | P0    |
| 11〜12   | `/inventory`           | P0    |
| 13〜17   | `/workflow`            | P0    |
| 18〜19   | なし                   | P1    |
| 20〜24   | `/workflow`            | P0    |
| 25〜28   | なし                   | P1    |
| 29〜32   | `/shipping`            | P0    |
| 33       | `/inventory`           | P0    |
| 34〜36   | `/inventory/stocktake` | P0    |
| 37〜40   | `/team`                | P0    |
| 41〜44   | なし                   | P1    |
| 45〜48   | `/accounting`          | P0    |
| 49〜52   | なし                   | P1    |

## 同じ業務状態での確認

| 実機能route            | 主な開始状態                   | 人が行う主な操作                                 | 現在候補の証拠                                                               |
| ---------------------- | ------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `/login`               | 未ログイン                     | 認証情報を入力してログイン                       | login/session自動テスト、production build                                    |
| `/team`                | ownerでログイン済み            | メンバーと期限付き担当を登録・確認               | auth/team/assignment自動テスト、P18の発送担当割当                            |
| `/`                    | workspace選択済み              | 未完了工程を確認して次の作業を開く               | home集計自動テスト、P18管理者ブラウザ                                        |
| `/workflow`            | 新規または作業中SKU            | 仕入証憑、写真、採寸、属性、文章・調査候補を確認 | P18の同一SKU仕入れ〜出品準備、商品調査ブラウザ・自動テスト                   |
| `/mobile/scan`         | 格納待ちの現物と有効な保管場所 | 商品と場所を読み、表示された一致内容を人が確定   | scan/putaway自動・PostgreSQLテスト、P18の二重読取                            |
| `/inventory`           | 在庫番号発行済み               | 在庫番号、場所階層、場所写真、現在地を確認       | inventory/label/location自動・PostgreSQLテスト、P18の在庫番号・場所確認      |
| `/inventory/labels`    | 印刷対象を人が選択済み         | A4 24面プレビューと番号重複0を確認               | Code 128/A4自動テスト。物理印刷・実カメラ読取は`WAITING_HUMAN`               |
| `/inventory/stocktake` | 棚卸snapshot開始済み           | 差異を確認し、勝手に在庫を変えず再読取・承認     | stocktake/solo/dual/restore自動・PostgreSQLテスト。実iPhoneは`WAITING_HUMAN` |
| `/shipping`            | 注文登録済み・担当割当済み     | 二重読取、写真、梱包確認、発送記録               | P18の同一SKU・管理者/発送担当ブラウザ、shipping自動・PostgreSQLテスト        |
| `/accounting`          | 発送済みで収益事実が入力可能   | 設定・科目候補を確認し、CSVを人が作成            | P18の同一SKU発送済み・会計設定。最終確認/CSV/公式取込は`WAITING_HUMAN`       |

- 2026-09-09に架空SKU `E2E-P18-001`を、仕入証憑、必須写真4種、採寸4項目、属性確認、商品調査の手動受け渡し、出品準備、内部在庫番号、保管場所、商品と場所の二重読取、注文、発送担当への期限付き割当、発送前写真2種、人による梱包確認、発送記録まで実ブラウザで完走した。
- 発送担当では購入者住所を表示せず、管理者へ戻した後に同じSKUが「発送済み」となり、会計工程が有効になることを確認した。
- 会計プロフィール保存まで確認した。勘定科目対応の最終確認、CSVダウンロード、Money Forwardへの手動取込は本人または税理士が行うため`WAITING_HUMAN`とする。
- ブラウザ通信記録は`127.0.0.1`だけで、外部runtime通信0件、console error 0件だった。

## 自動検証

- `apps/web/src/components/approved-mobile/mobile-screen-data.test.ts`: P0全55画面のlive route、P1非接続、工程境界、フッター位置を検査する。
- `apps/web/src/components/approved-pc/approved-screen-scope.test.ts`: PC全52画面をP0/P1へ分け、P0全35画面だけにlive routeがあることを検査する。
- 承認モック本体は上記対応関数を実際に読み、見た目を変えない`data-live-route`と`data-implementation-scope`へ記録する。P1にlive routeを付けない。
- `output/playwright/p20-approved-ui-20260909/`: モバイル75画面とPC52画面を同一候補から撮影。127/127画面でviewport合格、外部resource 0。
- `output/playwright/approved-ui-comparison/p20-final-20260909/`: 承認資料127画面と現在候補127画面の対応漏れ0、比較25シート。
- `output/playwright/p20-final-live/`: live 10 routeを390×844、768×1024、1440×1000で確認。30/30でHTTP 200、横あふれ0、console error/warning 0、page error 0、外部request 0。
- `.playwright-cli/page-2026-09-09T02-32-23-805Z.png`: 同一SKUを発送済みまで進めた管理者画面。
- `.playwright-cli/page-2026-09-09T02-32-19-181Z.png`: 同一SKUを梱包・発送した発送担当画面。
- `.playwright-cli/console-2026-09-09T02-06-26-692Z.log` / `.playwright-cli/console-2026-09-09T02-07-13-896Z.log`: 役割別の実ブラウザconsole記録。

## 実iPhoneだけに残る確認

Web内の固定`9:41`、Dynamic Island、電波、Wi-Fi、電池表示は入れない。CSSの`env(safe-area-inset-top/bottom)`（iPhoneのノッチやホームバーをブラウザ自身が避ける仕組み）だけを使う。実iPhone Safariとホーム画面追加後の余白・カメラ・オフライン再開は、利用者による実機確認まで`WAITING_HUMAN`である。
