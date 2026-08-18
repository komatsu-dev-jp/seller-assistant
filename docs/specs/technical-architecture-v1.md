# フリマ物販業務アプリ（仮称）｜技術アーキテクチャ v1

- 状態: Goal開始・P0実装中（Slack最終承認 `1786721887.034329`、2026-08-15 JST）
- 更新日: 2026-08-15（JST）
- 方針: iPhone PWAは現場作業、PC Webは高密度管理、サーバーを唯一の確定データ源にする。開発・検証費用は0円とする

## 1. 推奨技術構成

### 推奨

| 領域 | 推奨 | 理由 | 弱点・確認点 |
|---|---|---|---|
| PWA/Web | Next.js 16.3.1 + React 19.2.8 + TypeScript 5.9.3 | PC業務画面と、iPhoneのホーム画面へ追加できる現場画面を同じ技術で作れ、Windowsだけで検証できる | iPhone Safari固有のカメラ・保存制限は実機確認が必要 |
| API | Node.js + TypeScriptの独立API | PWAとPC画面で同じ業務ルールを使える | Webだけより構成要素が増える |
| 契約 | OpenAPI + JSON Schema | APIの入出力を機械検証できる | 生成物の版管理が必要 |
| DB | PostgreSQL | 取引、在庫、監査、権限、集計を一貫して扱える | 運用・バックアップが必要 |
| 認証/DB/Storage | ローカルのPostgreSQLと開発用ファイル保存adapter | 無料のオープンソース構成で安全境界を検証できる | 本番サービス選定・接続・公開は今回対象外 |
| 画像 | 非公開Storage契約 + ローカル開発adapter | 本番の署名URL境界を保ちつつ、検証は無料で行える | 本番保存費・転送費の選定は将来の再承認事項 |
| 非同期処理 | PostgreSQL outbox + worker | 外部同期やAI処理の再試行を、追加の大型基盤なしで開始できる | 規模増加時は専用キューへ移行が必要 |
| AI | 無料の決定的テンプレート + 将来のprovider adapter | 候補/確定分離を0円で検証し、有料AIなしでもP0を完了できる | 外部AI接続は将来の明示承認事項 |

### 代替案

- SwiftUI/React Native: ネイティブ機能は増えるが、Mac、Xcode、配布作業が必要になるため、ユーザーの0円・Mac不要条件から対象外とする。
- PWAを採用する: Safariの「ホーム画面に追加」、Webカメラ入力、手入力fallback、Service Worker、IndexedDBで現場導線を実現する。ネイティブショートカットと端末内自動OCRはP0対象外とする。
- Firebase: モバイル連携は強いが、在庫・会計・監査の関係データと複雑な集計はPostgreSQLの方が自然。

実装依存は `package-lock.json`（依存版を固定するファイル）で固定した。有料サービスへ接続せず、Windows上のローカル実装・検証で0円を維持する。本番用PostgreSQL/Auth/Storage/AIの提供事業者は今回選定しない。

## 2. モノレポ構成案

モノレポは、PWA/Web、API、共通契約を一つのGitリポジトリで管理する方式。

```text
apps/
  web/                 # PC Web + iPhone PWA
  api/                 # PWA/Web共通API
  worker/              # AI、画像、CSV、Notion同期
packages/
  domain/              # 業務ルール。外部SDKへ依存しない
  contracts/           # OpenAPI/JSON Schemaと生成物
  db/                  # SQL migration、RLS、seed
  ui-web/              # Web共通部品
  config/              # lint/test/build共通設定
docs/
  specs/ design/ research/
tests/
  fixtures/ contracts/ e2e/
```

- PWA/APIは `packages/contracts` の同じschema版を使う。
- 業務計算は可能な限り `packages/domain` へ置き、画面や外部SDKへ混ぜない。
- 実装時の正確なディレクトリはGoal確認後に作成する。

### 旧実装の扱い

- `docs/specs/legacy-asset-audit.md` のファイル別allowlistだけを参照し、旧コード、依存、Git、実データ、生成物を丸ごとコピーしない。
- 原本不変、冪等、競合、途中失敗時の未公開、path越境拒否は新しい契約testとして振る舞い移植する。
- 旧Notion読取正本、iCloud watcher、Tesseract、自作画像加工、自動readyは現architectureと矛盾するため移植しない。
- 移植前後に絶対path、service識別子、秘密pattern、商品/個人データ、生成物が0件であることを検査し、ファイル単位の判断を同監査へ追記する。

## 3. コンポーネント境界

1. PWA: Webカメラ写真、採寸入力、商品・場所コード確認、場所写真ガイド、最小情報のオフライン同期待ち、担当作業。
2. Web: ホームC、一覧、承認、チーム、在庫場所ツリー、棚卸差異、分析、会計CSV、設定。
3. API: 認証、権限、入力検証、状態遷移、冪等性、署名URL発行。
4. Domain: 原価、利益、在庫場所の不変条件、移動、棚卸差異、採寸警告、承認、価格下限、CSV検査。
5. Worker: AI候補、画像ジョブ、ZIP/CSV、Notion一方向同期、通知。
6. PostgreSQL: 確定データ、候補、履歴、監査、外部同期状態。
7. Object Storage: 原本、派生、証憑、ZIP。すべて非公開を初期値にする。
8. External Adapters: 販売チャネル、Photoroom、Notion、会計ソフト、AIを個別に隔離する。

外部サービス固有の項目を中心データへ直接広げず、adapter（外部仕様を内部形式へ変換する層）で変換する。

## 4. 主要データモデル

### 所有と識別

- `workspace`: 事業単位。全業務データは必ず1つへ所属する。
- `user`, `membership`, `role`, `permission_grant`: 人と権限。
- `product_sku`: 出品・商品情報の単位。`workspace_id + sku_code` を一意にする。
- `inventory_unit`: 現物1点。P0は1つの`product_sku`に有効な1件だけを持ち、変更不可の`inventory_number`をworkspace内で一意にする。
- `purchase_batch`, `receipt`, `cost_allocation`: 仕入と原価。
- `supplier`: 仕入先。分析用の安定IDを持つ。

### 商品作業

- `product_attribute_candidate`: OCR/AI/外部根拠からの候補。
- `product_attribute_fact`: 人が確定した値。候補を上書きしない。
- `research_evidence`: URL、検索条件、観測値、採否、確認者、日時。
- `measurement_definition`: 測定名、線、基準、版。
- `measurement_attempt`: 値、単位、基準、状態、測定者、証拠、試行番号。
- `listing_revision`: 商品名・説明・価格の版と承認状態。

### 在庫・取引・会計

- `location_node`: 保管場所。`site / room / zone / rack / rail / level / bin / slot`、親、場所コード、表示名、状態、`can_store_inventory`、`capacity_kind(single_unit|max_units|unlimited)`、`max_units`、`mixing_policy`を持つ。同一workspace内の親だけを参照し、循環を禁止する。
- `location_photo`: 部屋全景または正確な位置の案内写真。非公開MediaAsset、版、ハッシュ、撮影者、`pending_review / approved / rejected`を持つ。
- `inventory_label`: 商品または場所の内部ラベル。128 bit以上の推測不能tokenのハッシュ、短いコード、対象、種別、版、状態、再発行履歴を持つ。token hashは全体一意、短いコードはworkspace内の有効ラベル間で一意、対象/種別ごとの有効版は部分一意制約で1件だけとする。生tokenや業務情報をDBの検索可能列へ保存しない。
- P0のラベル出力は画面表示と通常のA4/PDFだけに依存し、専用プリンターSDKを持たない。P1の一括出力も同じlabel版と失効履歴を使う。
- `inventory_movement`: 受入、格納、移動、ピッキング、返品、調整の追記型履歴。移動元/先、理由、担当、scan session、商品/場所ラベルID・版・読取日時、人の確認、操作ID、冪等キーを持つ。
- `count_session`, `count_observation`, `inventory_discrepancy`: 棚卸開始時の`basis_movement_seq`と期待対象、開始後の通常移動、全読取、差異分類、再確認、解決理由、承認を保持する。
- `location_assignment`: 利用者、場所ツリーの枝、許可作業、期限を結び、外注の操作範囲を限定する。
- `order`, `shipment`, `return_case`: 注文、配送、返品。
- `financial_event`: 売上、返金、原価、手数料、送料等の追記型事実イベント。`amount_minor`（最小通貨単位の整数）、`currency`、`tax_inclusion`、`tax_category`、`burden_party`、`source_kind/id/hash`、`source_amount_semantics`、`occurred_at`、`rule_version`、`reverses_event_id` を持つ。
- `order_price_fact`: 注文時商品価格、販売者負担割引、チャネル負担クーポン、返金前の販売者商品収入を分離し、取得元が値引/返金を反映済みかを示す。
- `journal_candidate`: 仕訳候補、根拠、ルール版、承認。
- `export_batch`: CSVの対象、件数、合計、ハッシュ、作成者、承認者、状態。

### 共同作業

- `task`, `assignment`, `handoff`, `approval`: 担当、期限、引継ぎ、承認。
- `audit_event`: 誰が、いつ、何を、なぜ、どの値からどの値へ変えたか。
- `outbox_event`, `sync_operation`: 外部連携と再試行。

重要な履歴は更新だけで消さず、版または取消イベントを追加する。

P0の箱・棚は動かない`location_node`として扱う。箱自体の移動と中身の一括移動を行う可動containerはP1の`inventory_advanced`が有効な場合だけ追加する。

### 金額正規化と二重控除防止

- JPYは1円単位の整数で計算し、JavaScriptの浮動小数点へ変換しない。他通貨は通貨指数を設定で固定する。
- channel adapterは取得値を足し引きする前に `gross_before_seller_discount`、`seller_revenue_pre_refund`、`net_after_refund` 等の意味へ分類し、分類できない値を0円扱いしない。
- `seller_revenue_pre_refund` が取得元に存在する場合、販売者負担割引を再控除しない。標準価格変更後の注文価格へ同じ値下げ額を再度引かない。
- 成功済み返金だけを元売上イベントの取消として計上する。返金後金額が取得元なら元金額へ正規化するか、差額イベントだけを作り、同じ返金を二度引かない。
- チャネル負担クーポンは買い手価格だけを下げ、販売者収入から控除しない。手数料返還は手数料の反対イベントとし、返金へ混ぜない。
- 税込/税抜/税区分/負担者が不明なら `unknown` のまま確定集計を停止する。AIが補完しない。
- 端数処理は取得元の公式規則または利用者/税理士承認済み規則の版を保存し、表示とCSVで同じdomain関数を使う。
- 固定fixtureには少なくとも「値引後売上9,000円へ1,000円を再控除しない」「チャネル負担1,000円でも販売者収入10,000円」「9,000円全額返金と900円手数料返還」「一部返金」「返品在庫復帰」を含める。

## 5. 写真・加工ジョブの差し替え設計

### MediaAsset

- `kind`: original / derivative / thumbnail / receipt / measurement_evidence / packing_evidence / location_overview / location_position
- `sha256`, `mime_type`, `size_bytes`, `width`, `height`, `storage_key`
- `workspace_id`, `sku_id`, `captured_by`, `captured_at`
- 原本はimmutable（内容を後から変えない）とし、新しい版を別Assetで作る。

### ProcessingRecipe

- レシピID、版、背景、中央配置、余白、出力サイズ、生成系OFF等。
- 変更時に既存結果を上書きせず、新版を作る。

### ProcessingJob

- 入力Asset、レシピ版、provider、状態、試行回数、冪等キー、担当、開始/完了日時。
- 状態: queued / exported / processing / imported / needs_review / approved / failed / cancelled。
- 結果は `processing_result` に入力ハッシュ、出力ハッシュ、検査、承認を保存する。

### Provider共通契約

```text
prepare(job) -> manifest
submit_or_export(job) -> external_reference or archive
poll_or_import(job) -> result candidates
validate(job, result) -> checks
```

- MVP: `manual_photoroom` はZIPとmanifestを出し、人が処理後ZIPを戻す。
- 将来: `internal_engine` は同じ契約で非生成処理を実行する。
- 許諾後: `official_api` は同じ契約で公式APIを呼ぶ。
- どのproviderでも原本比較と人の承認を省略しない。

## 6. API・イベント・同期

- APIは `/v1` で開始し、破壊的変更は新しい版へ分ける。
- 変更APIは `Idempotency-Key` を必須にし、同一主体・経路・キーの重複結果を再利用する。
- 更新は楽観ロック用 `version` を持ち、同時編集を無言で上書きしない。
- 状態遷移はAPI側で検証し、画面から任意の状態へ書き換えられない。
- 確定変更とoutboxイベントを同じDB transaction（全体を一括成功/失敗させる処理）で保存する。
- Workerは `for update skip locked` 等でジョブを安全に取得し、指数バックオフと上限回数を持つ。
- Web/PWAには最終同期、処理中、再試行、失敗参照IDを返す。

### 業務別状態機械

- `inventory_unit`: `received → inspection_pending → putaway_pending → available → reserved → picked → packed → shipped`。取消/引当解除は現物を再格納して`reserved|picked → available`、返品は`shipped → return_received → quarantined → inspection_pending → putaway_pending|available|disposal_pending → disposed`とする。active予約は`(workspace_id, inventory_unit_id)`の部分一意制約で1件だけにする。
- `location_node`: `active ↔ suspended → retired`。子や在庫が残る場所はretiredへできず、suspended/retiredへの新規格納を拒否する。
- `count_session`: `draft → counting → reconciliation → approved`。開始時の対象snapshot/`basis_movement_seq`と読取記録は不変とし、開始後の通常移動を差し引いて照合する。差異だけで現在地や数量を自動変更しない。
- `inventory_movement`確定時は、1回限りのscan session、追記イベント、`inventory_unit.current_location_id`、場所の利用数、監査、outboxを同一transactionで保存する。`available / reserved / picked / packed`は同一workspaceの`active`かつ`can_store_inventory=true`の固定場所を正確に1つ持ち、場所なしは`putaway_pending`等にする。容量判定は場所行をlockして同時超過を防ぐ。
- `approval`: `draft → pending → approved|rejected|changes_requested`。pending中の対象revisionを固定し、重要操作では提出者の自己承認をDB/APIで拒否する。
- `export_batch`: `preparing → ready → downloaded → confirmed`、例外は `failed|expired`。承認済みrevisionだけを対象とし、manifest/hashをready時に固定する。
- 各transitionは許可role、元状態、対象version、前提条件、理由必須性、副作用（履歴、監査、outbox）をdomain tableとしてテストする。
- `Idempotency-Key` とrequest payloadのSHA-256を保存する。同一key・同一hashは保存済み結果を返し、同一key・異なるhashはHTTP 409相当で拒否する。
- 同時実行テストは2注文の同一SKU引当、二重承認、CSV二重確定、outbox二重配送をbarrier同期で再現し、DB一意制約とtransactionで片方だけ成功させる。

## 7. オフライン・再送・冪等性

- PWAはIndexedDBへ、操作ID、在庫管理番号、場所コード、作成日時だけを固定schemaで保存する。画像、住所、原価、証憑本文、税務資料、外部API秘密を同期待ちへ保存しない。
- session/refresh tokenはHttpOnly・Secure・SameSite Cookie（画面のJavaScriptから読めない認証Cookie）だけで扱い、localStorage、sessionStorage、IndexedDB、Cache Storageへ保存しない。
- APIのDB接続は`resale_app_runtime`を付与されたLOGINロールだけを許可し、起動前に`SUPERUSER`、`BYPASSRLS`、runtime未所属を拒否する。migration/初期owner用の管理接続を通常APIへ渡さない。
- Service Workerは画面のapp shellだけをCache Storageへ保存し、`/api/`応答と業務データをキャッシュしない。サーバー確定前は現在地を確定表示しない。
- ログアウトは最初にサーバーsessionを失効させ、Cache Storage、IndexedDB、Service Workerが保持する業務データを削除して0件を確認する。送信済み原本はサーバー正本を残す。
- 割当解除はサーバーで即時拒否し、次回同期時に対象キャッシュを消す。オフライン端末へ即時到達できないため、外注assignment leaseは最大24時間、住所表示grantは最大5分にする。
- 大きな画像は再開可能アップロードを使い、完了後にサーバーハッシュを照合する。
- 同じ画像ハッシュでも役割が異なる場合は関連を分け、同一アップロード本体は再利用できる。
- 再送は同じ操作IDを使い、サーバーが二重仕入、二重承認、二重出力を防ぐ。
- 競合時は勝手に新しい方を採用せず、変更差分と担当者を表示する。
- 格納・移動・ピッキングは端末上で「商品読取→場所読取→人の確認」を行う。オフライン中は`同期待ち`として保存するだけで、サーバー確定前に現在地を確定表示しない。
- 再送時に現在地、場所版、割当が変わっていれば自動上書きせず、商品と場所の再読取または棚卸差異解決へ進める。
- BarcodeDetector非対応、カメラ拒否、ラベル損傷時は、チェック値付き在庫管理番号/場所コードの手入力と人の確認へ切り替える。P0は自動コード認識を必須にしない。

## 8. 認証・権限・個人情報

- P0の初期認証は、外部費用0円のためNode.js標準scryptによるメール/パスワードとする。N=2^17、r=8、p=1、salt 16 bytes以上、hash 32 bytesを下限とし、平文は保存しない。失敗応答を共通化し、同一識別子+接続元の5回失敗を15分停止する。初期ownerは公開APIではなくローカルの一回限りCLIで作成する。
- 将来メールOTP/外部ログインを追加する場合は送信費、可用性、契約、Apple要件を再承認する。
- 短命なsession tokenを使い、APIキーや外部サービス認証情報を端末へ埋め込まない。
- APIで役割を判定し、PostgreSQL RLS（行単位のアクセス制御）でもworkspace越境を遮断する。
- 実行roleは `app_user`、`worker_limited`、`migration_admin` に分け、通常API/workerへRLS bypass、table owner、service-role相当の常用権限を与えない。
- 全業務テーブルの主キー/外部キーに `workspace_id` を含め、複合外部キーで別workspaceのIDを参照できないようにする。
- workerは限定されたsecurity-definer claim関数からjob IDとworkspace IDだけを受け取り、各transactionで署名済みjob claimを検証して `SET LOCAL app.workspace_id` 相当を設定する。その後の読書きはRLS対象とする。
- Storage keyは `workspaces/{workspace_id}/...` 固定とし、bucket policyとDB grantの両方が一致した時だけ読書きする。公開bucketを使わない。
- worker、署名URL、Storage直接uploadについて、別workspaceのread/write/update/delete、job横取り、prefix偽装をすべて拒否する否定テストを持つ。
- 購入者住所は一般商品テーブルから分離し、暗号化、期限、理由付きアクセスを使う。
- 画像URLは短命の署名URL。公開bucket、連番URL、推測可能URLを使わない。
- 外注者は割当中SKUだけを対象とし、原価、利益、住所、税務は役割別に非表示/拒否する。
- 在庫外注者は`location_assignment`で割り当てられた場所の枝と作業種別だけを操作できる。QR読取は対象を示すだけで権限を付与せず、API/RLSで毎回確認する。
- 場所案内写真は非公開Storageに置き、割当枝の範囲内だけ短命URLを発行する。ブラウザの位置情報権限は要求せず、表示用派生ではGPS等の位置EXIFを除去する。
- 権限テストはUI表示だけでなく、APIとDBの拒否まで検証する。

## 9. AI処理と監査

- 画像・OCR・文章・仕訳ごとに `ai_run` を作り、provider、model、prompt_version、入力参照、出力、usage、状態を保存する。
- 原本の個人情報や不要な購入者情報をAIへ送らない。送信前に対象フィールドをallowlistで限定する。
- 出力はJSON Schemaで検証し、不正形式や低信頼を要確認にする。
- AI出力先は候補テーブルだけ。確定テーブルへ直接書かない。
- 人の採用・修正・却下、理由、日時を保存し、後から根拠を追えるようにする。
- prompt全文または版管理対象をリポジトリへ保存し、秘密情報を含めない。
- 利用モデル、データ保持、価格、レート制限はGoal開始時に公式資料で確認する。

### AuditEventの安全なschema

- 必須: `event_id`、`workspace_id`、`actor_ref`、`action_code`、`target_type/id`、`occurred_at`、`reason_code`、`approval_ref`、`request_id`。
- 差分は安全な `changed_field_names`、allowlist済み非機密値、または `before_digest/after_digest` と機密record参照IDだけを持つ。
- 住所、token、Cookie、APIキー、証憑本文、画像本体、AI入力/出力全文、自由記述の秘密値をaudit payloadへ入れない。
- JSON Schemaで未知フィールドを拒否し、禁止キーと高entropy秘密patternをfixtureで検査する。監査詳細画面も参照先の現行権限を再確認する。

## 10. 外部連携の境界

### 販売チャネル

- 個人版adapterは「準備パッケージ」と公式画面URLだけを返し、書込みAPIを持たない。
- Shops CSV adapterは公式列と画像対応を検証し、CSV/manifestを作る。2026-08-13確認時点の中核必須列は `商品画像名`、`商品名`、`SKU1_在庫数`、`販売価格`、`カテゴリID`、`商品の状態`、`配送方法`、`発送元の地域`、`発送までの日数`、`商品ステータス`、`配送料の負担`。`送料ID` 等の条件付き必須も公式template規則から検査する。
- CSVは1行1商品、商品ステータス `1:非公開` 固定、商品名130文字以下、販売価格300〜9,999,999円、商品画像最大20枚とする。jpg/jpeg/png、1枚8MB以下、1回1GB以下を事前検査する。P1の既定batch上限は新規個人事業主制限を考慮して200商品とする。
- Goal開始時と各出力前30日以内に公式template/masterを取得し、取得URL、確認日時、SHA-256、schema版を保存する。列や制約がsnapshotと違えば出力を停止してadapterを更新する。
- 新規登録CSVと更新CSVは別schema/adapterにする。更新CSVは公式管理画面から取得した現行商品データを入力正本とし、商品ID、SKU ID、変更不可IDを保持して、価格等の対象変更列だけを出力する。
- 更新CSVは対象ID集合、件数、変更前後値、重複、タイムセール中/予約中等の対象外状態を全件照合する。人がプレビュー・公式アップロード・結果照合を行い、失敗行と公式結果を監査へ残す。
- Shops API adapterは初期OFF。契約・書面承認・識別子・現行仕様確認を設定で証明してからONにする。
- Shops APIの `imageUrls` には、承認済み派生画像1点だけを指す専用grant URLを使う。GET/HEADのみ、最大60分、最大20取得、推測不能IDとし、API完了・失敗・取消時に即時失効する。再試行は新しいURLを発行し、発行/取得/失効を監査する。
- 60分以内に取得完了を確認できない場合は公開時間を自動延長せず失敗にし、人が原因を確認して再発行する。CSV画像ZIPにはこのURLを使わない。

### Notion

- `notion_projection` のallowlistは `schema_version`、`workspace_public_id`、`sku_code`、`workflow_status`、`assignee_alias`、`due_at`、`issue_codes[]`、`updated_at`、`source_revision`、`archived` だけとする。
- 自由記述、URL、住所、氏名/メール、証憑、原価、価格、利益、税務、秘密、画像をMVP payloadに含めない。aliasとissue codeはサーバー生成の管理値だけを許す。
- `(workspace_public_id, sku_code)` をupsert keyとし、`source_revision` が古い更新を拒否する。取消/削除は `archived=true` を投影し、即時のNotion物理削除に依存しない。
- JSON Schemaは `additionalProperties=false` とし、allowlist、文字数、制御文字、URL/秘密patternを送信前に検査する。
- Notion側の変更を自動で正本へ戻さない。失敗は再試行し、商品作業を停止させない。
- 場所名、場所階層、場所写真、在庫ラベルtoken、在庫移動、棚卸差異はNotionへ送らない。

### 会計CSV

- `accounting_export_adapter` を使い、内部financial_eventから対象形式へ変換する。
- Money Forward用の現行列/文字コード/上限はGoal開始時に公式仕様を再確認する。
- 人の承認前、未解決あり、貸借不一致、重複時は出力をブロックする。

### Photoroom

- P0は外部有料サービスなしで、EXIF除去済み派生画像または人が確認した原本相当の派生画像を使って完了できる。
- `manual_photoroom` は利用者が既存のPhotoroom Pro契約と対象用途の利用権を明示確認した場合だけ機能フラグをONにし、APIキーを使わずZIP書出し/取込を行う。
- ProとAPIを同じ契約と扱わない。公式APIは顧客向け組込み許諾と契約確認後だけ追加する。

## 11. セキュリティ・保持・削除・バックアップ

- 通信はTLS、保存はサービス側暗号化を前提とし、秘密はsecret managerへ置く。
- ログへtoken、Cookie、住所、証憑本文、AI入力全文を出さない。
- 入力ファイルはMIME、拡張子、サイズ、画像decodeを検査し、実行形式を拒否する。
- ZIPはパストラバーサル（展開先を抜け出す攻撃）、圧縮爆弾、未知SKUを拒否する。
- CSRF、XSS、SQL injection、権限越境、署名URL漏えいを自動/手動検査する。
- 保持期間はデータ種別別に設定し、法令・会計方針・利用者契約を確認してから確定する。
- 退会・削除は猶予、法的保持、バックアップ失効、監査を含む手順にする。
- DBはPoint-in-Time Recovery候補、Storageはversioning候補。復元演習を検証条件に含める。
- MVPの目標はDB RPO 15分/RTO 4時間、Storage RPO 1時間/RTO 8時間とする。提供事業者が満たせない場合は本番候補に採用しない。Draft PRでは隔離環境への復元手順と件数/hash照合を実行する。
- 外部書出し派生画像はOrientation等の表示必須情報をpixelへ反映した後、GPS、位置、端末所有者、撮影時刻を含む不要EXIFをすべて除去する。検査失敗時は出力を停止し、原本は不変にする。

### 入力・性能の固定上限

- 1 ZIP: 圧縮500 MiB以下、展開2 GiB以下、500 entry以下、入れ子archive 0、1 entry 30 MiB以下、圧縮比100:1以下。
- 1画像: decode後50 megapixel以下、各辺12,000 pixel以下。MIME、magic bytes、拡張子が一致しないものは拒否する。
- 場所階層: 最大8階層。場所コードは2〜24文字のASCII大文字・数字・ハイフン、表示名は1〜80文字。場所ごとの有効な案内写真は部屋全景/正確位置を合わせて最大3枚、1枚20 MiB以下とする。
- 内部QR: payloadは256 bytes以下、推測不能tokenは128 bit以上。DBにはtokenの一方向hashだけを保存し、住所、氏名、原価、認証秘密、場所名をQRへ含めない。
- 想定負荷: 1 workspaceあたり10,000 SKU、同時利用5人、1画像batch 200枚、月間financial_event 100,000件。
- 性能: 通常CRUD API p95 500ms以下、10,000 SKUの一覧/検索p95 1,000ms以下、ホーム集計p95 2,000ms以下、200画像のZIP manifest検査60秒以下。外部通信と人の加工時間は除外し、CIの固定データで測る。
- 署名URL: 通常画像10分、住所表示grant 5分、Shops API画像grantは前記60分。期限と用途はサーバー設定の上限を超えて延長できない。

## 12. 可観測性

可観測性は、問題発生時に「どこで何が起きたか」を調べられる仕組み。

- 構造化ログ: request_id、workspace_idの不可逆参照、actor種別、処理名、結果、時間。
- Metrics: API失敗率、キュー滞留、アップロード失敗、AI要確認率、同期遅延、CSV拒否件数、商品/場所読取不一致率、在庫移動の同期待ち件数と最長時間、未解決棚卸差異の件数と経過日数。
- Trace: API→DB→worker→外部adapterを同じ相関IDで追う。
- Alert: データ損失疑い、権限拒否急増、キュー長時間停止、バックアップ失敗を優先する。
- AuditEventは運用ログと分離し、通常のログ保持終了で消さない。

## 13. ローカル・CI検証

### Windowsで実行可能

- TypeScriptの型検査、lint、単体・結合・契約テスト。
- PostgreSQL migration、RLS、seed、API、worker、CSV、Playwright Web E2E。
- OpenAPIからの生成差分、秘密情報scan、依存脆弱性scan。

### iPhone Safariでの最終確認

- Mac/Xcode/Apple Developer契約は不要。Windowsでproduction buildを起動し、Playwright（ブラウザを自動操作する検査）でPWA画面、manifest、Service Worker、オフラインfallbackを検証する。
- 対応iPhoneではSafariのホーム画面追加、カメラ写真、商品/場所の二重確認、手入力fallback、同期待ち表示を人が確認し、機種、iOS版、確認者、日時、結果を記録する。
- GitHub Actionsは `workflow_dispatch`（利用者が明示的に押した場合だけ実行）に限定する。今回の検証では実行せず、外部計算費用を0円にする。
- Shops CSV公式根拠: https://support.mercari-shops.com/hc/ja/articles/8859698858649- / https://support.mercari-shops.com/hc/ja/articles/10202904748057-

### CIゲート候補

1. format/lint/typecheck
2. unit/integration/contract
3. database/RLS/security
4. web build/E2E/accessibility
5. PWA manifest/Service Worker/offline/モバイル画面E2E
6. secret/dependency scan

コマンドはpackage manifest作成後に `AGENTS.md` へ正確に追記する。現時点で存在しないコマンドを完了扱いしない。

## 14. 技術的受け入れ条件

- TA-001: 全業務テーブルでworkspace境界がAPIとRLSの両方により守られる。
- TA-002: 外注ロールが直接APIを呼んでも、未割当SKU、住所、原価、利益、税務へアクセスできない。
- TA-003: 原本MediaAssetが更新不可で、処理前後のSHA-256不変を検証できる。
- TA-004: 再開アップロードと同一操作の再送で、二重Asset・二重業務イベントが作られない。
- TA-005: ProcessingJobが3provider共通契約を持ち、MVP providerをtest doubleへ交換して契約テストが通る。
- TA-006: 不正ZIP、未知SKU、重複、欠損、サイズ超過を安全に拒否し、原本を失わない。
- TA-007: AI出力が候補だけへ保存され、人の承認なしに確定テーブルへ到達できない。
- TA-008: 重要状態遷移を画面/API/DBのいずれからも不正に飛び越えられない。
- TA-009: outboxと冪等キーにより、Notion/CSV/外部連携の再試行が重複反映を起こさない。
- TA-010: Notion送信payloadのallowlist検査で機密フィールドが0件である。
- TA-011: 住所の期限付きアクセス、失効、監査を自動テストできる。
- TA-012: 財務計算とCSVが同じdomain関数を使用し、固定fixtureで期待値と一致する。
- TA-013: audit_eventに必要項目があり、通常利用者が更新・削除できない。
- TA-014: バックアップから隔離環境へ復元し、件数・ハッシュの確認手順を実行できる。
- TA-015: Windowsのローカル品質ゲートが全合格し、PWAのproduction build、manifest、Service Worker、オフラインfallbackが合格する。外部CI実行は0件である。
- TA-016: iPhone Safari実機でホーム画面追加、カメラ写真、商品/場所の二重確認、手入力fallback、同期待ち表示を確認する。自動OCRとショートカットはP0対象外とする。
- TA-017: secret scanで秘密情報0件、重大・高重要度の未解決セキュリティ指摘0件である。
- TA-018: 10,000 SKU・5同時利用・200画像・月100,000 financial eventのfixtureで、API/一覧/ホーム/ZIP検査の固定性能基準を満たす。
- TA-019: 制限DB role、tenant context、複合FK、Storage policyにより、API/worker/署名URL/直接uploadのworkspace越境否定テストが100%拒否される。
- TA-020: AuditEvent schema検査で住所、token、Cookie、証憑本文、AI全文、秘密値が0件である。
- TA-021: 外注PWAのブラウザ保存schemaで住所・token・原価・証憑本文・税務情報が0件で、ログアウト後にserver session、Cache Storage、IndexedDB、Service Worker業務データが0件になる。
- TA-022: 固定financial fixtureで割引、クーポン、返金、手数料返還、在庫復帰の二重控除が0件である。
- TA-023: 業務別の全許可/禁止transition、自己承認、古い版、冪等key/hash不一致、同時引当を自動テストする。
- TA-024: Notion schemaがallowlist外と自由記述を拒否し、upsert/古いrevision/archived投影を契約テストする。
- TA-025: 外部派生画像の位置EXIFが0件で、失敗時に書出し0件、原本SHA-256不変である。
- TA-026: 固定上限の境界値/超過値、URL期限/用途/失効、DB/Storage復元目標をテストする。
- TA-027: 必須suite 100%合格、domain/security line coverage 80%以上・branch 75%以上、重大・高指摘0件である。
- TA-028: Shops新規登録/更新CSVを別schemaで検証し、更新では公式取得元の商品ID/SKU IDと対象変更列だけを出力し、ID集合・変更前後・件数・重複・対象外状態・結果照合を契約testする。
- TA-029: ProductSKU/InventoryUnitを分離し、workspace複合外部キー、在庫番号/場所コード一意、最大8階層、同一workspace親、循環禁止をDB testする。各対象状態で場所なし/複数/停止/廃止/直接保管不可、単品専用への別個体、最大点数超過、混載禁止を100%拒否し、空き1枠への同時格納は1件だけ成功する。
- TA-030: 商品/場所QRが128 bit以上のopaque token、256 bytes以下、安全なpayload、hash保存、版/失効を満たす。token hashは全体一意、短いコードはworkspace内の有効ラベル間で一意、対象/種別ごとの有効版は1件だけで、読取だけでは権限が増えない。
- TA-031: 操作ごとの期待現物/現在地/移動先と、商品/場所ラベルID・版・読取日時・確認者を1回限りのscan sessionとしてInventoryMovementと同一transactionに保存する。欠落/不一致/旧版/再利用/未確認を100%拒否し、再送・同時移動・同一key異payloadで二重移動0件、競合自動上書き0件となる。
- TA-032: 棚卸snapshot、`basis_movement_seq`、全Observationが不変で、開始後の通常移動を区別し、差異による自動調整0件とする。未発見候補は `initial_counter_id != reconfirmer_id`、紛失/廃棄/数量調整は `requester_id != approver_id`、一連の確認に関与した `distinct human actor` 数が2以上であることを監査schema、DB制約またはdomain testで100%検証する。
- TA-033: 場所案内写真の表示用派生で位置EXIFが0件、非公開Storage、割当枝外の取得0件となる。`pending_review/rejected`は派生生成、署名URL発行、API取得を100%拒否する。
- TA-034: 場所枝と作業種別の期限付き割当をAPI/RLSで検査し、外注者による枝外在庫・写真・履歴・全在庫exportの取得/変更を100%拒否する。
- TA-035: 返品InventoryUnitが隔離場所と人の検品を経ずにavailableへ遷移できず、全許可/禁止transitionをdomain testする。
- TA-036: オフライン在庫移動を同期前は`同期待ち`として保持し、現在地/場所版/割当競合時に自動確定0件、再読取または差異解決へ進む。
- TA-037: DataScanner対応/非対応/カメラ拒否/破損ラベルの実機・fallback検証、場所/写真/QRの固定上限、GS1契約前のGLN/SSCC/GRAI生成0件を確認する。

## 15. 未確認とGoal開始条件

### 未確認

- サービス名、ドメイン、価格、各プラン上限、想定同時利用者・SKU数。
- 対応するSafari/Chromeの下限、iPhoneのカメラ・ホーム画面追加・保存容量の実機差。
- PostgreSQL/Auth/Storage提供事業者とリージョン、費用、データ処理契約。
- 外部AI provider/modelは未選定。今回の0円MVPでは接続しない。
- Shops/Photoroom API契約、Money Forward現行CSV仕様。
- 保持期間、削除、バックアップ目標、税務・古物営業上の運用判断。
- 実際の拠点・部屋・棚・段・箱の命名、最大階層、単品/複数保管の容量方針、現場Wi-Fi/通信状況。
- ラベル寸法、耐久性、印刷枚数、既存プリンター、対応コード、RFIDやGS1を将来必要とする取引先運用。
- GitHub `komatsu-dev-jp/resale-ops-app/private` とGitHub CLI認証は確認済み。外部CIは実行しない。

### Goal開始後の継続条件

1. 承認済みP0/P1順序と安全境界を維持する。
2. 有料契約、従量課金、外部クラウドCI、本番公開を実行しない。
3. PWAのiPhone実機項目はDraft PR前に確認手順と結果を記録し、未確認を合格扱いしない。
4. 外部サービス接続が将来必要になった場合は、0円条件への影響を示してユーザーへ再承認を求める。

Claude Code CLIは現環境に未導入であり、共同実行は未検証。`CLAUDE.md` は準備するが、導入・認証を勝手に行わない。
