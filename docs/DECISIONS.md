# 意思決定・再利用可能なフィードバック記録

確認済みの製品・技術判断だけを、日付付きで末尾へ追記します。過去の項目は削除・書き換えせず、判断が変わった場合は新しい項目から以前の項目を参照します。

APIキー、トークン、個人情報、生ログ、会話全文、一時的な試行は保存しません。

## 記録形式

### YYYY-MM-DD — 短い件名

- Type: decision / reusable feedback
- Context: 関連する仕様、ファイル、Issueへの短い参照
- Decision or rule: 決まったこと
- Why: 理由または根拠
- Applies to: 対象パス、機能、作業手順
- Verification: 確認方法
- Follow-up: none / inbox項目への参照

## 記録

### 2026-08-13 — 共同開発ルールの正本

- Type: decision
- Context: 開発基盤の初期準備
- Decision or rule: `AGENTS.md` をCodexとClaude Codeの共通ルールの正本とし、`CLAUDE.md` は `@AGENTS.md` を読み込む。実装コマンドはpackage manifest確定後に追記する。
- Why: 複数エージェントの指示矛盾を防ぎ、存在しないコマンドを作らないため。
- Applies to: プロジェクト全体の開発・検証・申し送り
- Verification: ファイル構造、`@AGENTS.md`、実装コマンド未確定の明記を確認する。
- Follow-up: none

### 2026-08-13 — 製品方向と標準ホーム

- Type: decision
- Context: `docs/design/selected-direction.md`、Slack `#メルカリ自動化` の承認履歴
- Decision or rule: 全体の業務設計は案B「高速ワークベンチ」を主軸に案C「チーム・リレー」の引継ぎを組み合わせ、標準ホームは案C「オーナーパルス」とする。
- Why: オーナーが売上だけでなく、滞留、承認待ち、欠損、チーム状況から次の行動を判断でき、外注運用にも拡張しやすいため。
- Applies to: iOS/Webの情報設計、ナビゲーション、ホーム、例外導線、監査導線
- Verification: `docs/design/slack-approval.md` に記録した返信 `Cでお願いします` と、採用画像のハッシュを照合する。
- Follow-up: 実装では概念画像内の重複グラフ数値をそのまま転記せず、実データと母数から算出する。

### 2026-08-13 — MVPの画像加工は外部手動バッチを使う

- Type: decision
- Context: Slackでの写真一括加工ツールに関する確認、`docs/specs/mvp-product-spec-v1.md`
- Decision or rule: MVPは「加工用ZIPを書き出す → 利用者が権利を持つ外部バッチで操作する → 加工済みZIPを戻す → SKU照合・原本比較・人が承認」を採用し、自作一括加工エンジンはMVP後に追加する。Photoroom Proは既存契約と利用権が確認できた場合だけ有効化し、P0は有料サービスなしでも完了可能にする。
- Why: 自動出品や非公式操作の危険を増やさず、仕入から配送・収益までの一本の業務導線を先に検証できるため。
- Applies to: 画像加工ジョブ、画面、権限、監査、MVP範囲、ロードマップ
- Verification: AC-010〜AC-012を満たし、欠損・重複・未知ファイルを検出し、原本を上書きしないことを確認する。
- Follow-up: 自作エンジンは同じprovider境界で差し替え、追加前に精度・性能・権利・費用を再承認する。

### 2026-08-13 — 自社DBを正本、Notionを限定ミラーにする

- Type: decision
- Context: `docs/specs/technical-architecture-v1.md`、個人情報・税務情報・外注権限の調査
- Decision or rule: サーバー側PostgreSQLを確定データの正本とし、Notionは住所、取得原価、利益、税務資料、秘密情報を除いた一方向の進捗ミラーに限定する。
- Why: Notion側の編集競合や権限設定だけに重要データの整合性と機密性を依存させないため。
- Applies to: データモデル、同期、権限、監査、バックアップ、障害復旧
- Verification: AC-024とTA-010を自動テストし、禁止フィールドが同期payloadに含まれないことを確認する。
- Follow-up: none

### 2026-08-13 — 個人向け販売画面は本人操作、税務は候補止まり

- Type: decision
- Context: Mercari公式規約・禁止行為、国税庁一次情報、`docs/research` 一式
- Decision or rule: 個人向け販売画面への自動出品・自動値下げ・資格情報保管・非公開API/画面スクレイピングは実装しない。AIはOCR整形、文章・仕訳の候補、算術、根拠表示までとし、公開、価格、商品同定、個別税務判断は人が確定する。
- Why: アカウント停止、誤出品、誤った税務判断、無資格の個別助言を避け、公式経路と説明可能性を保つため。
- Applies to: 連携アダプター、AI、UI文言、権限、監査、受け入れ条件
- Verification: AC-008、AC-014、AC-016、AC-022および禁止経路の静的/動的テストを実施する。
- Follow-up: 公式APIの利用は契約・書面承認・現行仕様・権限を確認した後に別判断として追加する。

### 2026-08-13 — P0からP1へ進む品質ゲート

- Type: decision
- Context: Goal開始前の独立レビューで、広いMVPを同時並行に作るリスクを検出
- Decision or rule: P0で試験SKU1点を仕入証憑から会計CSVまで通し、権限・財務・原本・監査の必須テストへ合格してから、P1の画像バッチ、Shops CSV、価格・分析、Notion、プラン/高度チーム機能へ進む。
- Why: 画面数だけ増えて中核の一気通貫が未完成になることを防ぎ、問題の発見範囲を小さくするため。
- Applies to: Goal、実装順、機能フラグ、評価Loop、Draft PRの受け入れ判定
- Verification: AC-037、P0必須AC、代表E2E、重大・高指摘0件を確認する。
- Follow-up: none

### 2026-08-13 — 旧実装は安全な振る舞いだけを移植

- Type: decision
- Context: `docs/specs/legacy-asset-audit.md`
- Decision or rule: 旧実装の51テスト合格は参考証拠とし、コードを丸ごと移さない。原本不変、冪等、競合、途中失敗時の未公開、path越境拒否だけを新architectureのtestへ移植する。
- Why: 旧Notion読取正本、iCloud watcher、Tesseract、自動ready、自作画像加工は現在の仕様と矛盾し、旧実データ/生成物/依存を持ち込む危険があるため。
- Applies to: Goal初期実装、移植レビュー、秘密scan、test設計
- Verification: AC-039と旧資産監査の移植ゲートを確認する。
- Follow-up: none

### 2026-08-14 — 現物1点と保管場所を分けて追跡する

- Type: decision
- Context: `docs/research/inventory-location-management-v1.md`、M12/W10、Slack `#メルカリ自動化` の承認返信TS `1786639062.761949`
- Decision or rule: ProductSKU（商品情報）とInventoryUnit（現物1点）を分け、変更不可の内部在庫管理番号を付ける。保管場所は拠点・部屋・ゾーン・棚/レール・段・箱/位置の階層と案内写真で管理し、格納・移動・ピッキングは商品ラベル→場所ラベル→人の確認で確定する。棚卸差異は自動修正しない。
- Why: 外注担当でも正しい現物を迷わず見つけ、誤棚・取り違え・紛失候補を根拠付きで再確認でき、SKUやJANと現物番号の混同を防ぐため。
- Applies to: iOS M12、Web W10、在庫/注文/返品データ、権限、監査、オフライン、AC-042〜AC-055、TA-029〜TA-037
- Verification: workspace境界、場所ツリー不変条件、二重読取、冪等移動、非公開写真、外注の場所枝権限、棚卸再確認、返品隔離、fallbackを自動/実機テストする。
- Follow-up: 可動container一括移動、複数拠点、最短ピッキング順、専用プリンター、RFID、GS1識別キーはP1または契約・機器確認後に別判断する。

### 2026-08-15 — ネイティブiOSをPWAへ変更し、外部計算費用を0円に固定する

- Context: ユーザーはMacを未保有で、WebサイトをiPhoneのホーム画面からアプリ表示できればよいと明示した。また「絶対無料」を要求した。
- Decision or rule: MVPのモバイル版はPWA（インストールできるWebサイト）とし、SwiftUI/Xcode/App Store/Apple Developer契約/macOS CIを対象外にする。GitHub Actionsは自動実行せず、ローカルWindows検証を正とする。有料API・有料SaaS・従量課金・本番公開は別途明示承認がない限り0件とする。
- Applies to: 製品仕様、技術設計、Goal、モバイルUI、オフライン、カメラ、QR/手入力、CI、受け入れ条件
- Supersedes: ネイティブiOSを前提にした技術選定・macOS開始条件・iOS固有のAC/TA。承認済みモバイル画面の情報設計はPWAへ移植する。
- Evidence: ユーザー会話「絶対無料でお願いします。あとiOSアプリと言いましたが、まだMacがないので Webサイトをアプリとして表示レベルで構いません」

### 2026-08-15 — P0ログインをNode.js標準scryptで無料実装する

- Type: decision
- Context: 外部認証SaaSを使わず、PWA/Webへ安全なログインを追加する。
- Decision or rule: Node.js標準`crypto.scrypt`をN=2^17、r=8、p=1、16-byte random salt、32-byte hashで使う。平文passwordを保存・記録せず、5回失敗は15分停止する。CookieはHttpOnly/Secure/SameSite=Strictとする。
- Why: 外部費用0円を守りつつ、高速hashではなくメモリ負荷のあるpassword専用hashを使い、DB流出時の推測攻撃を難しくするため。
- Applies to: `apps/api/src/auth.ts`、認証migration、ログインAPI/Web中継、初期owner作成。
- Verification: 公式Node.js Crypto文書とOWASP Password Storage Cheat Sheetを2026-08-15に確認。自動testと実画面で平文非保存、共通失敗、rate limit、Cookie、未接続停止を確認する。
- Sources: https://nodejs.org/api/crypto.html / https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Follow-up: 実PostgreSQLを無料のローカル環境へ用意し、初期owner、session、rate limit、membership/RLSを結合検証する。

### 2026-08-20 — 1人運用の時間差確認と会計未設定停止を採用する

- Type: decision
- Context: Claude Code第二次監査と現行mainの照合、ユーザーによる推奨Aの承認
- Decision or rule: 有効メンバーが1人の期間だけ、在庫差異の重要確定へ `single_actor_delayed` を自動適用する。初回申請から24時間以上、別session、証拠写真1枚以上、定型理由と自由記述がそろった場合だけ本人の再確認を許す。有効メンバーが2人以上なら新規の重要確定は `dual_actor` とする。会計設定は `unconfigured` を既定にし、申告方式、消費税区分、インボイス登録、記帳方式、勘定科目mappingを本人または税理士が確認するまで会計CSVを出力しない。
- Why: 完全無料の1人利用で在庫差異を閉じられるようにしながら即時の自己確定を防ぎ、未確認の税務・会計前提をアプリが推測してCSVへ混入させないため。
- Applies to: M13/W11、M14/W12、P0仕様、会計profile、在庫差異、監査、AC/TA、Goal、CSV出力前検査
- Verification: 24時間未満、同一session、証拠なし、理由なしを全件拒否する。2人以上では同一人物の承認を拒否する。会計項目が一つでも未設定ならCSV bytesを0件にし、理由を画面と監査へ残す。
- Follow-up: P0は機能分割せずcore縦導線とexception・差異の2検証ゲートにする。既存在庫移行、古物台帳生成、同一SKU複数個体はP1の別Goalとし、10商品pilotの出品準備中央値5分以下を当面の効率目標へ昇格する。追補モックのSlack承認後に仕様本文へ反映する。

### 2026-08-20 — 1人運用は即時の可逆変更、会計CSVは候補自動入力へ変更する

- Type: decision
- Context: Slack返信TS `1787201696.138589` と、会話内のユーザー回答「修正版Aでお願いします」
- Decision or rule: 1人運用の24時間待機を廃止する。現物ラベルと場所ラベルの再読取、証拠写真、理由、最終確認を同一sessionで満たした場合、在庫を削除せず可逆な `missing_candidate` へ即時変更できる。発見時は履歴を残して復帰する。取消不能な廃棄確定はP0対象外とする。会計出力はMoney Forward指定仕訳帳CSVと汎用CSVを分け、外部へ自動送信しない。勘定科目は取引種別とユーザー承認済みmappingから候補を自動入力し、初回・低確信・未対応・税設定未完了では確定せずCSVを停止する。専門用語にはタップ可能な `?` ヘルプを付ける。
- Why: 1人の現場作業を24時間止めず、誤操作時に復旧できる安全性を残し、会計入力の反復作業を減らしながら個別税務判断と誤ったCSV確定を避けるため。
- Applies to: M13/W11、M14/W12、在庫差異、棚卸、会計profile、勘定科目mapping、CSV adapter、用語ヘルプ、AC/TA、Goal
- Verification: 再読取・写真・理由・最終確認の一つでも欠ければ変更0件。`missing_candidate` は履歴付きで復帰可能。Money Forward adapterは公式sample列・必須項目・文字コードfixtureに合格し、外部通信0件。未確認候補が1件でもあればCSV bytesは0件。ヘルプはキーボードとタップで開閉できる。
- Supersedes: 同日決定「1人運用の時間差確認と会計未設定停止を採用する」のうち、24時間待機と別session要件。会計未設定停止、2人以上の別担当確認、P1対象外境界は維持する。
- Follow-up: 修正版4画面をSlackで承認後、仕様本文へ反映する。

### 2026-08-20 — 修正版Aの4画面を承認しP0 gateを再開する

- Type: decision
- Context: Slack `#メルカリ自動化` 親TS `1787203224.255009`、ユーザー本人の返信TS `1787203707.087749`「修正版4画面で承認」
- Decision or rule: M13 v2/W11 v4の1人用可逆差異フローと、M14 v2/W12 v2の会計profile・承認済みmapping・Money Forward/汎用CSV分離を正式採用する。旧P0合格は基礎証拠として保持するが、AC-039、AC-056〜061、TA-038〜043を含む現行gateが合格するまでP0完成扱いにしない。
- Why: 1人運用の行き止まりを即時かつ復元可能な方法で解消し、会計前提の推測と誤出力を防ぎながら完全無料・手動公式経路を維持するため。
- Applies to: MVP仕様、技術設計、財務数式、Goal契約、受け入れ対応表、Notion共有ミラー、実装、独立review
- Verification: `docs/design/revised-a-approval-v2.md`の4 hash、Slack返信、AC-056〜061、TA-038〜043、`financial_formula_v1.0.0`、外部network 0件を照合する。
- Supersedes: 同日決定「1人運用の時間差確認と会計未設定停止を採用する」の24時間/別session要件。後続の「1人運用は即時の可逆変更、会計CSVは候補自動入力へ変更する」を承認済み状態へ確定する。
- Follow-up: Goal再開契約v2をユーザーが1回確認した後、paused Goalを再開して実装する。P1、本番公開、PR mergeは行わない。

### 2026-08-20 — Goal再開契約v2を確認し無料PWA実装を再開する

- Type: decision
- Context: `docs/specs/goal-contract-revised-a-v2.md`、ユーザー回答「この契約でGoalを再開してください」
- Decision or rule: 修正版A、完全無料PWA、Money Forward公式A〜AA 27列と汎用19列の分離、P0必須AC/TA、Draft PRまで・merge/本番公開なしを最終契約としてP0実装と評価Loopを再開する。Goal管理機能に残るnative iOS前提の旧Objectiveは実装根拠にしない。
- Why: Slack UI承認、独立仕様review PASS、27列訂正を含む契約v2について、ユーザーの明示確認が得られたため。
- Applies to: migration `0020`以後、domain/contracts/API/Web/PWA、検証、独立review、Draft PR
- Verification: 契約v2の承認状態、AC-001〜061、TA-001〜043、外部runtime通信0件、費用0円、Draft PR境界を照合する。
- Follow-up: 現行P0の全gateが合格するまでP1を開始しない。

### 2026-08-20 — Slack承認画像を実装UIの受け入れ基準に固定する

- Type: decision
- Context: ユーザー指摘「モックが承認したイメージ（デザイン）とかなり違います」「Slackで承認したイメージ通りがいい」
- Decision or rule: `docs/design/selected-direction.md` と修正版AのSlack承認画像を、配色だけでなく情報の優先順位、PC/スマホの役割分離、1画面1目的、工程順まで含むUI受け入れ基準とする。実装都合でPC表をスマホへ縮小した画面や、全工程を1ページへ縦積みした画面を合格にしない。
- Data exception: モック内の架空金額、件数、担当者、写真、端末外枠はコピーしない。実装はDB保存値、空状態、監査状態を表示し、事実と異なるモック値を固定しない。
- Applies to: Home C、W10/M12、W11v4/M13v2、W12v2/M14v2、実ブラウザ証拠、UI評価表、独立レビュー。
- Verification: 390×844、768×1024、1440×1000で承認画像と実routeを対応付け、横overflow、主要操作切断、44px未満の主要操作、console errorを0件にする。独立確認者が同じcommitの実ブラウザで再判定する。
- Follow-up: 実際の10商品pilotと実iPhone Safari確認は別の未完了gateとして残し、視覚修正だけでP0/Draft PRを完了扱いにしない。

### 2026-08-21 — cost-optimizedモデル運転へ切り替える

- Type: decision
- Context: ユーザー依頼「実装難易度に合わせてサブエージェントを適切なモデルに振り分けるようにしてコストを削減」および `app-development-orchestrator` のモデル割当契約
- Decision or rule: 現行P0の実装運転モードを `cost-optimized` にする。固定済みの画面・CSS・テスト・文書はLuna max、限定された複数層統合はTerra high/xhigh、DB・移行・認証・権限・機微情報・金額・重要状態・同時更新・安全性・原因不明の障害・最終独立レビューはSol maxへ割り当てる。
- Why: Solを重大判断と品質ゲートへ集中させ、低リスク作業のコストを下げながら、承認済みデザイン、安全条件、検証基準を維持するため。
- Applies to: `docs/implementation/model-routing-plan.md`、active handoff、以後の実装パケット、独立レビュー、Draft PR gate
- Verification: 各パケットに実装担当、確認担当、変更範囲、検証、停止・昇格条件を記録し、下位モデルの自己承認0件、別Sol maxの最終レビューを確認する。
- Follow-up: 同じworktreeへの書き込みは直列化し、実10商品pilotとUI 8 taskをモデルで代行・補完しない。

### 2026-08-24 — 固定fixtureに結び付けたpilot v1.1を採用する

- Type: decision
- Context: `docs/specs/pilot-protocol-v1.1.md`、`fixtures/listing-prep-pilot-v1.1/manifest.json`、migration `0033`
- Decision or rule: 新しい10商品pilotは`listing_prep_pilot_v1.1.0`、migration `0033`、manifest SHA-256 `a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18`を一組として記録する。計測外の`WARMUP-01`と固定10商品のローカル画像・架空属性・カテゴリ別採寸templateを使い、人が画像選択と最終確認を行う。`listing_prep_pilot_v1.0.0`は過去runを読むための履歴として保持し、新しいrunには使わない。
- Why: IDとカテゴリだけの旧fixtureでは入力素材と採寸を再現できず、商品差し替えや手動訂正の欠落によって時間指標が変わるため。
- Applies to: pilot契約、fixture生成物、migration `0033`、API/Webのpilot計測、AC-061、P06、証拠文書
- Verification: `npm.cmd run pilot:fixtures:check`で44 PNGとmanifestを照合し、fresh/upgrade PostgreSQL、現行commitの実ブラウザ、実利用者warm-up＋10商品の順に別gateで確認する。
- Follow-up: root check（fixture整合、format、lint、typecheck、26 files / 192 tests、build）は合格済み。PostgreSQL実走、実ブラウザ照合、実利用者pilot、最終独立Solレビューは未実施のため、本pilotとDraft PRを開始しない。

### 2026-08-24 — v1.1実走・部分UI証拠・loopback固定を分離して記録する

- Type: reusable feedback
- Context: `docs/implementation/acceptance-map.md`、`docs/implementation/design-fidelity-evidence.md`、`docs/implementation/loop-log.md`、migration `0033`、UI evaluation seed、`memory/incidents/INC-20260824-002-local-web-broad-bind.md`
- Decision or rule: fresh/upgrade PostgreSQLはmigration `0033`までPASSとして記録する。UIはcaptureとsolo/dual棚卸の確認済み部分だけをPASSとし、seeded browser評価全体のPASS・最終点数へ拡張しない。会計、棚卸の3秒確定・復元・最終承認、200% zoom、capture全属性採否、全network捕捉、実利用者pilot、iPhone、最終Sol reviewは未確認または未実施として残す。Webはloopback `127.0.0.1`固定を維持し、full checkの合格は対象差分と実行時点を併記する。
- Why: DB実走、部分的なUI確認、起動境界の安全修正、最終受け入れを混同せず、未確認操作をPASSへ繰り上げないため。
- Applies to: v1.1 evidence、P04/P05/P06/P08 gate、UI評価、local-only runtime、Draft PR判定
- Verification: fresh/upgrade PostgreSQL `0033`までPASS、最新`npm.cmd run check`は27 files / 196 tests・coverage・API/Web build PASS、seedは4独立workspace生成と再実行拒否、修正版runtime netstatは`127.0.0.1:4173`だけ、targeted 24 testsとWeb build PASS。外部request、課金、merge、公開0件。
- Follow-up: seeded browserの未確認操作と最終採点、200% zoom、capture全属性採否、全network捕捉、実10商品pilot、実iPhone Safari、別Sol最終レビューを完了するまで、本pilotとDraft PRを開始しない。

### 2026-08-24 — v1.1 seeded証拠と未確認gateを分離する

- Type: reusable feedback
- Context: v1.1 seeded browser再評価、Money Forward CSV fixture、fresh/upgrade PostgreSQL 0033実走、`npm.cmd run check`
- Decision or rule: 会計7/7 human mapping、27列5行CSV（1649 bytes、SHA-256 `e833a060cc7fef30fa90140fd4330e5523579d34e871d2fc061aeed349dc1e01`）、solo/dual棚卸の承認・復元、capture TOPSの人確認、390px responsiveを確認済み証拠として記録する。税未設定、候補不一致、元担当者dual承認は停止する。実MF import、実利用者pilot、実iPhone、最終Sol/UI review、Draft PR readyは未確認のまま維持する。
- Why: seeded UIの確認済み範囲を正確に残し、部分PASSやfixture CSVを実サービス取込・実利用・最終審査の代替にしないため。
- Verification: full check 29 files / 201 tests、coverage、API/Web build、fresh/upgrade 0001〜0033、49-table RLS/immutable reason fields、runtime loopbackのみ、外部/paid/deploy/merge 0。使い捨てDBは削除済み。
- Follow-up: 実利用者WARMUP＋10商品、実機・実MF import、独立Sol/UI最終確認後までGoalを完了扱いせず、Draft PR readyへ進めない。

### 2026-08-25 — iPhone実機確認はIP限定ローカルHTTPS中継を使う

- Type: decision
- Context: ユーザー依頼「スマホからもアクセスできるように表示してください」。現在の認証Cookieは`HttpOnly; Secure; SameSite=Strict`であり、LAN上の平文HTTPでは安全なログインを成立させられない。
- Decision or rule: PC用Web `127.0.0.1:4273`とAPI `127.0.0.1:3200`を直接公開せず維持し、実機確認時だけ別ポートのローカルHTTPS中継を使う。待受はPCの明示IPv4、接続元はiPhoneの明示IPv4各1件へ限定し、Host/Origin/Referer、危険header、redirectを検証する。Secure Cookieを外さない。公開CA証明書以外の証明書・秘密鍵・ログは`C:\tmp`だけに置き、外部サービス、Git、Slack、Notion、PRへ送らない。
- Why: 完全無料と同一Wi-Fi内だけの利用を維持しながら、認証Cookie、CSRF防止、API loopback、P06のloopback-only証拠を弱めずiPhone Safariで確認するため。
- Applies to: `scripts/lan-preview-proxy.mjs`、`scripts/start-lan-preview.mjs`、実iPhone gate、PWA、ローカル運用手順、Firewall一時規則
- Verification: unit 17件、root full check、TLS署名、公開CAだけの配布、別Origin拒否、Secure Cookie、login/session/workflow/logout/失効sessionをPC自己検証する。実iPhoneのIP限定接続、CA trust、Safari、home追加、camera、offline、HEIC/WebPは人が別証拠で確認する。
- Follow-up: iPhone確認後に中継とFirewall規則を停止・削除し、iPhoneのCA profileとPCの一時証明書を削除する。P06 Windows計測へ混ぜず、実iPhone未確認を完了へ繰り上げない。

### 2026-08-25 — スマホ確認用にGitHub Pagesの静的レビュー版を公開する

- Type: decision
- Context: ユーザーはGitHub上でWebアプリを確認し、iPhoneのホーム画面から開いて修正点を伝えたいと明示した。GitHub Pagesは静的ファイルの公開機能であり、現在のログイン・API・PostgreSQLを含む業務アプリ本体をそのまま無料公開する場所ではない。
- Decision or rule: `.github/pages`に架空データだけのレビュー専用PWAを置き、GitHub Pagesの手動workflowで公開する。ページは4画面（今日の確認、在庫現場、棚卸差異、会計候補）を切り替え、ホーム画面追加、オフライン表示、修正依頼テンプレートを提供する。ログイン、API、DB、写真保存、出品、価格更新、会計CSV出力、外部送信は実装しない。実運用版はPC内のloopback環境に残す。
- Why: 完全無料でスマホから承認済みUIを確認できる一方、公開インターネットへ実データや認証機能を出さず、GitHub Pagesの静的公開境界を守るため。
- Applies to: `.github/pages`、`.github/workflows/pages.yml`、README、実iPhoneのUI確認、修正依頼フロー
- Verification: 静的ファイルの構文/機密scan、390×844とデスクトップ実ブラウザ、タブ切替、ダイアログ、manifest、Service Worker、外部URL0件を確認する。Pages有効化とworkflow成功はGitHub上で別証拠として確認する。
- Supersedes: スマホ確認を同一Wi-Fi内のローカルHTTPS中継だけに限定していた運用手順のうち、利用者が画面を確認する入口。ローカル中継は必要時の開発用予備経路として保持し、公開レビュー版へ実データを入力しない境界は維持する。
- Follow-up: GitHub Pages公開後、ユーザーがiPhone Safariで表示とホーム画面追加を確認する。実iPhoneでの確認結果をP06やP08の代替にしない。

### 2026-08-25 — スマホ版はB現場カードへCの気になる箇所チェックを統合する

- Type: decision
- Context: Slack `#メルカリ自動化` 親TS `1787631209.774569`、ユーザー本人の返信TS `1787633592.565739`
- Decision or rule: スマホ版の再設計はB案「iOS現場カード」を採用し、C案の「商品写真の気になる箇所をタップしてマーカーを置く」機能を統合する。フッターは `ホーム / 作業 / 商品 / 在庫 / 会計` に固定し、P0導線は1画面1目的の49ページとして9枚の高精度ボードで確認する。商品種類に応じて検品部位、写真チェック項目、採寸項目を切り替え、AIや画像認識だけで状態を確定しない。
- Why: 反復作業の残り件数と再開位置を分かりやすくしながら、シミ・傷などの位置と証拠を現物中心で残し、初心者にも検品から採寸までの流れを追えるようにするため。
- Applies to: `docs/design/selected-direction.md`、`mobile-ios-redesign-screen-map-v1.md`、`mobile-ios-redesign-genre-capture-v1.md`、高精度モック、後続のスマホPWA実装
- Evidence: https://p-evidence.slack.com/archives/C0BPZCB25T3/p1787631209774569
- Privacy boundary: 利用者提供の公開出品例は代表商品の手動閲覧に限定し、実アカウント名、URL、商品ID、実画像をGitやモックへ保存しない。
- Implementation gate: 現行写真roleと固定pilotを勝手に増やさず、`写真チェック項目 / 検品部位 / 気になる点 / 証拠写真` の関連と既存データ互換をSolが設計してから実装する。
- Follow-up: 9枚の高精度モックをSlackへ送り、全49ページの修正点を再確認する。実装、公開、PR mergeはこの承認だけでは行わない。

### 2026-08-26 — Slack画像本文のコメントだけを修正対象にする

- Type: decision
- Context: Slack `#メルカリ自動化` 親TS `1787631209.774569`の各ファイル本文へ追記された修正コメント、およびユーザー指示「修正コメントがあるところは修正していってください。ないところは問題ないところです。」
- Decision or rule: Board 01、02、03、06、07、10を修正し、コメントがないBoard 04、05、08、09は承認済みとして維持する。卸仕入れは請求書中心、商品ラベル読取と梱包写真は工程設定で選択、タグ文字はOCR候補、非文字ロゴは画像候補または手入力、商品種類はスーツとセットアップを追加する。ロゴは3案の再選定後にBoard 01へ固定する。
- Safety boundary: PhotoroomのローカルブラウザをCodex SkillやRPAで自動操作する方式は採用しない。P0は `加工用ZIP書出し → 利用者がPhotoroomで編集 → 加工済みZIP再取込 → SKU照合・原本比較 → 人が承認` を維持し、Photoroomなしでも完了可能にする。
- Why: 画像本文への直接コメントを承認・修正の根拠として正確に反映しつつ、中古品と1人運用に不要な工程を減らし、外部サービスの無人操作、契約違反、誤編集を避けるため。
- Applies to: `docs/design/mobile-ios-redesign-slack-revisions-v2.md`、修正版モック、スマホ画面構成、後続のPWA実装。
- Verification: 元の10ファイル本文を全件再読し、コメント有無を判定する。修正版の画像寸法、hash、画面数、安全文言を確認し、同じSlackスレッドで変更箇所だけ再承認する。
- Follow-up: ロゴ1案と修正版をSlackで再承認してから実装へ反映する。コード変更、公開、PR、mergeは別の明示依頼まで行わない。

### 2026-08-26 — Slack再コメントを無料・手動境界付きのv3モックへ反映する

- Type: decision
- Context: Slack `#メルカリ自動化` 親TS `1787631209.774569`の再コメント。ロゴは `C`、Board 10は `問題なし`、Board 02・03・06・07と販売後運用に追加要望がある。
- Decision or rule: ロゴCをBoard 01へ固定する。請求書はiPhone Files経由のファイル選択とし、Google Driveへの直接API接続・認証情報保存・自動同期は行わない。在庫番号は無料の手書きを標準、A4印刷を追加実装案とする。販売中の価格変更と返信文はコピー後に本人が公式画面で確定する。PhotoroomはZIPをPCで展開してフォルダを手動読込し、対象契約がない場合は編集を省略する。配送方法は販売先別に利用者が設定し、外部から自動取得しない。
- Implementation truth: 現行コードにはチェック数字付き在庫番号の生成、番号の手入力、ラベル再発行履歴がある。バーコードまたはQRの描画、A4印刷レイアウト、ブラウザ印刷は未実装であり、モックを実装済み証拠として扱わない。
- Why: 完全無料の標準導線を残し、メール・クラウド保存・画像編集・販売サイト操作を初心者にも理解できる手順へ分けつつ、外部サービスの無人操作や有料機能の誤認を防ぐため。
- Applies to: `mobile-ios-redesign-slack-revisions-v3.md`、v3修正版モック、後続のPWA実装、在庫ラベル、請求書、販売中サポート、画像受け渡し、配送設定。
- Verification: 6画像を1672×941で確認し、価格変更・返信・配送・Photoroomが人の操作を残すこと、API/RPA/自動実行を示さないこと、Board 10を再生成していないことを確認する。同じSlackスレッドで再承認を受ける。
- Follow-up: v3の6画像をSlackへ送り、コメントが付いた画像だけを次の修正対象とする。承認前にコード実装へ固定せず、コミット、push、PR、merge、公開は行わない。

### 2026-08-26 — 完全無料の写真標準からPhotoroom無料版とBatchを外す

- Type: decision
- Context: ユーザーの`絶対無料`条件、PhotoroomをPCで手動利用する案、Photoroom公式の2026-08-26時点のプラン・商用利用・Batch説明。
- Decision or rule: P0の写真標準は白背景撮影と端末内テンプレートによる向き・余白・文字位置の調整とする。Photoroom無料アカウントは商用利用不可、Batchは有料対象のため、無料の業務導線へ含めない。商用利用可能な契約済みソフトがある場合だけ、本人が任意で開く外部作業として扱う。
- Safety boundary: 外部画像編集サービスのAPI、認証情報保存、自動ログイン、RPA、自動クリック、無人Batch処理は行わない。背景除去を実装済みまたは無料と表示しない。
- Why: 無料という費用条件だけでなく商用利用条件も守り、外部サービスの仕様・契約・有料機能にP0を依存させないため。
- Evidence: `docs/research/mobile-ios-slack-followup-v4.md`、Photoroom公式Help Center、`mobile-ios-redesign-b-board-06-product-info-v4.png`。
- Applies to: 写真テンプレート、画像編集設定、Board 06、後続PWA実装、運用説明。
- Follow-up: v4画像の承認後、端末内テンプレートの保存形式、原本／派生画像の分離、文字位置、商品種類別の型を実装仕様へ落とす。

### 2026-08-26 — 仕入箱・商品URL・注文送料のv4案を再承認へ送る

- Type: design proposal
- Context: Slack `#メルカリ自動化` 親TS `1787631209.774569`のv3画像コメントと、ユーザー依頼「再度モック画像などを再構築してSlackに送ってください」。
- Proposal: 約50着の卸箱を保管箱と別の仕入バッチとして2段階検品し、箱別の見込み／実績を分ける。商品URLは販売先ごとに1回登録して本人操作で再利用する。注文はアプリ番号、販売先、取引ID、任意表示名へ分ける。送料は2026-08-26公式確認値と確認先を持つ手動更新カタログにする。
- Safety boundary: 見込みを確定利益にしない。URL先をサーバーから取得しない。送料をスクレイピングや非公開APIで自動更新しない。個人名・住所を主識別子にしない。
- Evidence: `mobile-ios-redesign-b-revision-index-v4.md`の4 hash、Slack file ID `F0BSR7TH89L`、`F0BSV41CF33`、`F0BSLUEBVJ7`、`F0BSR822U86`、送信後のスレッド再読。
- Status: 4画像とも画像コメントで再承認待ち。モックは実装済み証拠ではない。
- Follow-up: `問題なし`の画像だけを後続実装仕様へ固定し、`修正：...`が付いた画像だけを再修正する。承認待ちの間にコード、公開、commit、push、PR、mergeは行わない。

### 2026-08-26 — v4画像コメントを点数・KPI・根拠つき提案・写真処理境界へ反映する

- Type: design proposal
- Context: Slack `#メルカリ自動化` 親TS `1787631209.774569`のv4画像本文へ追記されたコメント。D注文・配送は`こちらは問題なし`、A・B・Cに修正要望がある。
- Proposal: 仕入箱は入数不明からカウントを開始し、短い商品番号と月別の30日販売率・売上・粗利見込みを表示する。価格見直しは自分の販売履歴、利益下限、公式公開の季節・行事情報を根拠に複数候補を比較する。写真はブランド・サイズ確認後に位置・余白・文字を端末内テンプレートで整え、人が明るさ・白さ・位置を微調整する。
- Safety boundary: 見込みを確定利益・税額にしない。販売サイトの閲覧・いいね・価格を自動取得せず、値下げやセールを自動実行しない。背景切り抜き、Photoroom連携、ZIPを実装済みまたは無料標準として表示しない。
- Evidence: `docs/research/mobile-ios-slack-followup-v5.md`、`docs/design/mobile-ios-redesign-slack-revisions-v5.md`、`docs/design/mobile-ios-redesign-b-revision-index-v5.md`の3 hash、Slack file ID `F0BSQJC640M`、`F0BTNUB43L0`、`F0BSUH0KXM0`、送信後のスレッド再読、メルカリ公式Help・公式ニュース。
- Status: Dは承認済み。A・B・Cの修正版を同じSlackスレッドへ送信済みで、画像コメントによる再承認待ち。モックは実装済み証拠ではない。
- Follow-up: コメントがある3画像だけを再作成・送信する。承認までコード、公開、commit、push、PR、mergeは行わない。

### 2026-08-26 — 箱KPIを次画面へ分け、全写真の保存と編集受け渡しを明示する

- Type: design proposal
- Context: Slack `#メルカリ自動化` 親TS `1787631209.774569`のv5画像コメント。Aは05・06の復元とKPIの次画面化、Cは全写真の保存先と将来自作する画像編集への連携準備、当面の一括受け渡しを求めている。Bはコメントなし、Dは承認済み。
- Proposal: Aの05`箱の見込み`と06`販売後の実績`をv1の内容へ戻し、07`月別KPI`を別画面にする。Cは全写真を商品別の写真一覧から見られるようにし、PC内非公開MediaStoreの不変原本、編集用コピー、加工後を分ける。役割別レシピとmanifestを共通契約にして、現在は手動編集用ZIP、将来は自作画像編集へ差し替える。
- Implementation truth: 現行コードには商品写真の役割別アップロード、PC内`LOCAL_MEDIA_ROOT`への非公開原本保存、DB上のMediaAsset管理がある。専用の商品写真一覧、編集用ZIP、加工後再取込、自作画像編集は未実装であり、モックを実装済み証拠として扱わない。
- Safety boundary: 原本を上書きしない。GitHub、Slack、Notion、公開URLへ写真を自動保存しない。Photoroomは商用利用可能な契約がある場合だけ本人が手動利用し、API、RPA、自動ログイン、自動クリック、無料版を商用標準にしない。
- Evidence: `docs/research/mobile-ios-slack-followup-v6.md`、`docs/design/mobile-ios-redesign-slack-revisions-v6.md`、`docs/design/mobile-ios-redesign-b-revision-index-v6.md`の2 hash、`apps/api/src/local-media-store.ts`、`apps/api/src/server.ts`、`packages/db/README.md`、Slack file ID `F0BST62CL78`、`F0BSNSJMJKV`、完了返信TS `1787751943.189469`、送信後のスレッド再読。
- Status: A・Cの修正版を同じSlackスレッドへ送信・再読済みで、画像コメントによる再承認待ち。B・Dは変更していない。モックは実装済み証拠ではない。
- Follow-up: A・Cの各画像へ付く`問題なし`または`修正：...`を確認する。承認までコード、公開、commit、push、PR、mergeは行わない。

### 2026-08-26 — モバイル版を最終承認し、PC版Webを全画面再確認する

- Type: design approval / review scope
- Context: SlackのA・C最終修正版へ依頼者本人がそれぞれ`問題なし`と追記し、「モバイル版は全て内容いい」「PCで見るウェブ版のモックも再度全て確認したい」と依頼した。
- Decision or rule: モバイル版は全内容承認済みとする。PC版は旧ホーム＋W01〜W12の機能範囲を保ちつつ、モバイル最終承認で確定した易しい日本語、安全境界、仕入箱、全写真保存、編集用セット、価格支援、配送、在庫、会計を反映した13ボード・52画面相当として再確認する。
- Safety boundary: PC版も外部サイトを自動取得・操作せず、API、RPA、自動出品、自動値下げ、自動返信、自動会計確定を示さない。原本写真はPC内の非公開保管、外部編集は任意の手動受け渡し、重要操作は人が確認する。
- Evidence: モバイルSlack親TS `1787631209.774569`、A file ID `F0BST62CL78`、C file ID `F0BSNSJMJKV`、各画像本文の`問題なし`、PC版Slack親TS `1787754933.967639`、PC01〜PC13の13 file IDとhashを記録した`docs/design/pc-web-redesign-full-mock-index-v1.md`、送信後のスレッド再読。
- Status: モバイル版承認完了。PC版13ボード・52画面相当をSlackへ送信・再読済みで、画像コメント待ち。
- Follow-up: PC版の各画像へ付く`問題なし`または`修正：...`を確認し、コメントがある画像だけを修正する。承認まで実装、公開、commit、push、PR、mergeは行わない。

### 2026-08-27 — PC版4画像を無料・手動境界付きのv2案へ修正する

- Type: design proposal
- Context: PC版Slack親TS `1787754933.967639`の画像本文へ、PC02、PC03、PC07、PC08の修正・質問が追記された。ほか9画像にはコメントがない。
- Proposal: PCではカメラを起動せず、OSのファイル選択と同じ業務アプリ内のスマホ写真反映を使う。在庫ラベルはA4 24面へ一括印刷する。商品ページはギャラリーでも表示し、販売状況は確認が古い順に並べ、直接入力またはスクリーンショットからの数字候補を人が確認する。注文は仮番号を自動付番し、取引IDが不明でも取り出し・梱包を続け、発送確定前に不足を確認する。
- Official evidence: 個人版メルカリの公式ヘルプは出品中の商品詳細で閲覧数・検索数を本人が確認する方法を案内する。メルカリShopsの公式APIは別サービスで、契約とアクセストークンを前提とする。個人版統計の無料・承認済み公開連携は今回確認できなかった。
- Safety boundary: iCloudへアプリから直接接続せず、PCに表示されるフォルダーから本人が選ぶ。販売サイトを自動取得せず、スクレイピング、RPA、Cookie共有、自動ログイン、自動値下げ・返信を行わない。スクリーンショット読取は候補で、人が原画像と比較して確定する。
- Evidence: `docs/design/pc-web-redesign-slack-revisions-v2.md`、`docs/design/pc-web-redesign-revision-index-v2.md`、Slack回答TS `1787757617.559609`、file ID `F0BSS2EV60M`、`F0BSPQKJGCB`、`F0BSW1N1QN6`、`F0BSS2J5H61`、完了返信TS `1787757680.513539`、送信後のスレッド再読。
- Status: v2修正版4枚を同じSlackスレッドへ送信・再読済みで、画像コメント待ち。コメントのない9枚はv1を維持する。モックは実装済み証拠ではない。
- Follow-up: v2画像にコメントがある場合だけ再修正する。4枚の承認がそろうまでコード実装、公開、commit、push、PR、mergeへ進まない。

### 2026-08-27 — PC版3画像を検索支援・中古1番号・選択式発送前写真のv3案へ修正する

- Type: design proposal
- Context: PC版Slack親TS `1787754933.967639`のv2画像へ追加されたコメント。PC02は販売予想金額の簡単な検索・Codexへの調査依頼、PC03は中古1点ものの商品番号と在庫番号、PC08は1人運用の梱包写真に修正希望があり、PC07は`問題なし`である。
- Proposal: PC02は商品情報から検索語とCodex用質問文を作り、本人が検索を開くかコピーする。PC03は中古の商品番号＝在庫番号を一つの短い番号にし、登録商品ごとに異なるラベルを1枚作ってA4 24面へ並べる。新品の複数在庫だけ別管理を選べる。PC08は発送前写真を高額商品だけ、すべて、使わないから選び、高額の目安も設定できるようにする。
- Safety boundary: メルカリやCodexへアプリから自動送信せず、検索結果を自動取得しない。API、スクレイピング、RPA、自動ログイン、Cookie共有を使わない。予想価格と発送前写真の扱いは人が確認し、写真を外部へ自動送信しない。
- Evidence: `docs/design/pc-web-redesign-slack-revisions-v3.md`、`docs/design/pc-web-redesign-revision-index-v3.md`の3 hash、Slack回答TS `1787809522.481109`、file ID `F0BSZJXD2DC`、`F0BT57MCYDS`、`F0BSXGH6SH3`、完了返信TS `1787809627.514159`、送信後のスレッド再読。
- Status: PC02・PC03・PC08のv3修正版3枚を同じSlackスレッドへ送信・再読済みで、画像コメント待ち。PC07 v2とコメントのない9枚は変更していない。モックは実装済み証拠ではない。
- Follow-up: v3の3画像へ付く`問題なし`または`修正：...`を確認する。承認まで今回の修正内容をコードへ実装せず、公開、commit、push、PR、mergeへ進まない。

### 2026-08-27 — PC03へ商品別バーコードを戻し、承認済みUI追補でGoalを継続する

- Type: design approval / implementation resume
- Context: PC03 v3へ`一括印刷からバーコードが消えた`、`スマホで読んで商品を探したい`という最後のコメントがあり、ユーザーから`修正箇所は少ないので修正後goalを実行してください`と指示された。
- Decision or rule: PC03 v4は中古1点ものの各ラベルへ異なる短い番号と個別Code 128を表示し、スマホ読取で商品と現在の保管場所を開く。読取は検索だけで、格納・移動・出庫を確定しない。PC02 v3、PC08 v3はコメントなし、PC07 v2は`問題なし`、ほか9枚はコメントなしとしてPC版を固定する。
- Implementation truth: 既存Webはチェック値付き在庫番号、手入力、二重確認を実装済みだが、バーコード描画、A4 24面、画像からのコード解析、検索専用スマホ画面は未実装である。52画面の画像だけを実装済み証拠にしない。
- Safety boundary: 読取ライブラリはPWAへ同梱し、カメラ画像、番号、商品情報を外部APIやCDNへ送らない。手入力を残し、状態変更には従来どおり人の確認を要求する。本番公開、PR merge、課金は行わない。
- Evidence: `docs/design/pc-web-redesign-board-03-putaway-v4.png`、SHA-256 `c364acdde34a7f70b1a81177758afefbdfa919f033693697ab48210c7bc12af9`、Slack file ID `F0BSM3XPRQF`、TS `1787818024.476329`、送信後のスレッド再読。
- Applies to: `docs/specs/approved-ui-integration-addendum-v1.md`、AC-062〜068、TA-044〜048、`docs/implementation/approved-ui-packets-v1.md`、P11〜P14。
- Follow-up: P11バーコードから順に実装し、P12/P13はSol設計後に進める。全P0差分後に自動検証、UI評価、実利用者pilot、独立Sol reviewをやり直し、P1はP0合格までOFFにする。

### 2026-08-27 — 承認モック全101画面を忠実再現してから機能追加を再開する

- Type: implementation fidelity gate
- Context: 実装中の在庫ラベル画面が承認済みPC03 v4と大きく異なり、ユーザーからモバイル版とPC版の全ページを承認モックどおりに再現するよう明示された。
- Decision or rule: モバイル49画面とPC 52画面を画面単位で再現し、承認画像との比較を通過した画面だけ完了とする。共通部品を使う場合も、承認画像の配置、文言、色、余白を変える抽象化は行わない。
- Implementation truth: 現行WebにはP0の主要機能と一部の新しいバーコード機能があるが、承認済み全101画面のデザイン再現は未完了である。機能が動くことをデザイン一致の代わりにしない。
- Safety boundary: 画面画像を貼るだけの偽実装にせず、HTMLの操作可能な画面にする。外部API、外部CDN、有料サービス、自動出品、自動値下げ、自動返信、自動会計確定を追加しない。公開レビューは架空データだけにする。
- Evidence: `docs/implementation/approved-ui-fidelity-gate-v1.md`、モバイル最終承認TS `1787631209.774569`、PC最終承認TS `1787754933.967639`、ユーザーの本セッション内指示。
- Applies to: `apps/web`、`.github/pages`、UI比較、P11〜P14、Goalの再開判定。
- Follow-up: 全101画面の同寸法スクリーンショットを撮り、差がある画面を未完了へ戻す。デザイン比較後に実データと安全な状態変更を再接続する。

### 2026-08-27 — 追加フロー26画面を含む全127画面へ忠実再現範囲を拡張する

- Status: accepted
- Context: 「モバイル版も、PC版も全ページ忠実に再現」という依頼と、承認正本一覧に基本49画面とは別キーで残している写真、仕入箱、販売支援、スーツ撮影ガイドの26画面。
- Decision or rule: 直前の101画面ゲートを上書きせず拡張し、モバイル75画面とPC 52画面の合計127画面を比較対象にする。番号が重なる承認画像も削除せず、追加画面キーで実装する。
- Implementation truth: 基本導線49画面だけでは「全ページ」にならない。追加26画面もWeb実装とGitHub Pages確認版の両方へ含め、各正本画像と照合する。
- Applies to: `docs/design/approved-ui-source-manifest-v1.md`、`docs/implementation/approved-ui-fidelity-gate-v1.md`、モバイル確認画面、PC確認画面、公開レビューPWA。
- Evidence: 本セッション内のユーザー指示と、最終承認画像 `mobile-ios-redesign-b-board-06-product-info-v6.png`、`mobile-ios-redesign-wholesale-box-inspection-v3.png`、`mobile-ios-redesign-sales-support-v3.png`、`mobile-ios-redesign-b-board-10-genre-guide-v2.png`。
- Rejected alternatives: 基本49画面だけを再現して追加画像を参考資料扱いにする案は、承認済み内容を欠落させるため不採用。
- Follow-up: 全127画面を実ブラウザで比較し、差異が残る画面は完了扱いにしない。

### 2026-08-29 — 承認済みUI全127画面の忠実再現ゲートを合格とする

- Status: accepted
- Context: モバイル75画面とPC52画面を最終正本へ合わせ、390×844と1440×960で再撮影し、25比較シートで全画面を再監査した。
- Decision or rule: `root-all-fidelity-final-fix23-20260829` を今回の最終画面証拠とし、独立監査のP0 0件・P1 0件をもって承認済みUI忠実再現ゲートを合格とする。端末ステータスバーとブラウザ描画差だけをP2として許容する。
- Verification: 127/127 route、127/127 viewport、比較画像127/127、外部runtimeリソース0件、静的レビュー版766ファイル、通信遮断時の代表モバイル・PC画面cache-storage表示を確認した。
- Safety boundary: 画面画像の貼り付けではなく操作可能なHTMLを維持する。有料サービス、外部API、公開、本番反映、PRマージは行わない。実iPhone、実利用者pilot、実Money Forward取込は別gateのまま残す。
- Applies to: `apps/web`、`apps/review`、`.github/pages`、全127画面のUI比較、Draft PRのデザイン受け入れ判定。
### 2026-08-18 — Claude CodeへSlack MCPを接続し、既存チャンネルを承認先として使う

- Type: decision
- Context: `.claude/skills/app-development-orchestrator/SKILL.md`のフェーズ4（UI/UX3方向の承認）。ユーザーがSlackとClaude Codeを接続したと明示。
- Decision or rule: 新しいチャンネルを作らず、既存の承認履歴があるワークスペース「P-evidence開発」チャンネル`#メルカリ自動化`（ID `C0BPZCB25T3`）を確認済み送信先として使う。`slack_search_channels`で2026-08-18にチャンネルIDの一致を再確認した。送信前は毎回同様に再確認し、1️⃣/2️⃣/3️⃣等のリアクションではなく必ずスレッドへの明示的な文章返信を承認の確定条件にする。
- Why: `docs/design/slack-approval.md`が既に記録している通り、Slack接続がユーザー本人名義で動くためリアクションだけでは他者の反応と区別できない。既存チャンネルを使うことでAGENTS.mdの「対象と権限が明示された場合だけSlackへ送信する」を満たす。
- Applies to: `.claude/skills/app-development-orchestrator/SKILL.md`のフェーズ4、今後のUI/UX承認フロー全般
- Verification: `slack_search_channels`でチャンネル名とID `C0BPZCB25T3` の一致を確認済み。
- Follow-up: none

### 2026-08-21 — GitHub Projectを作業進捗の共通正本にする

- Type: decision
- Context: GitHub Project `AI App Delivery`、`docs/implementation/github-projects-workflow.md`
- Decision or rule: 複数アプリの作業進捗、リスク、実装モデル、Solの設計・最終レビュー、利用者承認はGitHub Projectで横断管理する。1作業はGitHub Issueで定義し、実装証拠はPull Request、詳細仕様は`docs/`、重大または再発し得る失敗は`memory/incidents/`へ置く。Slackは利用者承認の証跡、Notionは必要時の限定ミラー、ObsidianはGit管理下の文書を開く閲覧・編集手段とする。
- Why: 進捗を一箇所で見渡しながら、仕様・承認・失敗の詳細を安全な正本へ残し、ツール間の二重管理と推測による実装を防ぐため。
- Applies to: `komatsu-dev-jp/seller-assistant`、今後このProjectへ追加するアプリ、`.github/ISSUE_TEMPLATE/`、`.github/PULL_REQUEST_TEMPLATE.md`
- Verification: Project #1に`Status`、`リスク`、`実装モデル`、`Sol ゲート`、`利用者承認`、`仕様・実装パケット`、`学び・失敗ログ`を設定し、一覧と進捗ボードを作成した。Issue/PRテンプレートと本運用書の参照先を確認する。
- Follow-up: 各実装IssueでSolの仕様・実装パケットをリンクし、必要な作業だけをProjectへ追加する。
