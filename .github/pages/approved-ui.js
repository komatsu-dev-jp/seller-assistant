/*
 * 承認済みUIレビュー用の静的画面定義。
 *
 * このファイルは架空データをHTMLへ描画するだけです。入力値の保存、API通信、
 * 外部サイトへの送信は行いません。主ボタンは次の確認画面へ移動します。
 */

const MOBILE_SCREENS = [
  ["01", "ログイン", "自分の担当画面へ入る", "ログイン", "入口"],
  ["02", "はじめの設定", "事業所名と基本の使い方を設定する", "設定を保存", "入口"],
  ["03", "メンバーと担当", "招待、担当、見せる情報を確認する", "この担当で招待", "入口"],
  ["04", "ホーム", "今日やることと続きの作業を知る", "作業を続ける", "ホーム"],
  ["05", "作業一覧", "仕入れ、検品、撮影、採寸などから担当を選ぶ", "この作業を開く", "作業"],
  ["06", "送信待ち", "通信がない時に保存済み内容と再送状態を知る", "もう一度送る", "作業"],
  ["07", "仕入れ書類", "仕入れ書類の種類を選び、請求書またはレシートを確認する", "請求書を追加", "商品"],
  ["08", "請求書を追加", "端末内のファイルから仕入れ書類を選ぶ", "ファイルから選ぶ", "商品"],
  ["09", "ファイル確認", "選んだ請求書の原本とファイル情報を確認する", "この請求書を使う", "商品"],
  ["10", "読み取り確認", "請求書からの読み取り候補を原本と見比べて確認する", "商品行を確認", "商品"],
  ["11", "商品行を確認", "読み取った商品行と仕入れ代を確認する", "確認した内容を保存", "商品"],
  ["12", "商品の確認方法", "現物ラベルを読むか番号を入力して商品を確認する", "この方法で進む", "作業"],
  ["13", "商品を確認", "商品番号と現物の写真を照合する", "この商品で進む", "作業"],
  ["14", "棚を確認", "保管場所ラベルと場所写真を照合する", "この棚にする", "作業"],
  ["15", "格納確認", "商品と棚の組み合わせを最後に確認する", "この棚に格納", "作業"],
  ["16", "次は検品", "格納を終え、検品の項目と順番を確認する", "検品を始める", "作業"],
  ["17", "状態チェック", "新品相当、使用感、汚れなどを選ぶ", "次の項目へ", "作業"],
  ["18", "汚れ・傷", "商品写真の気になる箇所をタップし、場所、種類、程度、写真、メモを残す", "この内容を保存", "作業"],
  ["19", "検品まとめ", "抜けがないか見直す", "検品を完了", "作業"],
  ["20", "撮る写真一覧", "商品の種類に合う全体、タグ、細部、気になる箇所の残りを知る", "正面を撮る", "作業"],
  ["21", "撮影ガイド", "枠と短い指示に合わせて撮る", "撮影", "作業"],
  ["22", "写真確認", "ぶれ、明るさ、切れを確認する", "この写真を使う", "作業"],
  ["23", "撮り直し", "不足理由と撮り直す写真を知る", "撮り直す", "作業"],
  ["24", "写真まとめ", "必要写真がそろったか確認する", "採寸へ進む", "作業"],
  ["25", "採寸の準備", "平置き方法、服の種類、測る項目を確認する", "採寸を始める", "作業"],
  ["26", "1か所ずつ採寸", "測る線、前回値、単位を見ながら入力する", "保存して次へ", "作業"],
  ["27", "採寸写真", "メジャー位置が分かる写真を残す", "写真を使う", "作業"],
  ["28", "測り直し", "前回との差と測り直す理由を確認する", "もう一度測る", "作業"],
  ["29", "撮影した写真", "5つの役割の写真と保存状態を確認する", "5枚を確認", "作業"],
  ["30", "写真の保存先", "商品ごとの写真の場所と原本の扱いを確認する", "保存内容を確認", "作業"],
  ["31", "ブランド・サイズ確認", "写真から得た商品情報を人が確認する", "この内容で進む", "作業"],
  ["32", "編集レシピを選ぶ", "役割ごとの写真編集レシピを確認する", "編集方法を選ぶ", "作業"],
  ["33", "編集方法を選ぶ", "準備中の自作編集と手動受け渡しを選ぶ", "編集用セットへ", "作業"],
  ["34", "注文を登録", "公式画面で確認した注文番号と販売情報を記録する", "注文を保存", "作業"],
  ["35", "商品を取り出す", "商品と棚を順番に読み取り、対象を確認する", "取り出しを完了", "作業"],
  ["36", "配送方法を選ぶ", "販売先で確認した配送方法と送料を選ぶ", "この方法にする", "作業"],
  ["37", "発送内容を確認", "商品、配送方法、送料を発送前に確認する", "内容を確認しました", "作業"],
  ["38", "発送を記録", "発送日時と追跡情報を人が確認して記録する", "発送を記録", "作業"],
  ["39", "数が合わない商品", "未発見、誤った棚、予定外の商品を分ける", "この商品を確認", "在庫"],
  ["40", "見つからない商品（仮）", "再読取、写真、理由をそろえ、削除せず仮状態にする", "3秒押して仮状態にする", "在庫"],
  ["41", "見つかった商品を戻す", "商品と現在の棚を再読取して仮状態を解消する", "在庫に戻す", "在庫"],
  ["42", "返品の状態確認", "返品を別場所で保留し、再販可否を人が確認する", "確認結果を保存", "在庫"],
  ["43", "売上の事実", "売上、手数料、送料、仕入れ代を別々に確認する", "会計の設定へ", "会計"],
  ["44", "会計の基本設定", "申告や消費税など、人が決める前提を入力する", "内容を確認して保存", "会計"],
  ["45", "会計項目の候補", "アプリの提案を採用または変更する", "確認した項目を保存", "会計"],
  ["46", "作成前の確認", "未設定、資料不足、重複などの停止理由を解消する", "ファイル内容を確認", "会計"],
  ["47", "ファイル内容の確認", "列名、件数、先頭行を読み取り専用で確認する", "確認してダウンロード", "会計"],
  ["48", "手動取込の結果", "公式画面へ本人が取り込んだ成功・失敗を記録する", "結果を保存", "会計"],
  ["49", "作成・取込履歴", "過去ファイル、置換、取消、取込結果を確認する", "履歴の詳細を見る", "会計"],
].map(([number, name, purpose, primary, area]) => ({
  id: `m-${number}`,
  number: Number(number),
  code: number,
  name,
  purpose,
  primary,
  area,
}));

/*
 * 正本画像にある追加フロー。既存の基本49画面とは別キーにしているため、
 * 画面番号が重なっても selector と前後移動で取り違えません。
 */
const MOBILE_ADDITIONAL_SCREENS = [
  ["photo-01", "撮影した写真", "5つの役割の写真と保存状態を確認する", "5枚を確認", "作業", "写真・編集", "29", "01", "07"],
  ["photo-02", "写真の保存先", "商品ごとの写真の場所と原本の扱いを確認する", "保存内容を確認", "作業", "写真・編集", "30", "02", "07"],
  ["photo-03", "ブランド・サイズ確認", "写真から得た商品情報を人が確認する", "この内容で進む", "作業", "写真・編集", "31", "03", "07"],
  ["photo-04", "編集レシピを選ぶ", "役割ごとの写真編集レシピを確認する", "編集方法を選ぶ", "作業", "写真・編集", "32", "04", "07"],
  ["photo-05", "編集方法を選ぶ", "準備中の自作編集と手動受け渡しを選ぶ", "編集用セットへ", "作業", "写真・編集", "33", "05", "07"],
  ["photo-06", "編集用セットを作る", "全写真とmanifestを手動編集用にまとめる", "ZIPを作成", "作業", "写真・編集", "34", "06", "07"],
  ["photo-07", "加工後を戻して確認", "加工後の写真を原本と比べて人が承認する", "5枚を承認", "作業", "写真・編集", "35", "07", "07"],
  ["box-01", "仕入箱を登録", "仕入箱の基本情報を登録して点数カウントを始める", "箱を登録して数える", "作業", "仕入箱", "01", "01", "07"],
  ["box-02", "入っている数を数える", "箱を開けて中身を一つずつ数える", "48点で確定", "作業", "仕入箱", "02", "02", "07"],
  ["box-03", "1点を簡単登録", "短い商品番号で一周目の簡単登録をする", "保存して次へ", "作業", "仕入箱", "03", "03", "07"],
  ["box-04", "あとで詳しく調べる", "高値候補と状態確認だけを二周目へ送る", "優先商品を開く", "作業", "仕入箱", "04", "04", "07"],
  ["box-05", "箱の見込み", "仕入箱の販売見込みと損益分岐を確認する", "見込みを確認", "作業", "仕入箱", "05", "05", "07"],
  ["box-06", "販売後の実績", "販売記録から箱の実績を確認する", "月別KPIを見る　›", "作業", "仕入箱", "06", "06", "07"],
  ["box-07", "月別KPI", "販売率、月別の見込み、残り在庫を確認する", "KPIの内訳を見る", "作業", "仕入箱", "07", "07", "07"],
  ["sales-01", "見直し候補", "価格や季節を見直す候補を確認する", "候補を見る", "作業", "値下げ・セール", "01", "01", "06"],
  ["sales-02", "商品の状況を確認", "公式画面を見て商品の現状を入力する", "入力内容を確認", "作業", "値下げ・セール", "02", "02", "06"],
  ["sales-03", "提案の理由", "販売履歴、季節、公開情報を根拠として確認する", "値下げ幅を比べる", "作業", "値下げ・セール", "03", "03", "06"],
  ["sales-04", "値下げ幅を比べる", "複数の値下げ幅と見込み粗利を比べる", "10%を候補にする", "作業", "値下げ・セール", "04", "04", "06"],
  ["sales-05", "行事に合わせる", "行事の予定と商品の相性を人が確認する", "提案に追加", "作業", "値下げ・セール", "05", "05", "06"],
  ["sales-06", "公式画面で実行", "本人が公式画面で操作する内容を確認する", "結果を記録", "作業", "値下げ・セール", "06", "06", "06"],
  ["genre-suit-01", "スーツの構成品", "上着とパンツを一組として確認する", "上着から撮る", "作業", "スーツ・セットアップ", "01", "01", "06"],
  ["genre-suit-02", "スーツ・上着", "スーツの上着に必要な写真をそろえる", "次に撮る：正面", "作業", "スーツ・セットアップ", "02", "02", "06"],
  ["genre-suit-03", "スーツ・パンツ", "スーツのパンツに必要な写真をそろえる", "次に撮る：正面", "作業", "スーツ・セットアップ", "03", "03", "06"],
  ["genre-suit-04", "セットアップの構成品", "トップスとボトムスを一組として確認する", "トップスから撮る", "作業", "スーツ・セットアップ", "04", "04", "06"],
  ["genre-suit-05", "セットアップ・トップス", "セットアップのトップスに必要な写真をそろえる", "次に撮る：正面", "作業", "スーツ・セットアップ", "05", "05", "06"],
  ["genre-suit-06", "セットアップ・ボトムス", "セットアップのボトムスに必要な写真をそろえる", "撮影内容を確認", "作業", "スーツ・セットアップ", "06", "06", "06"],
].map(([id, name, purpose, primary, area, group, code, groupIndex, groupTotal], index) => ({
  id,
  number: 50 + index,
  code,
  name,
  purpose,
  primary,
  area,
  group,
  groupIndex,
  groupTotal,
  isAdditional: true,
}));

const ALL_MOBILE_SCREENS = [...MOBILE_SCREENS, ...MOBILE_ADDITIONAL_SCREENS];

const PC_SCREENS = [
  ["01", "ログイン", "Cロゴ、メール、パスワード、ログイン", "ログイン"],
  ["02", "ホーム", "今日の確認、続き、在庫、売上の事実", "未解決を確認"],
  ["03", "今日の作業", "担当、期限、残り、次の操作", "この作業を開く"],
  ["04", "通知・見られる範囲", "見られる範囲、利用不可理由、送信待ち", "送信待ちを確認"],
  ["05", "仕入れ資料", "PDF・画像選択、店舗レシート撮影、読み取り候補と原本比較", "内容を確認して保存"],
  ["06", "卸箱を数える", "点数は不明から開始、大きな加算・取消、数えた履歴", "数え終わった"],
  ["07", "1点ずつ簡単登録", "短い商品番号、写真、ブランド、特徴、販売可否、価格帯", "保存して次の商品"],
  ["08", "詳しく調べる商品", "高値候補・要確認だけを2周目へ送る", "詳しく調べる"],
  ["09", "商品番号と在庫番号", "商品情報と現物1点を分け、在庫番号を発行", ""],
  ["10", "在庫ラベル", "手書き無料・標準、印刷任意、再発行履歴", "登録した24商品を1枚ずつ印刷"],
  ["11", "保管場所を選ぶ", "部屋、棚、段、箱、場所写真、容量", "この場所にする"],
  ["12", "格納を確認", "商品と場所の読み取り結果を人が確定", "この場所に格納"],
  ["13", "商品の種類", "種類ごとの検品・撮影・採寸項目", "この種類で進む"],
  ["14", "検品項目", "状態、使用感、汚れ、傷、未確認", "次の項目へ"],
  ["15", "気になる箇所", "写真上の番号、場所、種類、程度、証拠写真、メモ", "この内容を保存"],
  ["16", "検品まとめ", "未確認を問題なしにせず、人が完了", "検品を完了"],
  ["17", "商品の写真", "正面、背面、ブランドタグ、品質表示、気になる箇所", "写真を追加"],
  ["18", "写真の編集方法", "役割別レシピ、自作編集は準備中、編集用セット、編集せず進む", "編集用セットを作る"],
  ["19", "加工後を確認", "原本・加工後比較、SKU・役割照合、人の承認", "確認して採用"],
  ["20", "採寸", "種類別項目、測定線、単位、証拠写真、測り直し", "確認した値を保存"],
  ["21", "タグの文字", "ブランド、サイズ、色、素材の候補を人が確認", "確認した内容を保存"],
  ["22", "商品まとめ", "検品、写真、採寸、タグの不足をまとめて表示", "商品説明の候補を作る"],
  ["23", "商品説明の候補", "根拠と未確認を表示し、人が編集・コピー", "コピーする内容を確認"],
  ["24", "公式画面へ移る", "写真・文章を書き出し、公開後の情報を人が1回登録", "公式画面を開く"],
  ["25", "保存した商品ページ", "販売先ごとのID・URLと最終確認日", "商品ページを開く"],
  ["26", "販売状況を確認", "出品日数、現在価格、閲覧、いいね、値下げ依頼を人が入力", "確認した数値を保存"],
  ["27", "価格候補を比べる", "5・10・15%、見込み粗利、下限、根拠、参考情報の確認日", "この候補をコピー"],
  ["28", "返信文と本人操作", "編集可能テンプレート、文章コピー、公式画面を開く、反映確認", "文章をコピー"],
  ["29", "注文を記録", "アプリ番号、販売先、取引ID、任意表示名、金額", "仮登録して取り出しへ"],
  ["30", "商品を取り出す", "商品・場所の二重確認、担当範囲だけ表示", "取り出しを完了"],
  ["31", "発送前の写真", "商品と梱包状態、撮影時刻、人の確認", "この写真を使う"],
  ["32", "配送方法と発送", "販売先別の有効方法、公式確認日、選んだ送料を固定、発送記録", "発送を記録"],
  ["33", "在庫と保管場所", "場所ツリー、部屋・棚・位置写真、在庫番号、担当", "保管場所を開く"],
  ["34", "棚卸し", "開始時点の商品固定、進捗、読取、未確認", "棚卸しを始める"],
  ["35", "数が合わない商品", "未発見、別の棚、予定外を分け、自動修正しない", "この商品を確認"],
  ["36", "仮状態・復元・返品", "1人／複数人ルール、削除しない仮状態、発見時復元、返品隔離", "確認結果を保存"],
  ["37", "メンバー", "役割、利用中、招待、停止", "メンバーを招待"],
  ["38", "担当を割り当てる", "商品・場所・写真・注文を期限付きで最小限だけ許可", "この担当を割り当てる"],
  ["39", "変更を確認", "変更前後、証拠、承認、差戻し", "承認"],
  ["40", "変更履歴", "誰が、いつ、何を変えたか。削除不可", "履歴を書き出す"],
  ["41", "箱の見込み", "実数、販売候補、見込売上、仕入額、見込費用、見込粗利、損益分岐", "販売後の実績を見る"],
  ["42", "販売後の実績", "販売済み、実売上、実費用、仕入額、実粗利、未販売", "月別KPIを見る"],
  ["43", "月別KPI", "30日販売率、月別売上見込、月別粗利見込、残り在庫", "対象月を確認"],
  ["44", "仕入先・在庫の比較", "母数、観測期間、欠損、在庫日数。継続・停止を自動判断しない", "不足データを確認"],
  ["45", "売上の事実", "売上、返金、手数料、送料、仕入れ代を別々に表示", "会計の基本設定へ"],
  ["46", "会計の基本設定", "申告、消費税、記帳方式など人が決める前提と用語ヘルプ", "内容を確認して保存"],
  ["47", "会計項目の候補", "承認済みルールによる候補、採用、変更、停止理由", "確認した項目を保存"],
  ["48", "ファイル作成・履歴", "作成前確認、内容プレビュー、手動ダウンロード、取込結果、置換・取消履歴", "確認してダウンロード"],
  ["49", "アプリの基本設定", "事業所、表示、通知、作業工程、販売先別設定", "変更を保存"],
  ["50", "写真の保存先", "PC内非公開保管、原本・編集用・加工後・一覧画像を分離", "保存先を確認"],
  ["51", "書き出し・バックアップ", "CSV・ZIPの手動書き出し、保存先、履歴。外部へ自動送信しない", "CSVで保存"],
  ["52", "外部連携の状態", "P0は未接続、任意機能は準備中、契約・費用・権限を人が確認", ""],
].map(([number, name, purpose, primary]) => ({
  id: `p-${number}`,
  number: Number(number),
  code: number,
  name,
  purpose,
  primary,
}));

const MOBILE_FOOTER = [
  ["ホーム", "⌂", "m-04"],
  ["作業", "✓", "m-05"],
  ["商品", "◇", "m-07"],
  ["在庫", "▦", "m-10"],
  ["会計", "￥", "m-43"],
];

const PC_NAV = [
  ["ホーム", "⌂", "p-02"],
  ["作業", "✓", "p-03"],
  ["仕入れ", "▣", "p-05"],
  ["商品", "◇", "p-09"],
  ["注文・発送", "▱", "p-29"],
  ["在庫", "▦", "p-33"],
  ["会計", "￥", "p-45"],
  ["メンバー", "♙", "p-37"],
  ["設定", "⚙", "p-49"],
];

const MOBILE_ICON_BY_AREA = {
  入口: "shirt",
  ホーム: "home",
  作業: "check",
  商品: "tag",
  在庫: "shelf",
  会計: "ledger",
};

let mode = window.matchMedia && window.matchMedia("(max-width: 600px)").matches ? "mobile" : "pc";
let activeId = mode === "mobile" ? "m-04" : "p-02";
let toastTimer;

function findScreen(id) {
  return [...ALL_MOBILE_SCREENS, ...PC_SCREENS].find((screen) => screen.id === id) || MOBILE_SCREENS[3];
}

function currentScreens() {
  return mode === "mobile" ? ALL_MOBILE_SCREENS : PC_SCREENS;
}

function isMobileScreen(screen) {
  return Boolean(screen && (screen.id.startsWith("m-") || screen.isAdditional));
}

function mobileAdjacent(screen, offset) {
  const index = ALL_MOBILE_SCREENS.findIndex((item) => item.id === screen.id);
  const safeIndex = index < 0 ? 0 : index;
  return ALL_MOBILE_SCREENS[(safeIndex + offset + ALL_MOBILE_SCREENS.length) % ALL_MOBILE_SCREENS.length].id;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function button(label, className = "secondary-button", attributes = "") {
  return `<button class="${className}" type="button" ${attributes}>${escapeHtml(label)}</button>`;
}

function svgIcon(kind, className = "") {
  const common = `class="${className}" viewBox="0 0 120 120" aria-hidden="true" focusable="false"`;
  const shapes = {
    shirt: `<path d="M39 31 25 42l-13 8 9 18 13-7v34h52V61l13 7 9-18-13-8-14-11c-4 7-9 11-17 11s-14-4-17-11Z" fill="#155bce"/><path d="M46 26c2 9 7 14 14 14s12-5 14-14" fill="none" stroke="#eaf3ff" stroke-width="4"/><circle cx="60" cy="51" r="3" fill="#fff"/><circle cx="60" cy="63" r="3" fill="#fff"/>`,
    tag: `<path d="M26 20h40l30 30-45 45-30-30V25a5 5 0 0 1 5-5Z" fill="#eaf3ff" stroke="#17427d" stroke-width="4"/><circle cx="41" cy="40" r="6" fill="#fff" stroke="#17427d" stroke-width="4"/><path d="m58 57 18-18" stroke="#179b62" stroke-width="6" stroke-linecap="round"/><path d="m75 57 13-13" stroke="#179b62" stroke-width="6" stroke-linecap="round"/>`,
    shelf: `<path d="M20 18h80M20 55h80M20 92h80M25 18v74M95 18v74" fill="none" stroke="#193b68" stroke-width="6" stroke-linecap="round"/><path d="M33 39h18v12H33zM62 38h25v13H62zM35 75h22v12H35zM67 72h19v15H67z" fill="#c28b4e"/><path d="M13 98h94" stroke="#179b62" stroke-width="5" stroke-linecap="round"/>`,
    receipt: `<path d="M31 12h58v96l-10-6-10 6-10-6-10 6-10-6-10 6V12Z" fill="#fff" stroke="#71819a" stroke-width="4"/><path d="M43 35h34M43 49h34M43 63h24M43 85h27" stroke="#b1bfd0" stroke-width="5" stroke-linecap="round"/><path d="M68 84h12" stroke="#179b62" stroke-width="5" stroke-linecap="round"/>`,
    check: `<circle cx="60" cy="60" r="42" fill="#e6f8ef" stroke="#179b62" stroke-width="5"/><path d="m38 61 14 14 30-32" fill="none" stroke="#179b62" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
    home: `<path d="m18 57 42-37 42 37v42H68V72H52v27H18Z" fill="#edf4ff" stroke="#17427d" stroke-width="5" stroke-linejoin="round"/><path d="M49 98V67h22v31" fill="#155bce"/><circle cx="60" cy="49" r="7" fill="#fff"/>`,
    ledger: `<rect x="24" y="18" width="72" height="84" rx="8" fill="#edf4ff" stroke="#17427d" stroke-width="5"/><path d="M42 40h36M42 55h36M42 70h24M42 85h29" stroke="#607a9e" stroke-width="5" stroke-linecap="round"/><path d="m73 82 6 6 12-14" fill="none" stroke="#179b62" stroke-width="5" stroke-linecap="round"/>`,
    package: `<path d="m20 37 40-20 40 20-40 21-40-21Z" fill="#e6c08b" stroke="#855528" stroke-width="4"/><path d="M20 37v43l40 22 40-22V37M60 58v44" fill="#d7a86d" stroke="#855528" stroke-width="4"/><path d="M43 27h34" stroke="#fff5df" stroke-width="6"/>`,
  };
  return `<svg ${common}>${shapes[kind] || shapes.shirt}</svg>`;
}

function art(kind = "shirt", label = "架空のサンプル画像") {
  return `<div class="art ${kind}" role="img" aria-label="${escapeHtml(label)}">${svgIcon(kind)}</div>`;
}

function garmentArt(kind = "jacket", label = "架空のネイビー衣類") {
  const shapes = {
    jacket: `<path d="M40 22 25 33 14 52l15 9 8-11v48h46V50l8 11 15-9-11-19-15-11c-3 8-8 12-16 12s-13-4-16-12Z" fill="#162b48" stroke="#0b1930" stroke-width="3"/><path d="M47 22c2 8 6 12 13 12s11-4 13-12M60 36v62M44 63h11M65 63h11" fill="none" stroke="#92a9c7" stroke-width="2"/><path d="M51 39h18" stroke="#f4f7fc" stroke-width="2"/>`,
    pants: `<path d="M34 20h52l-4 28-7 49H57l-4-43-5 43H28l5-49Z" fill="#162b48" stroke="#0b1930" stroke-width="3"/><path d="M34 23h52M58 48l-1 49M53 28h14" fill="none" stroke="#91a8c7" stroke-width="2"/><path d="M39 35h15M66 35h14" stroke="#f4f7fc" stroke-width="2"/>`,
    top: `<path d="M39 25 24 37 14 57l14 8 10-12v46h44V53l10 12 14-8-10-20-15-12c-4 7-8 10-15 10s-12-3-15-10Z" fill="#183452" stroke="#0b1930" stroke-width="3"/><path d="M46 26c3 7 7 10 14 10s11-3 14-10M60 38v61" fill="none" stroke="#9cb1c9" stroke-width="2"/><path d="M33 62h16M71 62h16" stroke="#f4f7fc" stroke-width="2"/>`,
  };
  return `<div class="garment-art ${escapeHtml(kind)}" role="img" aria-label="${escapeHtml(label)}"><svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">${shapes[kind] || shapes.jacket}</svg></div>`;
}

function barcode(seed = "0123", compact = false) {
  const source = String(seed).padEnd(4, "0");
  const bars = [];
  for (let i = 0; i < (compact ? 28 : 40); i += 1) {
    const code = source.charCodeAt(i % source.length) + i * 7;
    bars.push(`<i style="opacity:${code % 5 === 0 ? ".66" : "1"};width:${code % 4 === 0 ? (compact ? 2 : 4) : (compact ? 1 : 2)}px"></i>`);
  }
  return `<span class="barcode" aria-label="Code 128の架空バーコード">${bars.join("")}</span>`;
}

function mobileField(label, value, icon = "") {
  return `<div class="mobile-field"><label>${escapeHtml(label)}</label><div class="fake-input"><span>${icon ? `${icon} ` : ""}${escapeHtml(value)}</span></div></div>`;
}

function mobileChoice(title, detail, icon, selected = false) {
  return `<div class="mobile-choice ${selected ? "selected" : ""}"><span class="choice-icon">${icon}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span><span class="chevron">›</span></div>`;
}

function mobileRows(rows) {
  return rows.map(([title, value, tone = ""]) => `<div class="list-row"><strong>${escapeHtml(title)}</strong><span class="${tone ? `status ${tone}` : "muted"}">${escapeHtml(value)}</span></div>`).join("");
}

function mobileChecklist(rows) {
  return rows.map((row) => {
    const [label, state = "done"] = Array.isArray(row) ? row : [row, "done"];
    return `<div class="check-row"><span class="check ${state}">${state === "done" ? "✓" : ""}</span><span>${escapeHtml(label)}</span></div>`;
  }).join("");
}

function mobileGeneric(screen, lead = screen.purpose) {
  return `
    <div class="mobile-hero">
      <div class="eyebrow">${escapeHtml(screen.area || "確認")}</div>
      <h2>${escapeHtml(screen.name)}</h2>
      <p>${escapeHtml(lead)}</p>
    </div>
    <div class="mobile-card">
      <div class="row-line"><h3>確認する内容</h3><span class="status info">架空表示</span></div>
      <div class="stack">
        <div class="mobile-step"><span class="step-dot done">1</span><span class="step-copy"><strong>内容を見て確認</strong><small>候補や状態を人が照合します。</small></span></div>
        <div class="mobile-step"><span class="step-dot">2</span><span class="step-copy"><strong>不足があれば理由を残す</strong><small>未確認を問題なしには変えません。</small></span></div>
        <div class="mobile-step"><span class="step-dot">3</span><span class="step-copy"><strong>次の画面へ進む</strong><small>公開レビュー版のため入力は保存されません。</small></span></div>
      </div>
    </div>
    <div class="mobile-card">
      <div class="row-line"><h3>サンプルの状態</h3><span class="status warn">人が確認</span></div>
      ${mobileRows([["担当", "デモ担当A"], ["対象", "デモブランド シャツ", "info"], ["更新", "確認前", "warn"]])}
    </div>`;
}

function mobileAdditionalBody(screen) {
  const id = screen.id;

  if (id === "photo-01") {
    return `<div class="mobile-flow-intro"><span class="status ok">✓ 5枚保存済み</span><strong>商品ごとにまとめます</strong></div><div class="flow-photo-grid"><div class="flow-photo-tile">${art("shirt", "架空の正面写真")}<strong>正面</strong></div><div class="flow-photo-tile">${art("shirt", "架空の背面写真")}<strong>背面</strong></div><div class="flow-photo-tile">${art("tag", "架空のブランドタグ写真")}<strong>ブランドタグ</strong></div><div class="flow-photo-tile">${art("receipt", "架空の品質表示写真")}<strong>品質表示</strong></div><div class="flow-photo-tile">${art("shirt", "架空の気になる箇所写真")}<strong>気になる箇所</strong></div></div><div class="note-box blue">役割ごとに写真を分けて、商品情報と一緒に確認します。</div>`;
  }
  if (id === "photo-02") {
    return `<div class="flow-breadcrumb">商品　›　AP-2608-0142　›　写真</div><div class="mobile-card flow-status-list">${mobileRows([["正面", "保存済み ✓", "ok"], ["背面", "保存済み ✓", "ok"], ["タグ2枚", "保存済み ✓", "ok"], ["気になる箇所", "保存済み ✓", "ok"]])}</div><div class="mobile-card private-storage"><div class="storage-title"><span class="storage-lock">▣</span><strong>PC内の非公開写真保管庫</strong></div>${mobileChecklist(["GitHub・Slack・Notionには保存しません", "原本は上書きしません"])}</div>`;
  }
  if (id === "photo-03") {
    return `<div class="flow-helper">編集前に人が確認</div><div class="mobile-card editable-card"><div class="flow-edit-row"><strong>ブランド</strong><span>CleanStyle　✎</span></div><div class="flow-edit-row"><strong>サイズ</strong><span>M　✎</span></div><div class="flow-edit-row"><strong>色</strong><span>ネイビー　✎</span></div><div class="flow-edit-row"><strong>素材</strong><span>綿100%　✎</span></div></div><div class="note-box amber">写真の候補をそのまま確定せず、編集前に人が確認します。</div>`;
  }
  if (id === "photo-04") {
    return `<div class="flow-helper">役割ごとに適したレシピを選択</div><div class="recipe-list"><article class="recipe-card">${art("shirt", "架空の正面・背面写真")}<div><strong>正面・背面</strong><small>白背景／中央／余白</small></div></article><article class="recipe-card">${art("shirt", "架空の正面写真")}<div><strong>正面だけ</strong><small>ブランド左上・サイズ右下</small></div></article><article class="recipe-card">${art("tag", "架空のタグ写真")}<div><strong>タグ・気になる箇所</strong><small>向き／明るさのみ</small></div></article></div><div class="note-box blue">役割ごとに型を設定</div>`;
  }
  if (id === "photo-05") {
    return `<div class="flow-helper">現在の利用可能な方法</div><div class="method-list">${mobileChoice("自作画像編集（準備中）", "同じレシピで将来差し替え", "⚒")}${mobileChoice("編集用セットを作る", "手動編集へ渡す写真をまとめる", "□", true)}${mobileChoice("編集せず進む", "原本のまま次へ", "▷")}</div><div class="note-box blue">外部アプリを自動操作しません。</div>`;
  }
  if (id === "photo-06") {
    return `<div class="mobile-card zip-card"><div class="zip-title"><span class="zip-icon">▱</span><strong>5枚を1つにまとめる</strong></div><div class="file-list"><span>AP-2608-0142_01_front.jpg</span><span>AP-2608-0142_02_back.jpg</span><span>AP-2608-0142_03_brand-tag.jpg</span><span>…</span></div><div class="manifest-list"><div><strong>manifest</strong><span>JSON</span></div><div><strong>編集レシピ</strong><span>JSON</span></div></div></div><div class="note-box green-note">✓ 位置情報を除いたコピー</div><div class="note-box blue">原本はアプリに残ります。</div>`;
  }
  if (id === "photo-07") {
    return `<div class="mobile-choice action-choice selected"><span class="choice-icon">↑</span><span><strong>ZIPまたは画像を選ぶ</strong><small>加工後のファイルを本人が選択</small></span><span class="chevron">›</span></div><div class="status-center ok">✓　5 / 5枚 一致</div><div class="image-compare mobile-image-compare"><figure>${art("shirt", "加工前の架空写真")}<figcaption>加工前</figcaption></figure><span class="compare-arrow">›</span><figure>${art("shirt", "加工後の架空写真")}<figcaption>加工後</figcaption></figure></div><div class="mobile-card">${mobileChecklist(["色を確認", "ロゴを確認", "傷を確認"])}</div><div class="note-box blue">契約済み編集ソフトで手動編集。将来の自作編集も同じ確認をします。</div>`;
  }

  if (id === "box-01") {
    return `<div class="mobile-card box-form"><div class="flow-edit-row"><strong>仕入箱番号</strong><span>BOX-2026-014</span></div><div class="flow-edit-row"><strong>仕入先</strong><span>卸A</span></div><div class="flow-edit-row"><strong>仕入日</strong><span>2026/08/26　▣</span></div><div class="flow-edit-row"><strong>箱の仕入額</strong><span>¥75,000</span></div><div class="flow-edit-row count-row"><strong>入っている数</strong><span class="status warn">まだ不明</span></div></div><div class="note-box blue">点数は箱を開けて数えます。</div>`;
  }
  if (id === "box-02") {
    return `<div class="counter-ring"><strong>48<small>点</small></strong></div><button type="button" class="primary-button full-button count-button" data-static="1点を数えました">＋1点</button><button type="button" class="secondary-button full-button count-undo" data-static="1点戻しました">1点戻す</button><div class="note-box blue">数えてから検品を始めます。</div>`;
  }
  if (id === "box-03") {
    return `<div class="progress-copy"><span>1 / 48</span></div><div class="progress-line"><span style="width:2.1%"></span></div><div class="quick-product-visual">${garmentArt("top", "架空のネイビーTシャツ")}<div class="simple-paper"><small>商品番号</small><strong>0128</strong></div></div><div class="mobile-card compact-info">${mobileRows([["ブランド", "CleanStyle"], ["種類", "Tシャツ"], ["状態", "販売候補", "info"], ["価格の目安", "¥3,000〜4,000"]])}</div>`;
  }
  if (id === "box-04") {
    return `<div class="queue-card-list"><article class="queue-card high"><span class="queue-icon">↑</span><div><strong>高く売れそう</strong><b>5点</b></div><span class="chevron">›</span></article><article class="queue-card check"><span class="queue-icon">⌕</span><div><strong>状態を確認</strong><b>3点</b></div><span class="chevron">›</span></article></div><div class="note-box amber">全商品を最初から詳しく調べません。</div>`;
  }
  if (id === "box-05") {
    return `<div class="mobile-card forecast-card">${mobileRows([["実数", "48着"], ["販売候補", "39着"], ["見込売上", "¥138,000〜169,000", "info"], ["仕入額", "¥75,000"], ["見込手数料・送料", "¥32,000〜41,000", "warn"], ["見込粗利", "¥31,000〜53,000", "ok"], ["損益分岐", "24着"]])}</div><div class="status-center warn">⚖　見込み・人が確認</div>`;
  }
  if (id === "box-06") {
    return `<div class="mobile-card actual-card">${mobileRows([["販売済み", "31 / 48着", "ok"], ["実売上", "¥124,000", "ok"], ["実手数料・送料", "¥29,600", "ok"], ["仕入額", "¥75,000"], ["実粗利", "¥19,400", "ok"], ["未販売", "17着", "warn"]])}</div><div class="status-center ok">▥　販売記録から集計</div>`;
  }
  if (id === "box-07") {
    return `<div class="mobile-card kpi-card">${mobileRows([["30日販売率（回転）", "35%"], ["9月 売上見込", "¥54,000", "ok"], ["9月 粗利見込", "¥16,000", "ok"], ["10月 売上見込", "¥47,000", "ok"], ["10月 粗利見込", "¥13,000", "ok"], ["残り在庫", "31着"]])}</div><div class="status-center warn">⚖　見込み・人が確認</div><div class="small-center">運用の参考値です</div>`;
  }

  if (id === "sales-01") {
    return `<div class="sales-candidate-list"><article class="sales-candidate"><span class="candidate-icon blue">◫</span><div><strong>今週見直す</strong><b>3件</b></div><span class="chevron">›</span></article><article class="sales-candidate"><span class="candidate-icon green">♧</span><div><strong>季節に合う</strong><b>2件</b></div><span class="chevron">›</span></article><article class="sales-candidate"><span class="candidate-icon amber">◇</span><div><strong>値下げ依頼あり</strong><b>1件</b></div><span class="chevron">›</span></article></div><div class="note-box blue">自動で価格は変えません。予定や判断は人が確認します。</div>`;
  }
  if (id === "sales-02") {
    return `<div class="sales-product"><div class="sales-product-art">${garmentArt("jacket", "架空のベージュジャケット")}</div><div><strong>AP-2608-0142</strong><small>メンズ ジャケット<br>ベージュ / M</small></div></div><div class="mobile-card sales-status-card">${mobileRows([["出品から", "18日"], ["現在", "¥6,800"], ["下限", "¥5,900"], ["閲覧", "128"], ["いいね", "7"]])}</div><div class="note-box blue">公式画面を見て入力。最新の情報を人が確認します。</div>`;
  }
  if (id === "sales-03") {
    return `<div class="reason-list"><article class="reason-card"><span class="reason-icon blue">▥</span><div><strong>自分の販売履歴</strong><b>同じ種類は平均21日</b><small>過去の販売実績をもとに算出しています。</small></div></article><article class="reason-card"><span class="reason-icon green">♧</span><div><strong>季節</strong><b>9月は秋物の準備時期</b><small>公開情報をもとに判断しています。</small></div></article><article class="reason-card"><span class="reason-icon purple">▤</span><div><strong>公式公開情報</strong><b>確認 2026/08/26</b><small>販売サイトから自動取得していません。</small></div></article></div><div class="status-center warn">●　参考・人が確認</div><div class="note-box blue">販売サイトから自動取得しません。</div>`;
  }
  if (id === "sales-04") {
    return `<div class="price-option-list"><article class="price-option"><span class="radio"></span><strong>5%</strong><span>¥6,460</span><small>粗利見込 ¥1,660</small></article><article class="price-option selected"><span class="radio"></span><strong>10%</strong><span>¥6,120</span><small>粗利見込 ¥1,320</small><em>おすすめ</em></article><article class="price-option disabled"><span class="radio"></span><strong>15%</strong><span>¥5,780</span><small>下限より低い</small><em>⊘</em></article></div><div class="note-box blue">正解を固定せず利益も確認します。</div>`;
  }
  if (id === "sales-05") {
    return `<div class="event-list"><article class="event-card"><span class="event-icon green">♧</span><div><strong>衣替え</strong><b>9月上旬</b><small>出典・確認日　2026/08/26</small><em>✓ この商品に合うか確認</em></div><span class="check-dot">✓</span></article><article class="event-card"><span class="event-icon green">▦</span><div><strong>Green Friday /<br>Black Friday</strong><b>11月</b><small>出典・確認日　2026/08/26</small><em>✓ この商品に合うか確認</em></div><span class="check-dot">✓</span></article><article class="event-card"><span class="event-icon green">♧</span><div><strong>クリスマス前</strong><b>12月上旬</b><small>出典・確認日　2026/08/26</small><em>✓ この商品に合うか確認</em></div><span class="check-dot">✓</span></article></div><div class="status-center warn">●　予定・人が確認</div>`;
  }
  if (id === "sales-06") {
    return `<div class="mobile-card sales-summary">${mobileRows([["候補", "¥6,120"], ["見込み粗利", "¥1,320"], ["下限より", "¥220 上", "info"]])}</div><div class="sales-action-list">${mobileChoice("公式の価格機能を開く", "公式画面で本人が変更", "↗")}${mobileChoice("変更内容をコピー", "価格や理由をコピーします", "▤")}</div><div class="note-box blue">このアプリは自動値下げしません。価格の変更は公式画面で本人が行います。</div>`;
  }

  if (id === "genre-suit-01") {
    return `<div class="garment-stack"><article class="component-card">${garmentArt("jacket", "架空のネイビー上着")}<div><strong>上着</strong><b>1点</b></div></article><article class="component-card">${garmentArt("pants", "架空のネイビーパンツ")}<div><strong>パンツ</strong><b>1点</b></div></article></div><div class="note-box blue">上下を一組で確認</div>`;
  }
  if (id === "genre-suit-02") {
    return `<div class="flow-helper">上着を撮る</div><div class="mobile-card checklist-card">${mobileChecklist(["正面", "背面", "襟・ラペル", "袖口", "裏地", "ブランド・サイズ", ["気になる箇所", "pending"]])}</div>`;
  }
  if (id === "genre-suit-03") {
    return `<div class="flow-helper">パンツを撮る</div><div class="mobile-card checklist-card">${mobileChecklist(["正面", "背面", "ウエスト", "留め具", "裾", "品質表示", ["気になる箇所", "pending"]])}</div>`;
  }
  if (id === "genre-suit-04") {
    return `<div class="garment-stack"><article class="component-card">${garmentArt("top", "架空のネイビートップス")}<div><strong>トップス</strong><b>1点</b></div></article><article class="component-card">${garmentArt("pants", "架空のネイビーボトムス")}<div><strong>ボトムス</strong><b>1点</b></div></article></div><div class="note-box blue">組み合わせを一組で確認</div>`;
  }
  if (id === "genre-suit-05") {
    return `<div class="flow-helper">トップスを撮る</div><div class="mobile-card checklist-card">${mobileChecklist(["正面", "背面", "首元", "袖口", "裾", "ブランド・サイズ", ["気になる箇所", "pending"]])}</div>`;
  }
  if (id === "genre-suit-06") {
    return `<div class="flow-helper">ボトムスを撮る</div><div class="mobile-card checklist-card">${mobileChecklist(["正面", "背面", "ウエスト", "裾", "品質表示", ["気になる箇所", "pending"]])}</div><div class="status-center ok">✓　不足 0点</div><button type="button" class="secondary-button full-button" data-static="作業を続けます">作業を続ける</button>`;
  }

  return mobileGeneric(screen);
}

function mobileBody(screen) {
  if (screen.isAdditional) return mobileAdditionalBody(screen);
  const n = screen.number;
  if (n === 1) {
    return `<div class="login-logo">${svgIcon("shirt")}</div>${mobileField("メールアドレス", "メールアドレスを入力", "✉")} ${mobileField("パスワード", "パスワードを入力", "▣")}<p class="mobile-primary-note">安全に作業を始めます</p>`;
  }
  if (n === 2) {
    return `<div class="mobile-hero"><div class="eyebrow">最初に一度だけ</div><h2>はじめの設定</h2><p>まず、基本情報を設定します。あとから変更できます。</p></div><div class="mobile-card">${mobileField("事業所名", "事業所名を入力")}</div><div class="mobile-card"><h3>使う機能</h3>${mobileChecklist(["検品", "撮影", "採寸", ["会計（あとで設定）", "pending"]])}</div>`;
  }
  if (n === 3) {
    return `<div class="mobile-hero"><div class="eyebrow">役割を選ぶ</div><h2>メンバーと担当</h2><p>必要な情報だけを見せる担当を選びます。</p></div><div class="mobile-card">${mobileChoice("オーナー", "すべての設定と管理", "●", true)}${mobileChoice("検品・撮影", "検品と撮影を担当", "✓")}${mobileChoice("発送", "梱包と発送を担当", "□")}${mobileChoice("会計", "入出金と集計を担当", "￥")}</div>`;
  }
  if (n === 4) {
    return `<div class="early-title"><strong>ホーム</strong><span>♧</span></div><div class="home-task-card"><div class="home-task-title">今日やること <span>5件</span></div>${[["検品", "残り 3件", "42%"], ["撮影", "残り 2件", "57%"], ["採寸", "残り 4件", "68%"]].map(([label, value, width]) => `<div class="home-task-row"><div><strong>${label}</strong><small>${value}</small></div><span class="home-progress"><i style="width:${width}"></i></span><b>✓</b></div>`).join("")}</div><div class="mobile-card home-alert-card"><h3>要確認</h3>${mobileRows([["原価未確認", "1件", "warn"], ["送料未確認", "1件", "warn"], ["承認待ち", "1件", "info"]])}</div>`;
  }
  if (n === 5) {
    return `<div class="mobile-hero"><div class="eyebrow">自分の担当</div><h2>作業一覧</h2><p>作業の種類を選びます。件数は架空です。</p></div><div class="mobile-card">${mobileChoice("仕入れ", "2件 · 書類を確認", "↓")}${mobileChoice("検品", "3件 · 未確認あり", "✓")}${mobileChoice("撮影", "2件 · 正面から", "◉")}${mobileChoice("採寸", "4件 · 項目を入力", "╱")}</div>`;
  }
  if (n === 6) {
    return `<div class="mobile-hero"><div class="eyebrow">送信待ち</div><h2>送信待ち</h2><p>通信が復帰したら自動で送信します</p></div><div class="offline-card-list"><article><span class="offline-icon">▯</span><div><strong>端末に保存済み</strong><small>送信前に端末へ保存しています</small></div><b class="status ok">✓</b></article><article><span class="offline-icon warn">!</span><div><strong>送信待ち</strong><small>未送信のデータがあります</small></div><b class="status warn">2件</b></article><article><span class="offline-icon">◷</span><div><strong>最後に送れた時刻</strong><small>今日 14:35</small></div></article></div>`;
  }
  if (n === 7) {
    return `<div class="screen-instruction">仕入れ書類を選んでください</div><div class="mobile-card choice-card-stack">${mobileChoice("請求書ファイル", "卸仕入れ", "▤", true)}${mobileChoice("レシートを撮る", "店舗で購入", "▥")}</div>`;
  }
  if (n === 8) {
    return `<div class="screen-instruction">ファイルの保存先を選んでください</div><div class="file-picker-card"><span class="file-picker-icon">□</span><strong>ファイルから選ぶ</strong><small>PDF・画像</small></div><div class="screen-section-label">保存先</div><div class="mobile-card source-list">${mobileChoice("このiPhone内", "", "▯")}${mobileChoice("iCloud Drive", "", "☁")}${mobileChoice("Google Drive", "", "□")}</div><div class="note-box blue">⌁　メール添付は一度ファイルに保存</div><div class="note-box muted-note">♙　Googleのログイン情報は預かりません</div>`;
  }
  if (n === 9) {
    return `<div class="file-identity"><span class="file-icon">▤</span><div><strong>invoice-2026-08.pdf</strong><small>2ページ</small></div></div><div class="note-box amber centered-note">◷　原本を人が確認</div><div class="invoice-paper"><div class="invoice-head"><strong>請 求 書</strong><small>No. INV-2608001<br>2026年8月1日</small></div><p>株式会社サンプル商事　御中</p><p>下記のとおりご請求申し上げます。</p>${pcTable(["商品名", "数量", "単価", "金額"], [["ネイビーシャツ", "10枚", "2,980円", "29,800円"], ["収納ボックス", "5個", "1,480円", "7,400円"], ["ファイルA4", "20冊", "760円", "15,200円"]])}<div class="invoice-total"><strong>合計</strong><b>¥52,400</b><small>（税込）</small></div></div>`;
  }
  if (n === 10) {
    return `<div class="note-box amber centered-note">◷　読み取り候補・人が確認</div><div class="screen-instruction">読み取った内容を確認・編集してください</div><div class="mobile-card editable-lines">${mobileField("仕入先", "株式会社サンプル商事", "✎")}${mobileField("請求日", "2026年8月1日", "✎")}${mobileField("合計", "¥52,400", "✎")}</div>`;
  }
  if (n === 11) {
    return `<div class="screen-instruction">読み取った商品行を確認・編集してください</div><div class="line-item-stack"><article class="line-item-card"><span class="edit-mark">✎</span><strong>商品名</strong><b>ネイビーシャツ</b><div><small>数量</small><small>単価</small></div><div><span>10枚</span><span>2,980円</span></div></article><article class="line-item-card"><span class="edit-mark">✎</span><strong>商品名</strong><b>収納ボックス</b><div><small>数量</small><small>単価</small></div><div><span>5個</span><span>1,480円</span></div></article><article class="line-item-card"><span class="edit-mark">✎</span><strong>商品名</strong><b>ファイルA4</b><div><small>数量</small><small>単価</small></div><div><span>20冊</span><span>760円</span></div></article></div>`;
  }
  if (n === 12) {
    return `<div class="screen-instruction">商品の確認方法を<br>選択してください</div><div class="mobile-card choice-card-stack">${mobileChoice("ラベルを読む", "商品のラベルをカメラで読み取ります", "▥")}${mobileChoice("番号を入力", "商品番号を手入力します", "123")}${mobileChoice("今回は使わない", "一時的に確認方法を使わずに進みます", "⊘")}</div><p class="screen-footnote">中古品などラベルがない時も進めます</p>`;
  }
  if (n === 13) {
    return `<div class="screen-instruction">商品番号と写真を確認してください</div><div class="product-confirm-card"><div><small>商品番号（手入力）</small><strong>AP-0825-00421</strong></div><div class="confirm-pill">✓　確認済み</div></div><div class="mobile-card product-photo-card"><div class="screen-section-label">商品写真</div>${garmentArt("jacket", "架空のネイビーシャツ") }<div class="confirm-pill">✓　確認済み</div></div><div class="screen-footnote">番号と写真を人が確認</div>`;
  }
  if (n === 14) {
    return `<div class="screen-instruction">保管場所を確認してください</div><div class="mobile-card shelf-photo-card"><div class="screen-section-label">保管場所の写真</div>${art("shelf", "架空の棚写真")}</div><div class="mobile-card location-confirm-card"><div class="screen-section-label">保管場所</div><strong>作業部屋・棚A・2段目・箱3</strong><div class="confirm-pill">✓　確認済み</div></div><div class="screen-footnote">保管場所を人が確認</div>`;
  }
  if (n === 15) {
    return `<div class="screen-instruction">商品と保管場所を確認してください</div><div class="match-card"><div><strong>商品</strong><div class="match-product"><span>${garmentArt("jacket", "架空のネイビーシャツ")}</span><span><small>商品番号</small><b>AP-0825-00421</b><span class="confirm-pill">✓　確認済み</span></span></div></div><div><strong>保管場所</strong><div class="match-location">${art("shelf", "架空の棚写真")}<span>作業部屋・棚A<br>2段目・箱3<br><span class="confirm-pill">✓　確認済み</span></span></div></div></div><div class="screen-footnote">上記の内容を人が確認しました</div>`;
  }
  if (n === 16) {
    return `<div class="screen-instruction">次の工程に進みます</div><div class="ready-card"><div class="ready-icon">✓</div><strong>使わない工程は<br>表示しません</strong><div class="confirm-pill">✓　確認済み</div></div><div class="mobile-card label-skip-card"><strong>商品ラベル：省略済み</strong></div><div class="workflow-dots"><span class="done">✓<small>格納</small></span><i></i><span class="current">○<small>検品</small></span><i></i><span>○<small>撮影</small></span><i></i><span>○<small>出品</small></span></div>`;
  }
  if (n === 17) {
    return `<div class="screen-instruction">商品の全体の状態を確認してください</div><div class="progress-count">2 / 6</div><div class="inspection-state-list"><article class="inspection-state neutral-state"><span>?</span><div><strong>未確認</strong><small>まだ確認していません</small></div></article><article class="inspection-state ok-state"><span>✓</span><div><strong>問題なしを確認</strong><small>問題がないことを確認しました</small></div></article><article class="inspection-state warn-state"><span>!</span><div><strong>気になる点あり</strong><small>汚れや傷などがあります</small></div></article></div><p class="screen-footnote">ⓘ　すべての項目を確認するまで<br>　　次のステップへ進めません</p>`;
  }
  if (n === 18) {
    return `<div class="screen-instruction">気になる箇所をタップしてください</div><div class="marker-photo garment-photo" role="img" aria-label="架空のネイビーシャツ写真と気になる箇所"><span class="marker one">1</span><span class="marker two">2</span>${garmentArt("jacket", "架空のネイビーシャツ")}</div><div class="mobile-card issue-detail-card">${mobileRows([["場所", "左袖"], ["種類", "小さな汚れ"], ["程度", "小さい"], ["写真", "1枚　›"]])}<div class="detail-note"><strong>メモ</strong><span>左袖の外側にうっすらとした汚れ</span></div></div>`;
  }
  if (n === 19) {
    return `<div class="screen-instruction">この商品の検品結果をまとめました</div><div class="inspection-summary-card"><div class="summary-row ok"><span>✓</span><strong>問題なし</strong><b>4<small>件</small></b></div><div class="summary-row warn"><span>!</span><strong>気になる点</strong><b>2<small>件</small></b></div><div class="summary-row neutral"><span>?</span><strong>未確認</strong><b>0<small>件</small></b></div></div><div class="summary-subtitle">気になる箇所（2件）</div><div class="issue-thumbnails"><div>${garmentArt("jacket", "架空の袖写真")}<span>1</span></div><div>${garmentArt("jacket", "架空の袖口写真")}<span>2</span></div></div>`;
  }
  if (n === 20) {
    return `<div class="screen-instruction">すべての写真を撮影してください<br><strong>残り 5 / 8</strong></div><div class="photo-todo-list">${[["正面", "未撮影", "warn"], ["背面", "未撮影", "warn"], ["ブランド・サイズ", "未撮影", "warn"], ["品質表示", "未撮影", "warn"], ["襟元", "未撮影", "warn"], ["袖口", "未撮影", "warn"], ["裾", "未撮影", "warn"], ["気になる箇所", "未撮影", "warn"]].map(([label, status, tone]) => `<div class="photo-todo"><span class="camera-glyph">▣</span><strong>${label}</strong><span class="status ${tone}">${status}</span><span class="chevron">›</span></div>`).join("")}</div><div class="note-box blue centered-note">ⓘ　すべての写真を撮影すると<br>　　検品を完了できます</div>`;
  }
  if (n === 21) {
    return `<div class="screen-instruction">枠の中に商品を入れてください</div><div class="camera-frame" role="img" aria-label="架空の撮影ガイド"><span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>${garmentArt("jacket", "架空のネイビーシャツ")}</div><div class="camera-guide-list">${mobileChecklist(["明るい場所で撮影してください", "全体を枠の中に入れてください", "影が入らないようにしてください"])}</div>`;
  }
  if (n === 22) {
    return `<div class="screen-instruction">写真を確認してください</div><div class="review-photo">${garmentArt("jacket", "架空の正面写真")}</div><div class="camera-guide-list">${mobileChecklist(["ぶれなし", "明るさよし", "切れなし"] )}</div><button type="button" class="secondary-button full-button inline-secondary" data-static="撮り直しを選択">撮り直す</button>`;
  }
  if (n === 23) {
    return `<div class="note-box amber retake-alert">!　袖口が暗い</div><div class="mobile-card selected-photo-card"><strong>選択中の写真</strong>${garmentArt("jacket", "架空の袖口写真")}<b>袖口</b></div><div class="mobile-card improve-card"><strong>改善のポイント</strong><div class="note-box amber">☼　明るい場所でもう一度</div></div>`;
  }
  if (n === 24) {
    return `<div class="photo-summary-header"><span class="status ok">✓</span><strong>8 / 8 枚</strong></div><div class="photo-summary-progress"><span></span></div><div class="photo-grid">${["shirt", "shirt", "tag", "tag", "shirt", "shirt", "tag", "shirt"].map((kind, index) => `<figure>${art(kind, `架空の写真 ${index + 1}`)}<figcaption>${["正面", "背面", "タグ", "品質表示", "襟元", "袖口", "裾", "気になる箇所"][index]}</figcaption></figure>`).join("")}</div>`;
  }
  if (n === 25) {
    return `<div class="mobile-card measure-prep-card">${garmentArt("jacket", "架空のネイビーシャツ")}</div><div class="mobile-card"><div class="screen-section-label">採寸する箇所</div>${mobileRows([["▧", "肩幅"], ["▧", "身幅"], ["▧", "着丈"], ["▧", "袖丈"]])}</div><div class="note-box green-note">✓　伸ばさずきれいに置く<br><small>しわを伸ばし、平らな場所で採寸します</small></div>`;
  }
  if (n === 26) {
    return `<div class="measure-step-pill">1 / 4　肩幅</div><div class="measurement-visual" role="img" aria-label="シャツの肩幅を測る図">${garmentArt("jacket", "架空のシャツ") }<span class="measure-line"></span><span class="measure-dot left"></span><span class="measure-dot right"></span></div><div class="measure-caption">端から端まで水平に測る</div><div class="measure-value">47.5 <small>cm</small></div>`;
  }
  if (n === 27) {
    return `<div class="screen-section-label">肩幅の写真</div><div class="camera-frame measurement-photo" role="img" aria-label="架空の採寸写真"><span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>${garmentArt("jacket", "架空の採寸写真")}</div><div class="note-box blue centered-note">▣　メジャーの目盛りが読めるように<br>　　端から端まで水平に配置します</div>`;
  }
  if (n === 28) {
    return `<div class="screen-section-label">採寸の比較</div><div class="measure-compare-card"><div><small>前回</small><b>47.5<em> cm</em></b></div><span>→</span><div><small>今回</small><b>51.0<em> cm</em></b></div></div><div class="note-box amber centered-note">!　差が大きい<br><small>測り方を確認してください</small></div><div class="mobile-card reason-card"><strong>差が出た理由</strong>${mobileChoice("測る位置が違う", "", "○")}${mobileChoice("メジャーが斜めだった", "", "○")}${mobileChoice("生地を引っ張った", "", "○")}${mobileChoice("その他", "", "○")}</div>`;
  }
  if (n === 29) {
    return mobileAdditionalBody({ id: "photo-01" });
  }
  if (n === 30) {
    return mobileAdditionalBody({ id: "photo-02" });
  }
  if (n === 31) {
    return mobileAdditionalBody({ id: "photo-03" });
  }
  if (n === 32) {
    return mobileAdditionalBody({ id: "photo-04" });
  }
  if (n === 33) {
    return mobileAdditionalBody({ id: "photo-05" });
  }
  if (n === 34) {
    return `<div class="screen-instruction">必要な情報を入力してください</div><div class="mobile-card order-form-card">${mobileField("アプリ内注文番号（自動生成／変更不可）", "ORD-20260826-0012")}${mobileField("販売先", "メルカリ　⌄")}${mobileField("販売先の取引ID", "例）TX-260826-012")}${mobileField("購入者表示名（任意）", "例）たろう") }<small class="form-help">匿名配送なら住所は保存しません</small></div>`;
  }
  if (n === 35) {
    return `<div class="screen-instruction">手順にそって取り出してください</div><div class="pickup-check-list"><div class="pickup-check"><span>✓</span><strong>商品を確認済み</strong><small>商品コード・数量を確認しました　10:18</small></div><div class="pickup-check"><span>✓</span><strong>棚を確認済み</strong><small>棚A・2段目・箱3を確認しました　10:19</small></div></div><div class="screen-section-label">保管場所の写真</div><div class="shelf-location-photo">${art("shelf", "架空の保管場所写真")}<span>⌾　棚A・2段目・箱3</span></div><div class="note-box green-note centered-note">✓　商品と棚が一致しました<br><strong>一致</strong></div>`;
  }
  if (n === 36) {
    return `<div class="screen-instruction">メルカリで使える方法を選んでください</div><div class="shipping-choice-list">${mobileChoice("ゆうパケットポストmini", "", "◉", true)}${mobileChoice("ネコポス", "", "○")}${mobileChoice("ゆうパケットポスト", "", "○")}${mobileChoice("宅急便コンパクト", "", "○")}${mobileChoice("ゆうパケットプラス", "", "○")}</div><div class="other-size-link">ほかのサイズを見る　›</div><div class="mobile-card official-date-card"><strong>♢　公式確認</strong><span>2026/08/26</span></div>`;
  }
  if (n === 37) {
    return `<div class="screen-instruction">内容を確認してください</div><div class="mobile-card shipping-summary-card">${mobileRows([["商品", "オックスフォードシャツ"], ["販売先", "メルカリ"], ["取引ID", "TX-260826-012"], ["配送方法", "ネコポス"], ["送料", "210円"]])}</div><button type="button" class="secondary-button full-button inline-secondary" data-static="公式料金を確認">公式料金を確認</button><div class="note-box amber">⚠　料金は変わることがあります</div>`;
  }
  if (n === 38) {
    return `<div class="screen-instruction">内容を記録してください</div><div class="mobile-card shipped-card"><div class="shipped-status"><span>✓</span><strong>確認済み</strong><small>記録日時：2026/08/26 15:30</small></div>${mobileRows([["配送方法", "ネコポス"], ["送料", "210円"], ["発送日時", "2026/08/26 15:30"], ["担当", "本人"]])}</div><div class="mobile-card shipping-settings-card"><strong>⚙　送料一覧</strong><small>メルカリ / Yahoo!フリマ・オークション<br>公式確認日つき</small><b>送料一覧を編集　›</b></div>`;
  }
  if (n === 39) {
    return `<div class="assignee-filter"><span>今日の担当</span><b>すべて　⌄</b></div><div class="section-heading">確認する内容</div><div class="exception-list"><article><span class="exception-icon">⌕</span><strong>見つからない</strong><b>3件</b></article><article><span class="exception-icon">▤</span><strong>別の棚にある</strong><b>2件</b></article><article><span class="exception-icon">□</span><strong>予定外の商品</strong><b>1件</b></article></div>`;
  }
  if (n === 40) {
    return `<div class="assignee-filter"><span>今日の担当</span><b>すべて　⌄</b></div><div class="screen-instruction left-instruction">仮状態にする前に確認してください</div><div class="mobile-card exception-check-card">${mobileChecklist(["商品を再確認", "棚を再確認", "写真", "理由"])}</div><div class="press-card"><span class="press-ring">◉</span><strong>仮状態にする場合は<br>下のボタンを3秒押してください</strong></div>`;
  }
  if (n === 41) {
    return `<div class="assignee-filter"><span>今日の担当</span><b>すべて　⌄</b></div><div class="screen-instruction left-instruction">商品を確認してください</div><div class="mobile-card restore-card">${mobileChoice("商品番号", "AH-3201-7782", "◇")}${mobileChoice("現在の棚", "B-12-04", "▤")}</div><div class="note-box green-note centered-note">✓　再確認済み</div><div class="mobile-card history-card"><strong>履歴</strong><small>▣　2025/05/20 10:35 に仮状態にしました</small></div>`;
  }
  if (n === 42) {
    return `<div class="assignee-filter"><span>今日の担当</span><b>すべて　⌄</b></div><div class="screen-instruction left-instruction">返品商品を確認してください</div><div class="mobile-card return-card">${mobileRows([["別場所で保管", "返品棚 R-01"], ["状態", "箱に傷あり・未使用"], ["再販できるか", "再販可能", "ok"]])}</div><div class="mobile-card human-check-card"><strong>人の確認</strong><div class="check-row"><span class="check done">✓</span><span>担当者が確認しました</span></div><div class="check-row"><span class="check pending">!</span><span>気になる点が1件あります</span></div></div>`;
  }
  if (n === 43) {
    return `<div class="assignee-filter"><span>今日の担当</span><b>すべて　⌄</b></div><div class="screen-instruction left-instruction">事実を分けて確認してください</div><div class="mobile-card fact-list">${mobileRows([["▣　売上", "¥18,800"], ["◷　手数料", "¥1,900"], ["▤　送料", "¥600"], ["◎　仕入れ代", "¥9,200"]])}</div><div class="note-box amber centered-note">⊖　金額は事実ごとに分けて記録します</div>`;
  }
  if (n === 44) {
    return `<div class="screen-instruction">会計ファイルの作成に必要な設定を<br>確認してください。</div><div class="account-setting-list"><article>${mobileChoice("申告の設定", "申告区分や提出方法などの設定を確認してください", "▣")}</article><article>${mobileChoice("消費税", "課税方式や控除税額などの設定を確認してください", "▣")}</article><article>${mobileChoice("会計年度", "会計年度の開始日と終了日を設定します", "▣")}</article></div><div class="note-box amber">設定した内容は、いつでも変更できます。<br>内容をご確認のうえ、人が確認してください。</div>`;
  }
  if (n === 45) {
    return `<div class="screen-instruction">候補として検出された項目を確認し、<br>必要な項目を確認してください。</div><div class="account-candidate-list"><article>${mobileChoice("売上", "売上に関する取引の候補です", "▣") }<span class="status warn">候補・人が確認</span></article><article>${mobileChoice("販売手数料", "販売手数料に関する候補です", "▣") }<span class="status warn">候補・人が確認</span></article><article>${mobileChoice("送料", "送料に関する候補です", "▣") }<span class="status warn">候補・人が確認</span></article><article>${mobileChoice("仕入れ代", "仕入れに関する候補です", "▣") }<span class="status warn">候補・人が確認</span></article></div><div class="note-box amber">候補は自動で検出されたものです。<br>最終的に人が内容を確認してください。</div>`;
  }
  if (n === 46) {
    return `<div class="screen-instruction">会計ファイルを作成する前に、<br>以下の項目を確認してください。</div><div class="account-check-list"><article>${mobileChoice("設定", "すべての設定が完了しています。", "✓", true)}<span class="help-mark">?</span></article><article>${mobileChoice("資料", "必要な資料がそろっています。", "✓", true)}<span class="help-mark">?</span></article><article>${mobileChoice("重複", "重複の可能性は検出されていません。", "✓", true)}<span class="help-mark">?</span></article></div><div class="ready-account-card"><strong>✓　作成できます</strong><small>この内容で会計ファイルを作成できます。<br>人が最終確認してください。</small></div>`;
  }
  if (n === 47) {
    return `<div class="screen-instruction">作成される会計ファイルの内容を<br>確認してください（読み取り専用）。</div><div class="mobile-card file-preview-card"><strong>列名</strong><small>主要な列の一覧を確認できます。　⌄</small></div><div class="mobile-card file-preview-card"><strong>件数</strong><b>5件</b></div><div class="mobile-card file-preview-card"><strong>先頭行（抜粋）</strong><small>先頭の行を表示しています。</small>${pcTable(["日付", "取引区分", "金額", "摘要"], [["2024/04/01", "売上", "120,000", "商品A売上"]])}</div><div class="note-box blue">ⓘ　このファイルは外部へ自動送信しません。<br>ダウンロードして内容を確認してください。</div>`;
  }
  if (n === 48) {
    return `<div class="screen-instruction">作成したファイルを会計ソフトへ<br>手動で取込んだ結果を選択してください。</div><div class="import-choice-list"><article class="selected"><span>◉</span><strong>取込できた</strong><small>すべてのデータを取込できました。</small></article><article><span>○</span><strong>一部できなかった</strong><small>一部のデータが取込できませんでした。</small></article><article><span>○</span><strong>取込していない</strong><small>まだ取込を行っていません。</small></article></div><div class="mobile-card memo-card"><strong>メモ（任意）</strong><div class="fake-input">メモを入力してください</div><small>0/200</small></div>`;
  }
  if (n === 49) {
    return `<div class="screen-instruction">これまでの会計ファイルの作成と<br>取込の履歴を確認できます。</div><div class="account-history-list">${[["2024/04/28 10:15", "会計ファイル（5件）", "ダウンロード済み", "blue"], ["2024/04/25 16:42", "会計ファイル（5件）", "取込確認済み", "green"], ["2024/04/20 09:30", "会計ファイル（4件）", "置き換え済み", "amber"], ["2024/04/15 14:08", "会計ファイル（4件）", "取込確認済み", "green"], ["2024/04/10 11:22", "会計ファイル（3件）", "置き換え済み", "amber"]].map(([date, title, state, tone]) => `<article><small>${date}</small><strong>${title}</strong><span>作成者：担当者</span><b class="status ${tone}">${state}　›</b></article>`).join("")}</div>`;
  }
  return mobileGeneric(screen);
}

function footerActive(screen) {
  if (screen.isAdditional) return screen.area || "作業";
  if (screen.number >= 44) return "会計";
  if (screen.number >= 7) return "作業";
  return screen.area || "ホーム";
}

function mobileFooter(screen) {
  const active = footerActive(screen);
  return `<nav class="mobile-footer" aria-label="スマホ版の固定フッター">${MOBILE_FOOTER.map(([label, icon, target]) => `<button type="button" class="${label === active ? "active" : ""}" data-screen="${target}" aria-label="${label}へ移動"><span class="footer-icon" aria-hidden="true">${icon}</span><span class="footer-label">${label}</span></button>`).join("")}</nav>`;
}

function mobileScreenHtml(screen) {
  const login = screen.number === 1;
  const prev = mobileAdjacent(screen, -1);
  const next = mobileAdjacent(screen, 1);
  const noContinue = screen.isAdditional || screen.number <= 11 || (screen.number >= 29 && screen.number <= 33);
  const headerAction = screen.number === 4 || (screen.number >= 23 && screen.number <= 28) || (screen.number >= 34 && screen.number <= 43) ? "♧" : "?";
  return `<div class="phone-frame ${login ? "login-screen" : ""} ${screen.number <= 6 ? "early-screen" : ""} ${screen.isAdditional ? "additional-screen" : ""}">
    <div class="phone-screen">
      <div class="phone-island" aria-hidden="true"></div>
      <div class="phone-status"><span>9:41</span><span class="system-icons">▮▮▮　⌁　▰</span></div>
      <header class="mobile-header">
        <button class="back-button" type="button" data-screen="${prev}" aria-label="前の画面へ">‹</button>
        <div class="mobile-header-copy"><h1>${escapeHtml(screen.name)}</h1></div>
        <button class="more-button" type="button" data-static="ヘルプ・通知は確認用です" aria-label="ヘルプ・通知">${headerAction}</button>
      </header>
      <div class="mobile-scroll">
        ${mobileBody(screen)}
      </div>
      <div class="mobile-action"><button class="primary-button full-button" type="button" data-screen="${next}">${escapeHtml(screen.primary)}</button>${noContinue ? "" : `<button class="secondary-action" type="button" data-screen="${next}">作業を続ける　›</button>`}</div>
      ${login ? "" : mobileFooter(screen)}
    </div>
  </div>`;
}

function pcPanel(title, body, className = "") {
  return `<article class="panel panel-pad ${className}"><h2>${title}</h2>${body}</article>`;
}

function pcMetric(label, value, tone = "") {
  return `<div class="metric-card"><span class="metric-label">${escapeHtml(label)}</span><strong class="${tone ? `muted-${tone}` : ""}">${escapeHtml(value)}</strong></div>`;
}

function pcRows(rows) {
  return rows.map(([a, b, tone = ""]) => `<div class="list-row"><strong>${escapeHtml(a)}</strong><span class="${tone ? `status ${tone}` : "muted"}">${escapeHtml(b)}</span></div>`).join("");
}

function pcTable(headers, rows) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function pcChecklist(rows) {
  return rows.map(([label, state = "done"]) => `<div class="check-row"><span class="check ${state}">${state === "done" ? "✓" : ""}</span><span>${escapeHtml(label)}</span></div>`).join("");
}

function pcChoices(items, selected = 0) {
  return `<div class="choice-grid">${items.map(([title, detail], index) => `<div class="choice-card ${index === selected ? "selected" : ""}"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>`).join("")}</div>`;
}

function a4Labels() {
  return `<div class="a4-sheet" aria-label="A4 24面の架空ラベルプレビュー">${Array.from({ length: 24 }, (_, index) => { const number = String(123 + index).padStart(4, "0"); return `<div class="a4-label"><strong>${number}</strong>${barcode(number, true)}</div>`; }).join("")}</div>`;
}

function pcBody(screen) {
  const n = screen.number;
  if (n === 1) {
    return `<div class="pc-login-card panel"><div class="art shirt" aria-label="C案を反映した架空のロゴ">${svgIcon("shirt")}</div>${mobileField("メールアドレス", "メールアドレスを入力")}${mobileField("パスワード", "パスワードを入力", "▣")}<button class="primary-button full-button" type="button" data-screen="p-02">ログイン</button><p class="small muted" style="margin:12px 0 0;text-align:center">PC内の業務データへ安全に入ります</p></div>`;
  }
  if (n === 2) {
    return `<div class="pc-alert-grid" style="grid-column:1 / -1">${[["今日の確認", "12件", "ok"], ["続きの作業", "8件", "info"], ["在庫中", "1,284点", "ok"], ["売上の事実", "¥587,400", "ok"]].map(([label, value, tone]) => `<div class="pc-alert ${tone}"><span class="pc-alert-icon">${tone === "ok" ? "✓" : "▤"}</span><strong>${value}</strong><small>${label}</small></div>`).join("")}</div>${pcPanel("アラート（要対応）", `<div class="pc-alert-grid">${[["原価未確認", "23件", "stop"], ["送料未確認", "17件", "warn"], ["90日超在庫", "36点", "warn"], ["承認待ち", "9件", "info"]].map(([label, value, tone]) => `<div class="pc-alert ${tone}"><span class="pc-alert-icon">!</span><strong>${value}</strong><small>${label}</small></div>`).join("")}</div><div class="action-row">${button("未解決を確認", "primary-button", 'data-screen="p-03"')}</div>`, "wide")}${pcPanel("お知らせ", `<div class="timeline">${["週次の棚卸しは土曜です", "在庫評価の見直し予定", "送料の見直しについて"].map((item) => `<div class="timeline-item"><strong>${item}</strong><small>確認用の架空通知 · 今日</small></div>`).join("")}</div>`)}`;
  }
  if (n === 3) {
    return `${pcPanel("担当作業", pcTable(["作業", "商品", "担当", "期限", "残数", "状態"], [["検品", "レザージャケット", "デモ 花子", "今日 18:00", "5点", '<span class="status info">進行中</span>'], ["原価確認", "スニーカーA", "デモ 太郎", "今日 18:00", "12点", '<span class="status info">進行中</span>'], ["撮影", "腕時計セット", "デモ 健太", "5/19", "8点", '<span class="status neutral">未着手</span>'], ["採寸", "デモパンツ", "デモ 花子", "5/20", "10点", '<span class="status info">進行中</span>']]), "wide")}${pcPanel("選択した作業", `<div class="pc-inline-art">${art("shirt", "架空の商品")}<div><h3>検品</h3><p class="small muted">デモブランド シャツ<br />残り 5 / 20点</p></div></div><div class="note-box blue" style="margin-top:10px">付属品の有無とキズを重点確認。</div>`)}`;
  }
  if (n === 4) {
    return `${pcPanel("通知", `<div class="timeline">${["原価未確認のアラートが発生しました", "送料未確認が10件を超えました", "作業「撮影」があなたに割り当てられました", "送信待ちデータがあります"].map((item, index) => `<div class="timeline-item"><strong>${item}</strong><small>${index + 5}分前 · 架空表示</small></div>`).join("")}</div>`, "wide")}${pcPanel("あなたの役割", pcChecklist([["作業の割り当て・進捗確認", "done"], ["在庫・商品の閲覧", "done"], ["原価・利益の閲覧", "done"], ["会計の閲覧", "done"], ["設定の変更", "pending"]]))}${pcPanel("見られる範囲", `<div class="note-box blue">役割や設定により、一部の情報は非表示になります。</div>${pcRows([["見られる情報", "担当作業・在庫・販売価格", "ok"], ["一部制限", "原価・利益・会計", "warn"], ["見られない情報", "他メンバーの個人メモ", "stop"]])}`)}`;
  }
  if (n === 5) {
    return `${pcPanel("1. ファイルを選択", `<div class="tab-row"><button class="active" type="button" data-static="請求書ファイルを選択する画面です">請求書ファイル</button><button type="button" data-static="店舗レシートを選択する画面です">店舗レシート</button></div><div class="note-box blue" style="margin-top:12px">PCのファイル選択から本人が選びます。カメラは起動しません。</div><div class="action-row">${button("写真ファイルを選ぶ", "secondary-button", 'data-static="ファイル選択は確認用です"')}</div><p class="small muted">メール添付は一度ファイルに保存 · PDF / JPG / PNG</p>`, "half")}${pcPanel("2. 原本プレビュー", `${art("receipt", "架空の請求書原本")}<div class="action-row">${button("表示を確認", "ghost-button", 'data-static="原本の表示だけを確認します"')}</div>`, "half")}${pcPanel("3. 写真から読み取った内容（候補）", `${pcRows([["取引日", "2025/05/10"], ["店舗名", "デモリユース店"], ["合計（税込）", "¥26,620", "info"], ["状態", "人の確認待ち", "warn"]])}<div class="note-box amber" style="margin-top:10px">読み取り候補を原本と比較し、本人が確認します。</div>`, "full")}`;
  }
  if (n === 6) {
    return `${pcPanel("現在の点数", `<div class="number-box" style="font-size:32px;color:var(--ink);background:#fff">まだ不明</div><p class="small muted" style="text-align:center;margin-top:7px">数え始めてください</p><div class="stack" style="margin-top:13px">${button("+1", "primary-button full-button", 'data-static="1点の加算候補です"')}${button("+10", "secondary-button full-button", 'data-static="10点の加算候補です"')}${button("↶ 1つ戻す", "ghost-button full-button", 'data-static="直前の加算を戻す候補です"')}</div>`, "half")}${pcPanel("カウント履歴", pcTable(["時刻", "操作", "点数"], [["13:58:22", '<span class="chip blue">+1</span>', "17"], ["13:58:18", '<span class="chip blue">+10</span>', "16"], ["13:58:12", '<span class="chip blue">+1</span>', "6"], ["13:58:08", '<span class="chip blue">+1</span>', "5"], ["13:58:03", '<span class="chip blue">+10</span>', "4"]]), "wide")}${pcPanel("数え方", `<div class="note-box blue">点数は最初から決めつけず、開箱後に人が数えた履歴を残します。</div>`, "full")}`;
  }
  if (n === 7) {
    return `${pcPanel("進捗", `<div class="row-line"><strong>18 / 48点</strong><span class="status info">38%</span></div><div class="progress-line" style="margin-top:9px"><span style="width:38%"></span></div>`, "full")}${pcPanel("1. 商品番号（手書きメモから）", `<div class="number-box" style="font-family:serif;letter-spacing:.25em">0128</div><p class="small muted">白い紙やシールへ書ける短い番号</p>`, "half")}${pcPanel("2. スマホから届いた写真", `${art("package", "架空の商品写真")}<span class="status ok" style="margin-top:8px">3件受信</span>`, "half")}${pcPanel("3. ブランド・特徴", `${mobileField("ブランド", "デモブランド")}${mobileField("特徴", "レザー / ハンドバッグ")}`, "half")}${pcPanel("4. 販売価格を調べる", `<div class="note-box blue">検索語をまとめ、本人が公式画面や参考情報を確認できます。</div><div class="action-row">${button("検索語をコピー", "secondary-button", 'data-copy-text="デモブランド レザー ハンドバッグ"')}</div>`, "half")}`;
  }
  if (n === 8) {
    return `${pcPanel("要詳しく調べる", `<div class="pc-alert-grid"><div class="pc-alert stop"><strong>2点</strong><small>高値候補</small></div><div class="pc-alert warn"><strong>6点</strong><small>要確認</small></div><div class="pc-alert ok"><strong>40点</strong><small>通常登録完了</small></div><div class="pc-alert"><strong>48点</strong><small>合計</small></div></div>`, "full")}${pcPanel("2周目で詳しく見る商品", pcTable(["理由", "写真", "商品番号", "優先度"], [["高値帯の可能性", art("tag", "架空のバッグ写真"), "0217", '<span class="status stop">高</span>'], ["希少性の可能性", art("tag", "架空の時計写真"), "0045", '<span class="status stop">高</span>'], ["状態の確認が必要", art("package", "架空の商品写真"), "0133", '<span class="status warn">中</span>']]), "wide")}${pcPanel("通常登録は止めない", `<div class="note-box blue">要詳しく調べる商品だけを2周目へ送ります。ほかは簡単登録を続けられます。</div>`)}`;
  }
  if (n === 9) {
    return `${pcPanel("中古1点ものの番号", `<div class="pc-code-label"><span class="code-number">0123</span>${barcode("0123")}<span class="small muted">商品番号 ＝ 在庫番号</span></div><p class="small muted" style="margin-top:10px">システム内部の識別子は画面へ出しません。</p>`, "half")}${pcPanel("管理方法を選ぶ", pcChoices([["中古（1点もの・標準）", "登録した1点ごとに異なる短い番号"], ["新品（同じ商品を複数）", "現物ごとの在庫番号を分ける"]], 0), "half")}${pcPanel("読取の役割", `<div class="note-box blue">スマホで番号を読むと、商品と保管場所を開きます。読取だけで移動や格納を確定しません。</div>`, "full")}`;
  }
  if (n === 10) {
    return `${pcPanel("ラベルの方法を選ぶ", pcChoices([["手書き（無料・標準）", "はがきサイズのラベルへ手書きします"], ["A4一括印刷（任意）", "登録商品1点につき1枚、最大24面"]], 0), "half")}${pcPanel("A4一括印刷プレビュー（24面）", `${a4Labels()}<div class="pill-row" style="margin-top:9px"><span class="chip green">登録商品 24点</span><span class="chip green">ラベル 24枚</span><span class="chip blue">同じ番号なし</span></div>`, "wide")}${pcPanel("印刷前の確認", `${pcRows([["開始位置", "1番目"], ["対象", "選択した24商品"], ["プリンター", "OSの印刷画面へ手動で渡す"]])}<div class="note-box blue" style="margin-top:9px">印刷ボタンはプリンターを自動操作しません。</div>`, "half")}${pcPanel("再発行の履歴", pcTable(["日時", "理由", "担当"], [["2025/05/15", "印刷前の確認", "デモ 太郎"], ["2025/05/18", "番号の読みやすさ", "デモ 花子"]]), "half")}`;
  }
  if (n === 11) {
    return `${pcPanel("保管場所の構成", `<div class="stack"><div class="choice-card selected"><strong>⌄ 倉庫A</strong><small>⌄ ルーム1　› 棚A-1　› 2段目</small></div><div class="choice-card"><strong>› 倉庫B</strong><small>場所を選択してください</small></div></div>`, "half")}${pcPanel("ルーム・棚・正確な位置の写真", `<div class="split">${art("shelf", "架空のルーム写真")}${art("shelf", "架空の棚写真")}${art("tag", "架空の位置ラベル")}${art("shelf", "架空の場所写真")}</div>`, "wide")}${pcPanel("保管場所の詳細", pcRows([["保管場所", "倉庫A / ルーム1 / 棚A-1 / 2段目"], ["保管場所コード", "A-R1-S1-L2-P2"], ["現在の数量", "12点"], ["空き容量", "18点（60%）", "ok"]]), "full")}`;
  }
  if (n === 12) {
    return `${pcPanel("商品・在庫番号", `<div class="pc-code-label"><span class="code-number">0123</span>${barcode("0123")}<span class="small muted">デモブランド Tシャツ ネイビーM</span></div>`, "half")}${pcPanel("保管場所ラベルの結果", `<div class="number-box" style="font-size:18px">A-R1-S1-L2-P2</div>${art("shelf", "架空の保管場所")}`, "half")}${pcPanel("担当者チェックリスト", pcChecklist(["商品ラベルの番号を確認した", "保管場所コードを確認した", "商品と保管場所が一致している", "商品に破損や欠品がない", "ラベルが読みやすい"]), "half")}${pcPanel("突き合わせ写真", `${art("shelf", "架空の商品と保管場所")}`, "wide")}`;
  }
  if (n === 13) {
    return `${pcPanel("種類ごとの工程", pcChoices([["シャツ", "検品 5 · 写真 5 · 採寸 4"], ["ニット", "毛玉・伸びを追加"], ["アウター", "厚み・付属品を追加"], ["パンツ・スカート", "股上・総丈を追加"], ["ワンピース", "着丈を追加"], ["バッグ", "持ち手・内側を追加"]], 0), "wide")}${pcPanel("決め方", `<div class="note-box blue">種類を選ぶと、必要な項目だけが次の作業へ表示されます。</div>`)}`;
  }
  if (n === 14) {
    return `${pcPanel("検品項目", pcTable(["項目", "状態", "確認方法"], [["状態", '<span class="status ok">問題なしを確認</span>', "目視"], ["使用感", '<span class="status info">確認中</span>', "表面とタグ"], ["汚れ", '<span class="status warn">気になる点あり</span>', "写真マーカー"], ["傷", '<span class="status neutral">未確認</span>', "裏面も確認"], ["ほつれ", '<span class="status neutral">未確認</span>', "種類別"]]), "wide")}${pcPanel("状態の約束", `<div class="note-box amber">未確認を「問題なし」へ自動変更しません。</div>`)}`;
  }
  if (n === 15) {
    return `${pcPanel("写真上の気になる箇所", `<div class="marker-photo" style="min-height:245px">${svgIcon("shirt")}<span class="marker one">1</span><span class="marker two">2</span><span class="marker three">3</span></div>`, "wide")}${pcPanel("選択中：1", pcRows([["場所", "前身頃", "info"], ["種類", "小さな汚れ"], ["程度", "軽い", "warn"], ["証拠写真", "1枚", "ok"], ["メモ", "袖の近く"]]))}${pcPanel("人の確認", `<div class="note-box blue">写真の番号と詳細を照合してから保存します。</div>`)}`;
  }
  if (n === 16) {
    return `${pcPanel("検品まとめ", pcChecklist([["状態", "done"], ["使用感", "done"], ["汚れ", "done"], ["傷", "pending"], ["ほつれ", "pending"]]), "half")}${pcPanel("証拠写真", `<div class="photo-strip">${["shirt", "tag", "package", "tag", "shelf"].map((kind) => art(kind, "架空の証拠写真")).join("")}</div><div class="note-box amber" style="margin-top:10px">未確認が2件あるため、完了ボタンは停止中です。</div>`, "wide")}`;
  }
  if (n === 17) {
    return `${pcPanel("商品ごとの写真", `<p class="small muted">商品 &gt; 0128 &gt; 写真</p><div class="photo-strip" style="margin-top:10px">${["shirt", "shirt", "tag", "tag", "package"].map((kind) => art(kind, "架空の役割別写真")).join("")}</div>`, "wide")}${pcPanel("写真の役割", pcRows([["正面", "原本 · 承認済み", "ok"], ["背面", "編集用コピー", "info"], ["ブランドタグ", "原本 · 確認済み", "ok"], ["品質表示", "原本", "neutral"], ["気になる箇所", "証拠写真", "warn"]]))}${pcPanel("保管の約束", `<div class="note-box blue">原本はPC内の非公開保管。GitHub・Slack・Notionへ自動保存しません。</div>`)}`;
  }
  if (n === 18) {
    return `${pcPanel("役割ごとの編集レシピ", `<div class="pc-steps"><div class="pc-step"><span class="step-num">1</span><strong>ブランド・サイズ確認</strong><small>人が先に確認します。</small></div><div class="pc-step"><span class="step-num">2</span><strong>位置・余白</strong><small>端末内テンプレートを適用。</small></div><div class="pc-step"><span class="step-num">3</span><strong>人が微調整</strong><small>明るさ・白さ・文字。</small></div><div class="pc-step"><span class="step-num">4</span><strong>原本と分離</strong><small>上書きしません。</small></div></div>`, "full")}${pcPanel("進み方を選ぶ", pcChoices([["自作画像編集（準備中）", "将来同じレシピで差し替え"], ["編集用セットを作る", "商品全写真を手動でまとめる"], ["編集せず進む", "原本をそのまま使う"]], 1), "wide")}${pcPanel("無料標準の範囲", `<div class="note-box amber">背景の自動切り抜き・完全白抜き、Photoroom連携は標準に含めません。</div>`)}`;
  }
  if (n === 19) {
    return `${pcPanel("原本と加工後を比べる", `<div class="image-compare"><figure>${art("shirt", "架空の原本") }<figcaption>原本（変更なし）</figcaption></figure><figure>${art("shirt", "架空の加工後") }<figcaption>加工後（確認候補）</figcaption></figure></div>`, "wide")}${pcPanel("役割照合", pcChecklist([["正面", "done"], ["背面", "done"], ["ブランドタグ", "done"], ["品質表示", "done"], ["気になる箇所", "pending"]]))}${pcPanel("人の承認", `<div class="note-box amber">5枚中4枚確認済み。未確認のまま採用しません。</div>`)}`;
  }
  if (n === 20) {
    return `${pcPanel("種類別の採寸項目", pcTable(["項目", "単位", "前回値", "今回候補", "写真"], [["肩幅", "cm", "40.5", "41.0", "あり"], ["身幅（平置き）", "cm", "49.0", "52.0", "あり"], ["着丈", "cm", "66.0", "67.0", "あり"], ["袖丈", "cm", "—", "未入力", "なし"]]), "wide")}${pcPanel("測る線", `${art("shirt", "架空の採寸ガイド")}<div class="note-box blue" style="margin-top:9px">胴囲（周囲）と平置きの身幅を混同しません。</div>`)}`;
  }
  if (n === 21) {
    return `${pcPanel("タグ写真", `<div class="split">${art("tag", "架空のブランドタグ")}${art("tag", "架空の品質表示")}</div>`, "half")}${pcPanel("読み取り候補", pcRows([["ブランド", "デモブランド", "info"], ["サイズ", "M", "info"], ["色", "ネイビー", "info"], ["素材", "綿 100%", "warn"]]), "half")}${pcPanel("確認の注意", `<div class="note-box blue">文字でないブランドマークは、画像からの候補または手入力です。</div>`, "full")}`;
  }
  if (n === 22) {
    return `${pcPanel("検品", pcChecklist([["状態", "done"], ["使用感", "done"], ["気になる箇所", "done"]]), "half")}${pcPanel("写真", pcRows([["必要枚数", "5枚 / 5枚", "ok"], ["原本", "非公開保管", "info"], ["承認", "4 / 5", "warn"]]), "half")}${pcPanel("採寸とタグ", pcRows([["採寸", "3 / 4項目", "warn"], ["タグ", "4候補・人確認", "info"], ["不足", "袖丈", "warn"]]), "half")}${pcPanel("次の候補", `<div class="note-box blue">不足を確認してから商品説明の候補を作ります。</div>`, "half")}`;
  }
  if (n === 23) {
    return `${pcPanel("候補・人が確認", `<div class="note-box blue">デモブランドの半袖シャツ。ネイビー、サイズM。平置きで身幅52cm。</div><div class="fake-input" style="margin-top:10px">候補文を人が編集できます</div>`, "wide")}${pcPanel("根拠", pcChecklist([["検品メモ", "done"], ["役割別写真", "done"], ["タグ候補", "done"], ["袖丈", "pending"]]))}${pcPanel("未確認", `<div class="note-box amber">袖丈は未入力。候補文へ確定値として入れていません。</div>`)}`;
  }
  if (n === 24) {
    return `${pcPanel("本人操作へ渡すもの", pcChecklist([["写真を手動ダウンロード", "done"], ["文章をコピー", "done"], ["公式画面を本人が開く", "pending"], ["公開後の情報を1回登録", "pending"]]), "half")}${pcPanel("公開後に記録する項目", pcRows([["販売先", "未入力", "warn"], ["商品ID", "未入力", "warn"], ["商品URL", "未入力", "warn"], ["最終確認日", "未入力", "warn"]]), "half")}${pcPanel("安全境界", `<div class="note-box blue">自動出品、価格変更、返信、URL取得は行いません。本人が公式画面で操作します。</div>`, "full")}`;
  }
  if (n === 25) {
    return `${pcPanel("表示方法", `<div class="tab-row"><button class="active" type="button" data-static="一覧表示を確認しています">一覧表示</button><button type="button" data-static="ギャラリー表示を確認しています">ギャラリー表示</button></div>`, "full")}${pcPanel("保存した商品ページ", pcTable(["写真", "商品番号", "販売先", "価格", "最終確認日", "状態"], [[art("shirt", "架空の商品写真"), "0128", "販売先A", "¥8,000", "2025/05/18", '<span class="status warn">確認待ち</span>'], [art("package", "架空の商品写真"), "0133", "販売先B", "¥5,500", "2025/05/15", '<span class="status info">掲載中</span>']]), "wide")}${pcPanel("自動取得なし", `<div class="note-box blue">リンク先をアプリが自動で読み取りません。本人が開いて確認します。</div>`)}`;
  }
  if (n === 26) {
    return `${pcPanel("今日確認する商品", `<div class="note-box amber">未確認期間が長い順に並べています。値は本人が公式画面から入力します。</div>${pcRows([["0128 · デモシャツ", "8日未確認", "warn"], ["0133 · デモバッグ", "5日未確認", "warn"], ["0045 · デモ時計", "今日確認済み", "ok"]])}`, "wide")}${pcPanel("販売状況（架空入力）", pcRows([["出品日数", "14日"], ["現在価格", "¥8,000", "info"], ["閲覧・検索", "120 / 36"], ["いいね", "8"], ["値下げ依頼", "1件", "warn"], ["確認日", "2025/05/18"]]))}${pcPanel("入力方法", pcChoices([["数字を直接入力", "公式ページを本人が開いて入力"], ["スクリーンショットから候補", "原画像と比較して人が確定"]], 0), "full")}`;
  }
  if (n === 27) {
    return `${pcPanel("根拠", pcRows([["自分の販売履歴", "直近30日 · 8件"], ["原価・手数料・送料", "架空の入力値"], ["公開情報", "季節・行事 · 2025/05/18確認"]]), "half")}${pcPanel("候補を比較", pcTable(["変更", "変更後価格", "見込み粗利", "下限との関係"], [["5%", "¥7,600", "¥3,950", '<span class="status ok">下限以上</span>'], ["10%", "¥7,200", "¥3,590", '<span class="status ok">下限以上</span>'], ["15%", "¥6,800", "¥3,230", '<span class="status warn">下限に近い</span>']]), "wide")}${pcPanel("決め方", `<div class="note-box amber">どれかを常に正解にしません。最終操作は公式画面で本人が行います。</div>`, "full")}`;
  }
  if (n === 28) {
    return `${pcPanel("返信文の候補", `<div class="fake-input" style="min-height:100px;align-items:flex-start">お問い合わせありがとうございます。商品状態をご確認いただき、よろしければご検討ください。</div><div class="action-row">${button("文章をコピー", "secondary-button", 'data-copy-text="お問い合わせありがとうございます。商品状態をご確認いただき、よろしければご検討ください。"')}</div>`, "wide")}${pcPanel("本人操作の確認", pcChecklist([["文章を本人が編集", "pending"], ["公式画面へ本人が移動", "pending"], ["反映結果を確認", "pending"]]))}${pcPanel("自動操作なし", `<div class="note-box blue">自動返信・自動値下げ・自動セールは行いません。</div>`)}`;
  }
  if (n === 29) {
    return `${pcPanel("仮注文番号", `<div class="number-box" style="font-size:24px">#0048（自動で付きます）</div><p class="small muted" style="margin-top:8px">利用者へ番号入力を求めません。</p>`, "full")}${pcPanel("注文の情報", `${mobileField("販売先（必須）", "選択してください")}${mobileField("取引ID（任意・あとで入力できます）", "未入力でも進められます")}${mobileField("購入者の表示名（任意）", "入力しない")}${mobileField("販売金額（必須）", "¥0 · あとで確認")}`, "wide")}${pcPanel("安全境界", `<div class="note-box blue">匿名配送で住所が不要な場合、住所は保存しません。未入力でも取り出しへ進めます。</div>`)}`;
  }
  if (n === 30) {
    return `${pcPanel("商品ラベル", `<div class="pc-code-label"><span class="code-number">0123</span>${barcode("0123")}<span class="small muted">デモブランド Tシャツ</span></div>`, "half")}${pcPanel("置き場所ラベル", `<div class="number-box" style="font-size:20px">棚A-03-2</div>${art("shelf", "架空の保管場所写真")}`, "half")}${pcPanel("照合結果", `<div class="status ok" style="font-size:13px">✓ 一致しました</div><p class="small muted" style="margin-top:9px">商品ラベルと置き場所ラベルが一致しています。</p>`, "half")}${pcPanel("作業のポイント", `<div class="note-box blue">商品ラベルと場所ラベルを確認し、正しい商品を取り出してください。</div>`, "half")}`;
  }
  if (n === 31) {
    return `${pcPanel("発送前写真の設定", `<div class="row-line"><strong>高額の目安</strong><span class="status info">¥30,000（架空）</span></div>${pcChoices([["高額商品だけ撮る（おすすめ）", "目安以上の注文だけ表示"], ["すべて撮る", "すべての注文で撮影"], ["使わない", "この工程を表示しない"]], 0)}`, "full")}${pcPanel("今回の注文", `<div class="note-box amber">販売金額が未入力でも梱包を止めません。今回は撮る／使わないを人が選びます。</div>${pcRows([["商品写真", "架空の商品", "info"], ["梱包写真", "未撮影", "warn"], ["確認", "人が行う", "neutral"]])}`, "half")}${pcPanel("写真の目的", `<div class="note-box blue">すり替えや内容違いの確認資料です。写真だけで発送を自動確定しません。</div>`, "half")}`;
  }
  if (n === 32) {
    return `${pcPanel("配送方法（販売先別）", pcTable(["選択", "配送方法", "送料", "公式確認日"], [['○', "配送方法A", "¥600", "2025/05/18"], ['●', "配送方法B", "¥450", "2025/05/10"], ['○', "配送方法C", "¥300", "2025/04/28"]]), "wide")}${pcPanel("発送情報", pcRows([["選んだ送料", "¥450（注文に固定）", "info"], ["発送予定日", "2025/05/21"], ["発送日時", "2025/05/20 15:20"]]))}${pcPanel("手動入力・編集可能", `<div class="note-box blue">送料カタログは本人が更新します。外部サービスから自動取得しません。</div>`, "full")}`;
  }
  if (n === 33) {
    return `${pcPanel("保管場所の構成", `<div class="stack"><div class="choice-card selected"><strong>⌄ 倉庫A</strong><small>⌄ ルーム1　› 棚A-1　› 2段目</small></div><div class="choice-card"><strong>› 倉庫B</strong><small>別の場所</small></div></div>`, "half")}${pcPanel("写真と在庫", `<div class="split">${art("shelf", "架空のルーム写真")}${art("tag", "架空の位置写真")}</div>${pcRows([["在庫番号", "0123", "info"], ["担当", "デモ 花子"], ["容量", "18 / 30点", "ok"]])}`, "wide")}${pcPanel("移動履歴", `<div class="timeline"><div class="timeline-item"><strong>2025/05/18 · 棚A-1へ格納</strong><small>デモ 太郎 · 人が確認</small></div><div class="timeline-item"><strong>2025/05/10 · 登録</strong><small>デモ 花子 · 架空表示</small></div></div>`)}`;
  }
  if (n === 34) {
    return `${pcPanel("棚卸しの開始", pcRows([["開始時点", "12点を固定", "info"], ["対象場所", "倉庫A / 棚A-1"], ["確認済み", "8点", "ok"], ["残り", "4点", "warn"]]), "half")}${pcPanel("進捗", `<div class="progress-line"><span style="width:67%"></span></div><p class="small muted" style="margin-top:9px">8 / 12点 · 67%</p>${art("shelf", "架空の棚写真")}`, "half")}${pcPanel("通信がない場合", `<div class="note-box amber">送信待ちでも、撮影・確認の作業は消しません。</div>`, "full")}`;
  }
  if (n === 35) {
    return `${pcPanel("差異の種類", `<div class="tab-row"><button class="active" type="button" data-static="見つからない商品を表示">見つからない</button><button type="button" data-static="別の棚を表示">別の棚</button><button type="button" data-static="予定外の商品を表示">予定外に発見</button></div><div class="stack" style="margin-top:10px">${pcRows([["0123 · デモシャツ", "再読取が必要", "warn"], ["0133 · デモバッグ", "写真待ち", "warn"]])}</div>`, "wide")}${pcPanel("自動修正しない", `<div class="note-box amber">差異だけで現在地・数量を自動変更しません。商品、場所、証拠を人が確認します。</div>`)}`;
  }
  if (n === 36) {
    return `${pcPanel("1人運用", `<div class="note-box blue">現物ラベル、場所ラベル、証拠写真、理由、最終確認がそろえば、削除せず仮状態へ変更できます。</div>${pcRows([["状態", "missing_candidate", "warn"], ["復元", "発見時に履歴付きで戻す", "ok"]])}`, "half")}${pcPanel("複数人運用", `<div class="note-box">重要な確定は別担当の確認を残します。不可逆な廃棄確定はP0対象外です。</div>${pcChecklist([["担当者の再読取", "done"], ["承認者の確認", "pending"]])}`, "half")}${pcPanel("返品", `<div class="note-box amber">返品は別場所で隔離し、再販可否を人が確認します。削除ボタンはありません。</div>`, "full")}`;
  }
  if (n === 37) {
    return `${pcPanel("メンバー", pcTable(["名前", "役割", "状態", "最終サインイン"], [["デモ 太郎", "オーナー", '<span class="status ok">利用中</span>', "今日"], ["デモ 花子", "検品・撮影", '<span class="status ok">利用中</span>', "昨日"], ["デモ 健太", "発送", '<span class="status neutral">招待中</span>', "—"]]), "wide")}${pcPanel("権限の操作", `<div class="note-box blue">招待・停止は人が内容を確認して行います。</div>`)}`;
  }
  if (n === 38) {
    return `${pcPanel("担当の対象", pcChoices([["商品", "0128 · デモシャツ"], ["保管場所", "棚A-1 · 2段目"], ["写真", "正面・タグ"], ["注文", "仮 #0048"]], 0), "wide")}${pcPanel("期限と見せる情報", pcRows([["期間", "2025/05/18〜05/20"], ["見せる情報", "商品・場所・写真", "info"], ["隠す情報", "原価・住所・口座", "ok"]]))}${pcPanel("最小限の担当", `<div class="note-box blue">担当者に必要な情報だけを許可します。</div>`)}`;
  }
  if (n === 39) {
    return `${pcPanel("変更前 / 変更後", pcRows([["場所", "棚A-1 → 棚B-2"], ["状態", "確認中 → 仮状態", "warn"], ["理由", "再読取と写真"], ["申請者", "デモ 花子"]]), "half")}${pcPanel("証拠", `${art("shelf", "架空の証拠写真")}<div class="note-box blue" style="margin-top:9px">申請と証拠を人が確認します。</div>`, "half")}${pcPanel("判断", `<div class="action-row">${button("承認", "primary-button", 'data-static="承認候補を確認しました"')}${button("差し戻す", "secondary-button", 'data-static="差し戻し候補を確認しました"')}${button("コメント", "ghost-button", 'data-static="コメントは保存されません"')}</div>`, "full")}`;
  }
  if (n === 40) {
    return `${pcPanel("変更履歴（削除不可）", `<div class="timeline">${["デモ 花子 · 2025/05/18 · 棚卸し開始", "デモ 太郎 · 2025/05/18 · 場所確認", "デモ 花子 · 2025/05/17 · 写真追加", "デモ 太郎 · 2025/05/15 · 商品登録"].map((item) => `<div class="timeline-item"><strong>${item}</strong><small>変更前と変更後、理由、確認状態を保持</small></div>`).join("")}</div>`, "wide")}${pcPanel("書き出し", `<div class="note-box blue">履歴を確認してから、人がファイルを書き出します。</div>`)}`;
  }
  if (n === 41) {
    return `${pcPanel("箱の見込み（見込み）", `<div class="pc-number-list">${pcMetric("実数", "48着")}${pcMetric("販売候補", "39着")}${pcMetric("見込売上", "¥138,000〜169,000")}${pcMetric("仕入額", "¥75,000")}${pcMetric("見込費用", "¥32,000〜41,000")}${pcMetric("見込粗利", "¥31,000〜53,000")}${pcMetric("損益分岐", "24着")}</div>`, "full")}${pcPanel("見込みの読み方", `<div class="note-box amber">見込みは確定利益・税額ではありません。販売後の実績と分けて見ます。</div>`, "half")}`;
  }
  if (n === 42) {
    return `${pcPanel("販売後の実績", `<div class="pc-number-list">${pcMetric("販売済み", "31 / 48着")}${pcMetric("実売上", "¥124,000")}${pcMetric("実費用", "¥29,600")}${pcMetric("仕入額", "¥75,000")}${pcMetric("実粗利", "¥19,400")}${pcMetric("未販売", "17着")}</div>`, "full")}${pcPanel("見込みとの差", `<div class="note-box blue">見込みと実績を同じ数字に混ぜず、理由を人が確認します。</div>`, "half")}`;
  }
  if (n === 43) {
    return `${pcPanel("月別KPI", `<div class="pc-alert-grid"><div class="pc-alert ok"><strong>64%</strong><small>30日販売率</small></div><div class="pc-alert"><strong>¥138,000</strong><small>月別売上見込</small></div><div class="pc-alert"><strong>¥31,000</strong><small>月別粗利見込</small></div><div class="pc-alert warn"><strong>17着</strong><small>残り在庫</small></div></div>`, "full")}${pcPanel("期間", `<div class="fake-input"><strong>2025年5月</strong><span>対象月を選ぶ ▾</span></div><div class="progress-line" style="margin-top:12px"><span style="width:64%"></span></div><p class="small muted" style="margin-top:7px">運用指標です。会計上の利益・税額ではありません。</p>`, "half")}`;
  }
  if (n === 44) {
    return `${pcPanel("仕入先・在庫の比較", pcTable(["仕入先", "母数", "観測期間", "欠損", "在庫日数"], [["デモ仕入先A", "48点", "30日", "送料 2件", "41日"], ["デモ仕入先B", "22点", "30日", "原価 1件", "27日"]]), "wide")}${pcPanel("読み方", `<div class="note-box amber">継続・停止はアプリが自動判断しません。欠損データを確認して人が決めます。</div>`)}`;
  }
  if (n === 45) {
    return `${pcPanel("売上の事実", pcRows([["売上", "¥124,000", "info"], ["返金", "¥0"], ["販売手数料", "¥12,400"], ["送料", "¥17,200"], ["仕入れ代", "¥75,000"]]), "half")}${pcPanel("根拠と確認状態", pcTable(["項目", "根拠", "確認"], [["売上", "本人の販売記録", '<span class="status ok">確認済み</span>'], ["送料", "注文の発送記録", '<span class="status info">確認済み</span>'], ["仕入れ代", "仕入れ資料", '<span class="status warn">候補</span>']]), "wide")}${pcPanel("税務判断ではありません", `<div class="note-box blue">売上の事実を分けて記録します。会計上の利益・所得・税額はここで決めません。</div>`, "full")}`;
  }
  if (n === 46) {
    return `${pcPanel("人が決める会計の前提", `${pcRows([["申告方式", "未設定", "warn"], ["消費税の扱い", "未設定", "warn"], ["記帳方式", "未設定", "warn"], ["インボイス登録", "未設定", "warn"]])}`, "wide")}${pcPanel("用語ヘルプ", `<div class="note-box blue"><span class="help-mark">?</span> 申告方式・消費税・記帳方式は、本人または専門家が確認する設定です。アプリは推測しません。</div>`)}`;
  }
  if (n === 47) {
    return `${pcPanel("承認済みルールによる候補", pcTable(["取引", "借方候補", "貸方候補", "状態"], [["仕入", "仕入高", "未払金", '<span class="status ok">7 / 7確認</span>'], ["送料", "荷造運賃", "未払金", '<span class="status ok">確認済み</span>'], ["販売手数料", "支払手数料", "売上", '<span class="status info">候補</span>'], ["不明な取引", "—", "—", '<span class="status stop">停止</span>']]), "wide")}${pcPanel("採用・変更", `<div class="note-box amber">低確信・未対応・税設定未完了の候補が1件でもあれば、ファイル作成を停止します。</div>`)}`;
  }
  if (n === 48) {
    return `${pcPanel("作成前チェック", pcChecklist([["会計設定", "pending"], ["項目候補", "done"], ["重複チェック", "done"], ["先頭行プレビュー", "done"]]), "half")}${pcPanel("形式と履歴", `<div class="pill-row"><span class="chip blue">Money Forward向け</span><span class="chip">汎用</span></div>${pcRows([["最終作成", "未作成", "warn"], ["手動ダウンロード", "人が確認", "info"], ["取込結果", "未入力"], ["置換・取消", "履歴あり"]])}`, "half")}${pcPanel("外部送信なし", `<div class="note-box red">税設定未完了のため、架空CSVも作成しません。確認がそろった後も手動ダウンロードだけです。</div>`, "full")}`;
  }
  if (n === 49) {
    return `${pcPanel("事業所と表示", `${mobileField("事業所名", "デモ物販事業所")}${mobileField("表示", "日本語・明るい表示")}`, "half")}${pcPanel("通知と工程", pcChecklist([["要確認の通知", "done"], ["検品", "done"], ["撮影", "done"], ["採寸", "done"], ["発送前写真", "pending"]]), "half")}${pcPanel("販売先別の設定", pcRows([["販売先A", "配送方法A・B", "info"], ["販売先B", "配送方法B", "info"], ["送料の確認日", "2025/05/18"]]), "full")}`;
  }
  if (n === 50) {
    return `${pcPanel("保存先の場所", `<div class="choice-grid"><div class="choice-card selected"><strong>このPC内に保存</strong><small>商品写真を非公開で保管します。</small></div><div class="choice-card"><strong>他の場所に保存</strong><small>本人が保存先を選びます。</small></div></div><div class="action-row">${button("保存先を選ぶ", "secondary-button", 'data-static="保存先の選択は確認用です"')} ${button("保存先を確認", "ghost-button", 'data-static="保存先を確認します"')}</div>`, "wide")}${pcPanel("写真の保管経路", `<div class="pc-steps"><div class="pc-step"><span class="step-num">1</span><strong>端末で撮影</strong><small>原本を作る</small></div><div class="pc-step"><span class="step-num">2</span><strong>PC内へ受信</strong><small>非公開保管</small></div><div class="pc-step"><span class="step-num">3</span><strong>編集用コピー</strong><small>原本を上書きしない</small></div><div class="pc-step"><span class="step-num">4</span><strong>加工後・一覧</strong><small>役割別に分ける</small></div></div>`, "full")}${pcPanel("外部保存", `<div class="note-box blue">GitHub・Slack・Notion・公開URLへ自動保存しません。</div>`)}`;
  }
  if (n === 51) {
    return `${pcPanel("データを書き出す", `<p class="small muted">現在のデータをファイルに書き出します。</p><div class="pill-row"><span class="chip blue">CSV</span><span class="chip">JSON</span></div><div class="action-row">${button("CSVで保存", "primary-button", 'data-static="CSV保存は確認用です"')}</div>`, "half")}${pcPanel("バックアップを作る", `<p class="small muted">データのバックアップファイルを作成します。</p><div class="pill-row"><span class="chip">CSV</span><span class="chip blue">JSON</span></div><div class="action-row">${button("バックアップを作成", "secondary-button", 'data-static="バックアップ作成は確認用です"')}</div>`, "half")}${pcPanel("書き出し先と履歴", pcRows([["保存先", "本人が選ぶPC内フォルダー"], ["作成日", "未作成", "warn"], ["内容", "件数・役割を確認", "info"], ["復元確認", "人が行う", "neutral"]]), "wide")}${pcPanel("自動同期なし", `<div class="note-box blue">外部クラウドへ自動送信せず、手動の書き出しだけを行います。</div>`, "full")}`;
  }
  if (n === 52) {
    return `${pcPanel("P0の状態", `<div class="pc-alert ok"><span class="pc-alert-icon">✓</span><strong>外部連携なし・無料</strong><small>このレビュー版は外部サービスへ接続しません。</small></div>`, "wide")}${pcPanel("任意機能（準備中）", pcRows([["販売サイト", "準備中", "neutral"], ["写真編集ソフト", "準備中", "neutral"], ["Notion", "準備中", "neutral"], ["会計サービス", "準備中", "neutral"]]), "half")}${pcPanel("接続しない約束", `<div class="note-box blue"><span class="help-mark">?</span> 契約・費用・権限・商用利用を人が確認するまで接続しません。</div><div class="note-box amber" style="margin-top:9px">♢　<b>許可なく外部へ接続しません</b></div>`, "half")}`;
  }
  return `${pcPanel(screen.name, `<p class="small muted">${escapeHtml(screen.purpose)}</p>${pcRows([["状態", "確認用", "info"], ["担当", "デモ担当A"], ["入力", "保存されません", "neutral"]])}`, "wide")}`;
}

function pcNavActive(screen) {
  if (screen.number >= 49) return "設定";
  if (screen.number >= 45) return "会計";
  if (screen.number >= 37 && screen.number <= 40) return "メンバー";
  if (screen.number >= 33 && screen.number <= 36) return "在庫";
  if (screen.number >= 29 && screen.number <= 32) return "注文・発送";
  if (screen.number >= 5 && screen.number <= 8) return "仕入れ";
  if (screen.number >= 9 && screen.number <= 28) return "商品";
  if (screen.number === 3) return "作業";
  return "ホーム";
}

function pcSidebar(screen) {
  const active = pcNavActive(screen);
  return `<aside class="pc-sidebar"><div class="pc-brand"><span class="pc-brand-mark">R</span><span><strong>Resale Ops</strong><small>公開レビュー版</small></span></div><nav class="pc-nav" aria-label="PC版の左ナビ">${PC_NAV.map(([label, icon, target]) => `<button type="button" class="${label === active ? "active" : ""}" data-screen="${target}"><span class="pc-nav-icon" aria-hidden="true">${icon}</span>${label}</button>`).join("")}</nav><div class="pc-safe"><strong>確認用・架空データ</strong>保存、外部送信、出品、会計確定は行いません。</div></aside>`;
}

function pcScreenHtml(screen) {
  const prev = screen.number === 1 ? "p-52" : `p-${String(screen.number - 1).padStart(2, "0")}`;
  const next = screen.number === 52 ? "p-01" : `p-${String(screen.number + 1).padStart(2, "0")}`;
  const primaryAction = screen.primary ? `<button class="primary-button" type="button" data-screen="${next}">${escapeHtml(screen.primary)}</button>` : "";
  return `<div class="desktop-app">${pcSidebar(screen)}<section class="pc-main"><header class="pc-topbar"><button class="hamburger" type="button" data-static="左ナビは確認用に表示しています" aria-label="左ナビ">☰</button><div class="pc-search" aria-label="検索（確認用）">⌕　商品名・作業・注文を検索</div><span class="pc-top-spacer"></span><button class="pc-top-action" type="button" data-static="通知は確認用です" aria-label="通知">♧</button><button class="pc-top-action" type="button" data-static="ヘルプは確認用です" aria-label="ヘルプ">?</button><div class="pc-avatar"><span class="pc-avatar-mark">デ</span><span>デモ 太郎⌄</span></div></header><main class="pc-page"><div class="pc-heading"><div class="pc-title-wrap"><span class="pc-screen-number">${screen.code}</span><div><h1>${escapeHtml(screen.name)}</h1><p>${escapeHtml(screen.purpose)}</p></div></div><span class="pc-board-tag">PC版 · 画面 ${screen.code} / ${PC_SCREENS.length}</span></div><div class="pc-content-grid">${pcBody(screen)}</div><div class="pc-primary-bar"><button class="ghost-button" type="button" data-screen="${prev}">‹ 前の画面</button>${primaryAction}</div></main></section></div>`;
}

function populateSelect() {
  const select = document.querySelector("#screen-select");
  if (!select) return;
  if (mode === "mobile") {
    select.innerHTML = `<optgroup label="スマホ版 · 基本49画面">${MOBILE_SCREENS.map((screen) => `<option value="${screen.id}">${screen.code}　${escapeHtml(screen.name)}</option>`).join("")}</optgroup><optgroup label="追加フロー · 26画面">${MOBILE_ADDITIONAL_SCREENS.map((screen) => `<option value="${screen.id}">${screen.code}　${escapeHtml(screen.name)}</option>`).join("")}</optgroup>`;
  } else {
    select.innerHTML = `<optgroup label="PC版 · 52画面">${PC_SCREENS.map((screen) => `<option value="${screen.id}">${screen.code}　${escapeHtml(screen.name)}</option>`).join("")}</optgroup>`;
  }
  select.value = activeId;
}

function updateToolbar() {
  document.querySelectorAll("[data-mode-button]").forEach((buttonEl) => {
    const active = buttonEl.dataset.modeButton === mode;
    buttonEl.classList.toggle("active", active);
    buttonEl.setAttribute("aria-pressed", String(active));
  });
}

function render() {
  const current = findScreen(activeId);
  if ((mode === "mobile" && !isMobileScreen(current)) || (mode === "pc" && !current.id.startsWith("p-"))) {
    activeId = mode === "mobile" ? "m-04" : "p-02";
  }
  const screen = findScreen(activeId);
  document.body.dataset.mode = mode;
  document.querySelector("#mobile-preview").innerHTML = mobileScreenHtml(mode === "mobile" ? screen : MOBILE_SCREENS[3]);
  document.querySelector("#pc-preview").innerHTML = pcScreenHtml(mode === "pc" ? screen : PC_SCREENS[1]);
  populateSelect();
  updateToolbar();
  document.title = `${screen.code} ${screen.name} — Resale Ops UIレビュー`;
  void current;
}

function showToast(message) {
  const toast = document.querySelector("#review-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function moveTo(id) {
  const candidate = findScreen(id);
  if (mode === "mobile" && !isMobileScreen(candidate)) return;
  if (mode === "pc" && !candidate.id.startsWith("p-")) return;
  activeId = candidate.id;
  render();
  document.querySelector("#preview-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setMode(nextMode) {
  if (nextMode !== "mobile" && nextMode !== "pc") return;
  mode = nextMode;
  activeId = mode === "mobile" ? "m-04" : "p-02";
  render();
  showToast(mode === "mobile" ? "スマホ版75画面（基本49＋追加26）を表示しています。" : "PC版52画面を表示しています。");
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast("確認用の文章をコピーしました。外部へ自動送信していません。");
  } catch {
    showToast("コピーできませんでした。画面の文章を手動で確認してください。");
  }
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.modeButton) {
    setMode(target.dataset.modeButton);
    return;
  }
  if (target.dataset.screen) {
    moveTo(target.dataset.screen);
    return;
  }
  if (target.dataset.copyText) {
    void copyText(target.dataset.copyText);
    return;
  }
  if (target.dataset.static) {
    showToast(`${target.dataset.static}。このページの操作は保存されません。`);
  }
});

document.querySelector("#screen-select")?.addEventListener("change", (event) => moveTo(event.target.value));
document.querySelector("#preview-only")?.addEventListener("click", () => {
  document.querySelector("#review-toolbar")?.classList.add("is-hidden");
  const reopen = document.querySelector("#review-reopen");
  if (reopen) reopen.hidden = false;
  showToast("プレビューのみで表示しています。右上からレビュー設定を戻せます。");
});
document.querySelector("#review-reopen")?.addEventListener("click", () => {
  document.querySelector("#review-toolbar")?.classList.remove("is-hidden");
  document.querySelector("#review-reopen").hidden = true;
});

window.addEventListener("load", () => {
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  }
}, { once: true });
