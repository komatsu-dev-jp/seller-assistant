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
