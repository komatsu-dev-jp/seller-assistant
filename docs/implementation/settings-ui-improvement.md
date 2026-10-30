# 設定ページの発見性・入力状況の改善

確認日：2026-10-29 JST。基準版 `220a18827ba61cd43a594d0b7e345e15da6f9f9b`。

## 依頼・対象と設計

本人の詳細指示に基づく設定画面限定の段階改修。新しい画面の全面制作、税務判断、保存方式変更、データ初期化、公開・マージは行わない。既存C/Bの配色、5タブ、PCの左ナビを保持する。

- 設定トップ：会計・税務（申告区分／消費税区分／会計年度）、データ管理（既存JSON控え／保存共有の説明）、作業・操作ガイド（旧2導線／利益の見方）。カテゴリ1容器、44px以上の行全体を操作領域にする。
- 会計詳細：既存44とPC46の共通部品を使用。3項目の開閉式、現在値・入力状態・必須表示、開始日／終了日を同じグループへ置く。既存Field／SettingSelectを再利用。該当項目へのfragmentと設定一覧へ戻るリンクは表示導線のみ。
- 追加の表示補助 `accounting-settings-view.ts` は既存 `settingsReady` だけを使う読み取り専用処理。保存・税務判定の正本を増やさない。全項目完了でも「入力済み」であり、税務上正しい設定とは表示しない。
- CSSは設定トップのdata属性と会計詳細の専用クラスに限定。ほかの4画面と会計候補・CSV画面のスタイルは維持。

## 現状調査・互換性の不変条件

- SellerWorkspace：箱／売上はlocalStorage。設定トップに大きな説明と旧作業リンクが混在していた。JSON控えはscope/exportedAt/intake/commerce。写真・会計設定・再取込は対象外。
- ReportedReviewFlow：`seller-assistant:review-controls:v1` をsessionStorageから読み、設定は4つの文字列。初期値は空文字4つ。入力時に保存し、preflightをfalseへ戻す。確認ボタンは既存45へ進む。読取不能は上書きせず停止、保存失敗は入力を保持して再試行する。
- 申告選択肢は青色申告／白色申告／確認中。税区分は免税／課税／確認中。以前の独自文字列を選択肢として残す。法的妥当性の判定は既存機能にもない。
- 日付はYYYY-MM-DD文字列、実在日付と開始日<=終了日を既存gateで判定。申告・税区分に伴う追加欄の条件分岐はないため、新規分岐を追加しない。
- 下部ナビ、既存URL、go/update、控えのBlob内容・ファイル名、保存キー／型／初期値／タイミングを変更しない。設定トップはsessionStorageを読むだけで書き込まない。

## 参照資料

- [TAB-004](https://envydesign.jp/patterns/tabs-sp-accordion/)：同じ内容を共有し、狭幅は開閉式。既存detailsを簡素化し、PCで別内容を複製しない。
- [FORM-001](https://envydesign.jp/patterns/form-single-page/)：少数項目のラベルを常時表示。会計年度は開始日・終了日を同じ場所に配置する。
- [FORM-003](https://envydesign.jp/patterns/form-conditional/)：既存に分岐がないため今回は採用しない。新しい税務条件を作らない。
- 個人知識のプロジェクト案内は開発フォルダの入口としてのみ参照。現在仕様は実コードと本人の今回指示を優先。

## 検証計画と結果

- [x] 調査・設計提示、専用ブランチ／専用フォルダ
- [x] 表示補助・保存互換・バックアップの自動テスト（対象41件成功）
- [x] 最終版npm run check（135ファイル・1,248テスト、整形・lint・型・秘密情報チェック・Web/API build）とPages用140ページ生成成功
- [x] 390px／320px／PCの前後画面、横はみ出し・末尾と下部ナビ
- [x] 各設定入口、戻る、現在値、変更・再読込（実ブラウザー）、保存失敗（既存ハンドラーの自動テスト）
- [x] JSON控えのダウンロードと内容（既存scope/exportedAt/intake/commerceのみ）
- [x] 固定差分の独立レビュー（Astra medium、追加P2を修正し未解決P1/P2なし）
- 実iPhone/Safari、ソフトウェアキーボード・日付ピッカーは実機検証が必要。デスクトップの縮小画面を実機確認として数えない。

依存導入時のオンライン監査で既存10件（Critical 1含む）を検出。依存バージョンの変更は今回対象外。安全性の全体合格を主張しない。詳細は最終確認時に追記する。

## 最終差分・画面証拠

コード識別子：`A59E1111BB5A89A7C7D83C22C426261A8873CB5E5AB7B5057D00AED9CD984BA1`。変更・新規のapps/web配下をパス順に並べた「パス SHA256」をLFで結び、SHA256化したもの。コミットは作成していない。

作業フォルダ：専用worktreeの`settings-ui-20261029`。作業ブランチ：`codex/settings-ui-20261029`。絶対パスは個人の作業記録で管理する。確認用サーバーは`127.0.0.1:4141`（このPCだけ）。普段のChromeの個人データは使用していない。

実画面で、旧actionBarの横移動指定と、旧スマホ枠の高さ固定による末尾の切れを発見。会計設定のdata属性を持つ時だけ外側page・phoneShell・scrollAreaを伸ばして修正した。独立担当も同じ上位pageの問題を指摘し、修正後の画像まで再確認した。

- 390幅の末尾実測：文書高さ970px、スクロール126px。操作領域の下端720.05px、下部ナビ上端779.33pxで重なりなし。横幅は375px<=390px。
- 320幅：横幅305px<=320px。年度の開始日・終了日が画面内に収まり、直接リンクから該当detailsが開く。
- PC1280幅：横幅1265px<=1280px、会計年度は同じ入力欄を横2列に配置。
- 仮入力の青色申告・免税・日付を変更し、逆順日付の近接エラー、訂正後3/3、再読込での保持、既存45への移動、ブラウザーで戻る、設定トップ3/3を確認。別のテストタブは0/3であり、共有されたふりをしない。
- 設定以外のホーム／商品／発送／レポートは390幅で表示でき、横はみ出しなし。設定の読取専用状態を追加しても商品・売上の保存処理は無変更。
- JSONを実ダウンロードし、会計設定が含まれず従来4キーのみであることを確認。非空の箱を含む厳密な内容照合も自動テストで成功。
- 独立レビューは同じ差分・最新6画像を直接確認。独立担当はブラウザーを操作していないため、その操作の再実行とは区別する。

画像はこの専用作業フォルダの `output/playwright/`。同じ空入力・390×844で前後比較を用意（データを初期化せず別タブを使用）。

- トップ：`settings-before-390.png` → `settings-after-empty-390.png`
- 詳細：`accounting-before-390.png` → `accounting-after-empty-390.png`
- 入力済み・末尾：`settings-verified-390.png`、`accounting-bottom-verified-390.png`
- 狭幅：`settings-final-320.png`、`accounting-year-final-320.png`
- PC：`settings-final-pc.png`、`accounting-final-pc.png`
- 中間の`*-after-390.png`・`accounting-final-390.png`・`accounting-bottom-final-390.png`は修正途中の証拠。最終合格の画像として使用しない。

## 変更ファイル一覧

| ファイル                                                                   | 変更内容                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/web/src/components/seller-workspace/seller-workspace.tsx`            | 設定だけの読取・カテゴリ行・説明開閉。控えの処理は維持 |
| `apps/web/src/components/seller-workspace/workspace.module.css`            | 設定トップだけのコンパクトなリスト                     |
| `apps/web/src/components/approved-mobile/reported-review-flow.tsx`         | 会計詳細の開閉・現在値・必須・近接エラー・戻る         |
| `apps/web/src/components/approved-mobile/reported-review-flow.module.css`  | 会計詳細だけのフォームと通常フローの操作領域           |
| `apps/web/src/components/approved-mobile/approved-mobile-demo.module.css`  | 会計設定だけ旧枠の固定高さを解除                       |
| `apps/web/src/components/approved-mobile/accounting-settings-view.ts`      | 既存判定を読む表示補助（新規）                         |
| `apps/web/src/components/approved-mobile/accounting-settings-view.test.ts` | 表示補助と既存gateの一致・不変性（新規）               |
| `apps/web/src/components/approved-mobile/reported-review-flow.test.ts`     | 既存入力・保存と近接エラーを検証                       |
| `apps/web/src/components/seller-workspace/workspace-interactions.test.ts`  | 読取不能・書込なし・控えの内容保持を検証               |
| `docs/DECISIONS.md`                                                        | 本人指示と変更禁止範囲の記録                           |
| `docs/implementation/model-routing-plan.md`                                | 1実装者と独立レビューの範囲                            |
| `docs/implementation/settings-ui-improvement.md`                           | 調査・設計・ファイル一覧・検証と未確認                 |

## 未検証・残る問題

- 実iPhone/Safariのソフトウェアキーボード・ネイティブ日付ピッカー・拡大文字・実セーフエリアは未検証。PCブラウザーの幅変更で代用したとは報告しない。
- オンライン`npm audit`で既存依存10件（Critical 1=next、High 4、Moderate 4、Low 1）。package-lockは基準版と無差分。既存のオフライン監査が0件でも、オンラインで既知問題がない意味ではない。別作業で更新影響の確認が必要。
- 公開・PR・マージ・コミットは未実施。既存mainは`220a188`のまま、既存work/を保持。前回の片付け残りと他作業フォルダは変更していない。

## 2026-10-31 参考画像との照合と公開準備

上記は10月29日の調査・未公開時点の履歴。本人から参考画像が再提示され、設定UIも確認後に公開するよう承認された。直前のPR #41は安全更新だけだったため、設定UIは公開に含まれていなかった。

- 対象は引き続きこの12ファイル。進捗バーと未入力項目の案内、「アプリ・ヘルプ」の使い方と説明の開閉を補う。参照画像のChatGPT操作部や端末状態は再現せず、既存の淡色・青と下部ナビを維持。
- 進捗は既存settingsReadyと同じ読み取り専用の表示補助を使う。読取不能時は進捗バーを出さず、推測で0/3と表示しない。入力の完了数であり、税務上の正しさとは区別する。
- 既存ブランチを公開済み安全更新971328fbへ早送りし、元の未公開12ファイルのサイズ・SHA-256が変わらないことを確認後に改修。依存バージョンを古く戻さない。
- 今回の追加コード変更は設定トップのJSX・CSS・テストのみ。会計詳細・表示補助等の既存未公開改修も同じ設定UIタスクとして含める。保存キー・初期値・型・タイミング、税務・利益計算、バックアップ4キーは維持。
- 対象44テスト、全体136ファイル・1,258テスト、lint、Web/API build、公開用140ページ生成が成功。npm ciの全依存監査は0件。最終check・独立レビュー・公開は確認後に追記する。
- 実ブラウザーで申告区分と消費税を選び、2/3と「会計年度の設定が残っています」、現在値、設定一覧への戻りを確認した。公開と実iPhoneでの検証はまだ成功扱いにしない。

### 10月31日の最終ローカル確認

- 最終`npm run check`はexit 0。136ファイル・1,258テスト、整形・lint・型・coverage・秘密情報検査・依存検査・API/Web buildを成功。個別に`npm test`→`npm run lint`→`npm run build`の順も成功。公開用buildは140ページ・127画面後処理・799ファイル、Next 16.4.3。全依存オンライン監査0件はnpm ci時に確認。
- コード9ファイルの固定ID：`342ee45dfcb3db380a3304671a14e00d28df3785765846cc3d89d1655cf18108`。前述と同じ算出方法。独立Astra mediumが直接差分・新規ファイル・保存契約・画像を確認し、対象44テストを別実行。未解決P1/P2なし。追加320px・PC・会計末尾画像も直接確認。ブラウザー操作は親だけが実行した。
- 390px：実入力で0/3→2/3→3/3。申告・税・年度の行から該当フォームが開く。逆順の日付エラー、訂正後の保存ボタン→既存45、ブラウザーで44へ戻り値が保持されることを確認。会計末尾の保存下端660.31px、下部ナビ上端779.33px。横幅375px<=390px。
- 320px：設定トップの横幅305px<=320px。最大スクロール時の最後の項目下端709.21px<ナビ上端779.33pxで末尾が隠れない。PC1280px：横幅1265px<=1280px、3/3と同じ値、3つの会計リンクはPC46、年度は438pxずつの2列。
- 実ダウンロードしたJSONのキーはscope/exportedAt/intake/commerceのみ。会計設定や写真は追加されていない。PC画面のconsoleはErrors 0・Warnings 0。
- 今回の画像：`settings-published-before-20261031-390.png`、`settings-empty-20261031-390.png`、`settings-partial-20261031-390.png`、`settings-20261031-320.png`、`settings-bottom-20261031-320.png`、`settings-20261031-pc.png`、`accounting-bottom-20261031-390.png`、`accounting-20261031-pc.png`。専用ブラウザー・架空入力だけを使用し、公開作業用の控えにも保存する。
- 上記はローカル検証の結果で、公開成功とは別。GitHubのPR/main/Pagesと公開設定ページは取り込み時に変更番号を照合する。実iPhone/Safari・ソフトキーボード・日付ピッカーは未検証。
