"use client";

import styles from "./approved-pc-demo.module.css";
import { ApprovedPcEarlyScreens } from "./approved-pc-early-screens";
import { ApprovedPcMiddleScreens } from "./approved-pc-middle-screens";
import { ApprovedPcLateScreens } from "./approved-pc-late-screens";

type Screen = {
  number: number;
  title: string;
  eyebrow: string;
  description: string;
  primary: string;
  facts: readonly (readonly [string, string, "ok" | "review" | "plain"])[];
  detail: string;
};

type Fact = readonly [string, string, "ok" | "review" | "plain"];

type ScreenRow = readonly [
  title: string,
  description: string,
  primary: string,
  firstFact: Fact,
  secondFact: Fact,
  thirdFact: Fact,
  fourthFact: Fact,
  detail: string,
];

const screenRows: readonly ScreenRow[] = [
  [
    "ログイン",
    "メールアドレスとパスワードで、安全に業務データへ入ります。",
    "ログイン",
    ["メールアドレス", "operator@example.test", "plain"],
    ["パスワード", "••••••••", "plain"],
    ["このPC", "確認済み", "ok"],
    ["外部接続", "0件", "plain"],
    "カメラ枠と衣類を組み合わせた、架空のサービスマーク。",
  ],
  [
    "ホーム",
    "今日確認することと、次に進める商品をまとめます。",
    "未解決を確認",
    ["今日の確認", "4件", "review"],
    ["続きの作業", "6件", "plain"],
    ["在庫中", "128点", "ok"],
    ["売上の事実", "今月 ¥124,000", "plain"],
    "原価未確認、送料未確認、90日超在庫、承認待ちを先に表示します。",
  ],
  [
    "今日の作業",
    "担当・期限・残りを見て、一件ずつ開きます。",
    "この作業を開く",
    ["検品", "0128 / 残り3項目", "review"],
    ["撮影", "0127 / 今日中", "plain"],
    ["格納", "0126 / 場所確認", "plain"],
    ["発送", "#0048 / 15:00まで", "ok"],
    "左に作業一覧、右に選んだ商品の次の操作を置く作業台です。",
  ],
  [
    "通知・見られる範囲",
    "役割により必要な情報だけを見せます。",
    "送信待ちを確認",
    ["見られる場所", "洋室A・棚02", "ok"],
    ["見られない情報", "原価・住所", "plain"],
    ["送信待ち", "1件", "review"],
    ["接続", "オフラインでも下書き可", "plain"],
    "利用できない操作には理由を添え、作業者を迷わせません。",
  ],
  [
    "仕入れ資料",
    "請求書やレシートを選び、原本と候補を人が比べます。",
    "内容を確認して保存",
    ["請求書ファイル", "PDFを選ぶ", "plain"],
    ["店舗レシート", "画像を選ぶ", "plain"],
    ["読み取った候補", "3行・要確認", "review"],
    ["原本", "PC内の非公開保管", "ok"],
    "PCのカメラは使いません。PCに表示されるフォルダーから本人が選びます。",
  ],
  [
    "卸箱を数える",
    "入数は不明から始め、数えた履歴を残します。",
    "数え終わった",
    ["数えた数", "38点", "plain"],
    ["まだ不明", "10点", "review"],
    ["＋1", "大きなカウンター", "ok"],
    ["取消", "直前の1回だけ", "plain"],
    "合計を最初から入れず、箱を開けて実数を数える画面です。",
  ],
  [
    "1点ずつ簡単登録",
    "写真と短い番号で、まず全商品を登録します。",
    "保存して次の商品",
    ["商品番号", "0128", "ok"],
    ["スマホから届いた写真", "3件受信", "plain"],
    ["販売可否", "要確認", "review"],
    ["予想価格（人が確認）", "¥8,000", "plain"],
    "販売価格を調べる欄では、検索語を整え、本人が検索または質問文コピーを選びます。",
  ],
  [
    "詳しく調べる商品",
    "高値候補・要確認だけを、2周目で詳しく確認します。",
    "詳しく調べる",
    ["高値候補", "4点", "review"],
    ["要確認", "6点", "review"],
    ["簡単登録完了", "38点", "ok"],
    ["優先", "状態と価格帯", "plain"],
    "通常の商品を止めず、必要な商品だけ詳しい調査へ送ります。",
  ],
  [
    "中古は商品番号＝在庫番号",
    "中古1点ものは、ひとつの短い番号で管理します。",
    "在庫番号を発行",
    ["中古（1点もの・標準）", "選択中", "ok"],
    ["商品・在庫番号", "0123", "plain"],
    ["バーコード", "スマホで商品を探す", "plain"],
    ["新品（同じ商品を複数）", "現物ごとに分ける", "plain"],
    "番号の下にバーコードを置き、読取で商品と保管場所を開けます。",
  ],
  [
    "在庫ラベル",
    "登録商品を、1商品1枚のA4 24面へ並べます。",
    "登録した24商品を1枚ずつ印刷",
    ["登録商品", "24点", "ok"],
    ["ラベル", "24枚", "ok"],
    ["同じ番号", "なし", "ok"],
    ["手書き", "無料・標準", "plain"],
    "印刷は任意です。全ラベルに異なる番号と個別バーコードを表示します。",
  ],
  [
    "保管場所を選ぶ",
    "部屋、棚、段、箱、写真を見て、置く場所を選びます。",
    "この場所にする",
    ["部屋", "洋室A", "plain"],
    ["棚・段・箱", "棚02・段3・箱3", "ok"],
    ["場所写真", "3枚確認済み", "ok"],
    ["容量", "12 / 20点", "plain"],
    "場所ツリーは左、写真と容量は右に並べ、選択した場所を確かめます。",
  ],
  [
    "格納を確認",
    "商品と保管場所を照合し、人が確認してから保存します。",
    "この場所に格納",
    ["商品・在庫番号", "0123", "ok"],
    ["保管場所", "洋室A・棚02・段3", "ok"],
    ["バーコード読取", "商品検索だけ", "plain"],
    ["人の確認", "必要", "review"],
    "読取だけで在庫移動を確定しません。内容を確認してから格納します。",
  ],
  [
    "商品の種類",
    "種類に合わせて、検品・撮影・採寸の項目を変えます。",
    "この種類で進む",
    ["シャツ", "標準項目", "plain"],
    ["ニット", "毛羽立ちを確認", "plain"],
    ["アウター", "裏地を確認", "plain"],
    ["バッグ", "角・内側を確認", "plain"],
    "カードから種類を選ぶと、次に確認すべき項目を絞り込みます。",
  ],
  [
    "検品項目",
    "未確認を問題なしにせず、ひとつずつ確認します。",
    "次の項目へ",
    ["状態", "問題なしを確認", "ok"],
    ["使用感", "未確認", "review"],
    ["汚れ", "気になる点あり", "review"],
    ["ほつれ", "未確認", "review"],
    "各行で、未確認・問題なし・気になる点ありを明確に分けます。",
  ],
  [
    "気になる箇所",
    "写真上の番号と証拠を結び、状態を記録します。",
    "この内容を保存",
    ["場所", "左袖口", "plain"],
    ["種類", "薄い汚れ", "review"],
    ["程度", "軽い", "plain"],
    ["証拠写真", "1枚", "ok"],
    "左の衣類図で番号を選び、右の詳細とメモを確認します。",
  ],
  [
    "検品まとめ",
    "確認済みと未確認をまとめ、未確認を残したまま完了にしません。",
    "検品を完了",
    ["確認済み", "8項目", "ok"],
    ["気になる点", "1件", "review"],
    ["未確認", "0件", "ok"],
    ["証拠写真", "4枚", "plain"],
    "未確認が残る時は主操作を止め、理由と次の確認を案内します。",
  ],
  [
    "商品の写真",
    "役割ごとに写真を集め、原本を非公開で守ります。",
    "写真を追加",
    ["正面・背面", "2枚", "ok"],
    ["ブランドタグ", "1枚", "ok"],
    ["品質表示", "1枚", "ok"],
    ["気になる箇所", "1枚", "review"],
    "商品 > 0128 > 写真の順に、原本・編集用・確認済みを分けます。",
  ],
  [
    "写真の編集方法",
    "無料の標準は編集せず進むこと。任意で編集用セットを作れます。",
    "編集用セットを作る",
    ["白背景・中央", "レシピ", "plain"],
    ["自作画像編集", "準備中", "plain"],
    ["編集用セット", "任意", "ok"],
    ["編集せず進む", "無料・標準", "ok"],
    "外部編集は本人が契約を確認して手動で行い、アプリは自動操作しません。",
  ],
  [
    "加工後を確認",
    "原本と加工後を比べ、商品・役割の取り違えを防ぎます。",
    "確認して採用",
    ["役割照合", "5 / 5一致", "ok"],
    ["原本", "保持", "ok"],
    ["加工後", "候補", "review"],
    ["人の承認", "必要", "review"],
    "左右の比較と履歴を置き、加工後だけで上書きしない構成です。",
  ],
  [
    "採寸",
    "種類に合う測定線と証拠写真で、値を人が確認します。",
    "確認した値を保存",
    ["肩幅", "46 cm", "plain"],
    ["身幅", "54 cm", "plain"],
    ["着丈", "68 cm", "plain"],
    ["袖丈", "61 cm", "plain"],
    "平置き幅と周囲長を混同しないよう、測定線と単位を並べます。",
  ],
  [
    "タグの文字",
    "ブランド・サイズ・色・素材は候補として出し、人が確定します。",
    "確認した内容を保存",
    ["ブランド", "候補：NORTH CLOTH", "review"],
    ["サイズ", "M", "plain"],
    ["色", "ネイビー", "plain"],
    ["素材", "ポリエステル", "plain"],
    "タグ原本を左、編集できる候補を右に置き、候補だけで確定しません。",
  ],
  [
    "商品まとめ",
    "検品、写真、採寸、タグの不足をまとめて確認します。",
    "商品説明の候補を作る",
    ["検品", "確認済み", "ok"],
    ["写真", "5 / 5", "ok"],
    ["採寸", "4項目", "ok"],
    ["タグ", "人が確認", "ok"],
    "4つの大きなカードで、次に直す不足を見つけやすくします。",
  ],
  [
    "商品説明の候補",
    "根拠と未確認を示した、編集可能な文章候補です。",
    "コピーする内容を確認",
    ["文章", "候補・人が確認", "review"],
    ["根拠", "写真・採寸・タグ", "plain"],
    ["未確認", "0件", "ok"],
    ["コピー", "本人が実行", "plain"],
    "AI候補を確定情報のように見せず、文章と根拠を並べます。",
  ],
  [
    "公式画面へ移る",
    "写真と文章を準備し、公開は本人が公式画面で行います。",
    "公式画面を開く",
    ["写真", "手動でダウンロード", "plain"],
    ["文章", "コピー", "plain"],
    ["商品ID", "公開後に登録", "review"],
    ["URL", "本人が確認", "review"],
    "外部画面を自動で操作せず、公開後の情報だけを人が一度登録します。",
  ],
  [
    "保存した商品ページ",
    "販売先ごとの商品ページを、一覧とギャラリーで確認します。",
    "商品ページを開く",
    ["表示", "ギャラリー", "plain"],
    ["今日確認", "3件", "review"],
    ["確認済み", "12件", "ok"],
    ["自動読取", "しない", "plain"],
    "商品写真、番号、販売先、価格、最終確認日を1カードにまとめます。",
  ],
  [
    "販売状況を確認",
    "確認が古い商品から、本人が公式画面の数字を入力します。",
    "確認した数値を保存",
    ["今日確認する商品", "8件", "review"],
    ["現在価格", "¥5,800", "plain"],
    ["閲覧・いいね", "人が入力", "plain"],
    ["画像候補", "候補・人が確認", "review"],
    "直接入力とスクリーンショットから候補の2通りを、右側で切り替えます。",
  ],
  [
    "価格候補を比べる",
    "複数案と下限価格を見比べ、正解を自動で決めません。",
    "この候補をコピー",
    ["5%", "¥5,510", "plain"],
    ["10%", "¥5,220", "plain"],
    ["15%", "¥4,930", "plain"],
    ["最低価格", "¥4,800", "review"],
    "原価・送料・販売履歴・季節情報は参考にし、本人が選びます。",
  ],
  [
    "返信文と本人操作",
    "文章をコピーし、公式画面で本人が送信・反映確認します。",
    "文章をコピー",
    ["返信候補", "編集できます", "plain"],
    ["値下げ案", "参考", "review"],
    ["公式画面", "本人が開く", "plain"],
    ["反映確認", "チェックが必要", "ok"],
    "自動返信・自動値下げ・自動セールを行わないことを表示します。",
  ],
  [
    "注文を記録",
    "仮注文番号で始め、取引IDは後から入力できます。",
    "仮登録して取り出しへ",
    ["仮注文番号", "#0048", "ok"],
    ["販売先", "個人版", "plain"],
    ["取引ID", "任意・あとで入力", "review"],
    ["未入力", "2件・作業は続けられます", "review"],
    "住所が不要な匿名配送では、住所を保存しない前提です。",
  ],
  [
    "商品を取り出す",
    "担当範囲の商品と場所だけを、二重確認します。",
    "取り出しを完了",
    ["商品", "0123・一致", "ok"],
    ["場所", "棚02・段3・一致", "ok"],
    ["場所写真", "確認済み", "plain"],
    ["原価・住所", "表示しない", "plain"],
    "商品ラベル、場所ラベル、写真を照合しても、出庫確定は人が行います。",
  ],
  [
    "発送前の写真",
    "写真を使うかは、高額商品だけ・すべて・使わないから選べます。",
    "この写真を使う",
    ["高額商品だけ撮る", "おすすめ・選択中", "ok"],
    ["高額の目安", "¥30,000", "plain"],
    ["この注文", "高額商品に該当", "review"],
    ["写真", "商品・梱包箱の2枚", "ok"],
    "金額が未入力でも梱包を止めず、今回は使わないことも選べます。",
  ],
  [
    "配送方法と発送",
    "選んだ配送方法と送料を記録し、発送は人が確定します。",
    "発送を記録",
    ["配送方法", "本人が選ぶ", "plain"],
    ["送料", "注文時の値を固定", "ok"],
    ["発送前の写真", "2枚・確認済み", "ok"],
    ["外部確認", "自動取得しない", "plain"],
    "公式情報の確認日と、実際に選んだ方法を分けて保存する画面です。",
  ],
  [
    "在庫と保管場所",
    "場所ツリー、写真、在庫番号、担当、履歴を並べて確認します。",
    "保管場所を開く",
    ["場所", "洋室A・棚02", "plain"],
    ["在庫", "12点", "ok"],
    ["位置写真", "3枚", "ok"],
    ["担当", "田中", "plain"],
    "左に場所ツリー、中央に在庫一覧、右に写真と移動履歴を置きます。",
  ],
  [
    "棚卸し",
    "開始時点の対象を固定し、読取済みと残りを表示します。",
    "棚卸しを始める",
    ["対象", "棚02・12点", "plain"],
    ["読取済み", "8点", "ok"],
    ["残り", "4点", "review"],
    ["接続", "オフライン時は注意", "review"],
    "進捗を見ながら、在庫数を自動で書き換えない棚卸画面です。",
  ],
  [
    "数が合わない商品",
    "見つからない・別の棚・予定外を分け、自動修正しません。",
    "この商品を確認",
    ["見つからない", "1件", "review"],
    ["別の棚", "2件", "review"],
    ["予定外に発見", "1件", "review"],
    ["自動変更", "しない", "plain"],
    "商品と場所の再読取、証拠写真、理由を同じ画面で確認します。",
  ],
  [
    "仮状態・復元・返品",
    "1人/複数人の確認ルールを守り、削除せず復元できます。",
    "確認結果を保存",
    ["1人時", "3秒確認・可逆", "plain"],
    ["複数人時", "別担当が再確認", "plain"],
    ["発見時", "在庫に戻す", "ok"],
    ["返品", "隔離して確認", "review"],
    "紛失確定、廃棄確定、数量調整はこのP0画面では行いません。",
  ],
  [
    "メンバー",
    "役割、利用中、最終ログインを確認して招待・停止します。",
    "メンバーを招待",
    ["オーナー", "1人", "ok"],
    ["在庫担当", "2人", "plain"],
    ["外注担当", "1人", "plain"],
    ["停止中", "0人", "plain"],
    "実在の氏名ではなく、架空の短い表示名を一覧に使います。",
  ],
  [
    "担当を割り当てる",
    "商品・場所・写真・注文を、期限付きで最小限だけ許可します。",
    "この担当を割り当てる",
    ["対象", "棚02の格納作業", "plain"],
    ["開始", "今日 10:00", "plain"],
    ["終了", "今日 18:00", "review"],
    ["見せない情報", "原価・住所", "ok"],
    "割当前に、相手が見られる範囲をプレビューします。",
  ],
  [
    "変更を確認",
    "変更前後、証拠、理由を見て、人が承認または差戻します。",
    "承認する",
    ["変更前", "棚02・段2", "plain"],
    ["変更後", "棚02・段3", "plain"],
    ["証拠", "写真1枚", "ok"],
    ["理由", "棚の整理", "plain"],
    "承認、差し戻し、コメントを同じ右側の判断欄へ置きます。",
  ],
  [
    "変更履歴",
    "誰が、いつ、何を変えたかを残し、通常画面から削除しません。",
    "履歴を書き出す",
    ["本日", "14件", "plain"],
    ["承認済み", "8件", "ok"],
    ["差戻し", "1件", "review"],
    ["削除", "不可", "ok"],
    "時系列の表で、対象・操作・前後・承認を確認します。",
  ],
  [
    "箱の見込み",
    "仕入箱の実数と販売見込みを、確定実績と混ぜずに表示します。",
    "販売後の実績を見る",
    ["実数", "48着", "plain"],
    ["販売候補", "39着", "plain"],
    ["見込売上", "¥138,000〜169,000", "review"],
    ["見込粗利", "¥31,000〜53,000", "review"],
    "仕入額、見込費用、損益分岐も並べ、すべて見込みと明示します。",
  ],
  [
    "販売後の実績",
    "売れた結果を見込みと比較し、実費用を別々に確認します。",
    "月別KPIを見る",
    ["販売済み", "31 / 48着", "ok"],
    ["実売上", "¥124,000", "plain"],
    ["実費用", "¥29,600", "plain"],
    ["実粗利", "¥19,400", "plain"],
    "未販売17着を残し、見込みと実績を一つの利益に混ぜません。",
  ],
  [
    "月別KPI",
    "回転・見込み・残在庫を月単位で見る参考画面です。",
    "対象月を確認",
    ["30日販売率", "42%", "plain"],
    ["売上見込", "¥186,000", "review"],
    ["粗利見込", "¥48,000", "review"],
    ["残り在庫", "76点", "plain"],
    "会計上の利益・所得・税額を示すものではないと明記します。",
  ],
  [
    "仕入先・在庫の比較",
    "母数や欠損を見ながら、継続・停止は人が決めます。",
    "不足データを確認",
    ["仕入先A", "母数48・観測30日", "plain"],
    ["仕入先B", "母数22・送料未入力", "review"],
    ["在庫日数", "平均38日", "plain"],
    ["判断", "人が行う", "ok"],
    "少ないデータを断定せず、参考値と不足情報を表で見せます。",
  ],
  [
    "売上の事実",
    "売上、返金、手数料、送料、仕入れ代を別々に表示します。",
    "会計の基本設定へ",
    ["売上", "¥5,800", "plain"],
    ["返金", "¥0", "plain"],
    ["販売手数料", "¥580", "plain"],
    ["送料・原価", "¥750 / ¥1,800", "plain"],
    "税務上の結論を出さず、確認済みの取引事実だけを並べます。",
  ],
  [
    "会計の基本設定",
    "申告や消費税の扱いは、人または税理士が決めます。",
    "内容を確認して保存",
    ["申告区分", "未設定", "review"],
    ["消費税", "未設定", "review"],
    ["記帳方式", "未設定", "review"],
    ["? ヘルプ", "意味と例", "plain"],
    "難しい言葉は質問マークで説明し、AIが選択する表現を使いません。",
  ],
  [
    "会計項目の候補",
    "承認済みルールに一致する候補だけを事前に出します。",
    "確認した項目を保存",
    ["売上", "売上高（候補）", "review"],
    ["仕入", "仕入高（候補）", "review"],
    ["送料", "荷造運賃（候補）", "review"],
    ["不明", "出力を止める", "review"],
    "採用・変更を人が選べ、根拠と確認状態を残します。",
  ],
  [
    "ファイル作成・履歴",
    "出力前に止まる理由を確認し、CSVは人がダウンロードします。",
    "確認してダウンロード",
    ["形式", "Money Forward向け / 汎用", "plain"],
    ["出力前チェック", "要確認 1件", "review"],
    ["手動取込", "本人が実行", "plain"],
    ["履歴", "置換も保持", "ok"],
    "外部API送信はせず、作成済みファイルの確認と履歴を残します。",
  ],
  [
    "アプリの基本設定",
    "事業所、表示、通知、工程、配送方法を分かりやすく整えます。",
    "設定を保存",
    ["事業所", "サンプル事業所", "plain"],
    ["通知", "要確認のみ", "plain"],
    ["工程", "写真は任意", "plain"],
    ["配送方法", "販売先ごと", "plain"],
    "専門語を主見出しにせず、変更の影響を横に説明します。",
  ],
  [
    "写真の保管",
    "原本、編集用、加工後、一覧画像を分け、非公開で保管します。",
    "保存場所を確認",
    ["原本", "上書きしない", "ok"],
    ["編集用コピー", "任意", "plain"],
    ["加工後", "人が確認", "review"],
    ["外部自動保存", "GitHub・Slack・Notionへしない", "ok"],
    "端末からPC内の非公開保管へ進む図で、写真の扱いを説明します。",
  ],
  [
    "書き出し・バックアップ",
    "CSV・ZIPを本人が保存先へ書き出し、履歴と内容を確認します。",
    "書き出し内容を確認",
    ["CSV", "手動書き出し", "plain"],
    ["ZIP", "手動書き出し", "plain"],
    ["保存先", "本人が選ぶ", "plain"],
    ["自動同期", "しない", "ok"],
    "作成日時、内容、復元確認を並べ、外部への自動送信をしません。",
  ],
  [
    "外部連携の状態",
    "P0は外部接続なし・無料。将来機能は条件を確認してからです。",
    "条件を確認",
    ["P0", "外部連携なし・無料", "ok"],
    ["販売先連携", "準備中", "plain"],
    ["会計連携", "準備中", "plain"],
    ["接続", "勝手につながない", "ok"],
    "契約、費用、権限、商用利用を人が確認するまで有効化しません。",
  ],
];

const screens: readonly Screen[] = screenRows.map(
  ([title, description, primary, firstFact, secondFact, thirdFact, fourthFact, detail], index) => ({
    number: index + 1,
    title,
    eyebrow: `PC ${String(index + 1).padStart(2, "0")} / APPROVED DEMO`,
    description,
    primary,
    facts: [firstFact, secondFact, thirdFact, fourthFact],
    detail,
  }),
);

const details = [
  "",
  "原価未確認、送料未確認、90日超在庫、承認待ちを先に表示します。",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
];

const boardLabels = [
  [1, "ホーム"],
  [5, "仕入れ"],
  [9, "在庫"],
  [13, "商品"],
  [17, "写真・採寸"],
  [21, "出品"],
  [25, "販売支援"],
  [29, "注文・発送"],
  [33, "在庫・棚卸"],
  [37, "メンバー"],
  [41, "分析"],
  [45, "会計"],
  [49, "設定"],
] as const;

function path(number: number) {
  return `/pc/${number}`;
}

function GarmentArt() {
  return (
    <div className={styles.garment} aria-label="架空の商品図" role="img">
      <span>0123</span>
    </div>
  );
}

function BarcodeArt() {
  return (
    <div className={styles.barcode} aria-label="商品バーコードの見本" role="img">
      {Array.from({ length: 31 }, (_, index) => (
        <i key={index} style={{ width: `${index % 5 === 0 ? 4 : index % 3 === 0 ? 2 : 1}px` }} />
      ))}
    </div>
  );
}

function Visual({ screen }: { screen: Screen }) {
  if (screen.number === 10) {
    return (
      <div className={styles.labelSheet}>
        {Array.from({ length: 24 }, (_, index) => (
          <div key={index}>
            <strong>{String(index + 123).padStart(4, "0")}</strong>
            <BarcodeArt />
          </div>
        ))}
      </div>
    );
  }
  if ([9, 12].includes(screen.number))
    return (
      <div className={styles.lookupVisual}>
        <GarmentArt />
        <div>
          <BarcodeArt />
          <small>スマホで読み取ると、商品と保管場所を開けます</small>
        </div>
      </div>
    );
  if ([11, 33].includes(screen.number))
    return (
      <div className={styles.shelfVisual}>
        <div>洋室A</div>
        <div>棚02</div>
        <div>段3 / 箱3</div>
        <span>位置写真</span>
      </div>
    );
  if ([15, 17, 19, 31].includes(screen.number))
    return (
      <div className={styles.photoVisual}>
        <GarmentArt />
        <div className={styles.photoDots}>
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  if ([34, 35, 36].includes(screen.number))
    return (
      <div className={styles.progressVisual}>
        <b>8 / 12</b>
        <span>
          <i />
          <i />
          <i />
          <i />
        </span>
        <small>人が確認して保存</small>
      </div>
    );
  if ([41, 42, 43, 44, 45, 48].includes(screen.number))
    return (
      <div className={styles.chartVisual}>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <span>参考値・人が確認</span>
      </div>
    );
  if (screen.number === 1)
    return (
      <div className={styles.loginMark}>
        <GarmentArt />
        <b>OP</b>
      </div>
    );
  return (
    <div className={styles.abstractVisual}>
      <span>{String(screen.number).padStart(2, "0")}</span>
      <i />
      <i />
      <i />
    </div>
  );
}

export function ApprovedPcDemo({ screenNumber }: { screenNumber: number }) {
  if (screenNumber <= 16) return <ApprovedPcEarlyScreens screenNumber={screenNumber} />;
  if (screenNumber <= 32) return <ApprovedPcMiddleScreens screenNumber={screenNumber} />;
  if (screenNumber <= 52) return <ApprovedPcLateScreens screenNumber={screenNumber} />;
  const screen = screens.find((entry) => entry.number === screenNumber) ?? screens[0];
  if (!screen) return null;
  const previous = Math.max(1, screen.number - 1);
  const next = Math.min(52, screen.number + 1);
  return (
    <main className={styles.demo}>
      <aside className={styles.sidebar} aria-label="PCデモの画面一覧">
        <a className={styles.brand} href={path(1)}>
          <b>OP</b>
          <span>オペレーション</span>
        </a>
        <nav>
          {boardLabels.map(([number, label]) => (
            <a
              className={
                screen.number >= number && screen.number < number + 4 ? styles.current : ""
              }
              href={path(number)}
              key={number}
            >
              <i>{String(number).padStart(2, "0")}</i>
              {label}
            </a>
          ))}
        </nav>
        <p>
          承認済みデザイン
          <br />
          デモ・外部接続なし
        </p>
      </aside>
      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <span>承認デザイン確認</span>
            <strong>PC {String(screen.number).padStart(2, "0")} / 52</strong>
          </div>
          <div>
            <button
              type="button"
              onClick={() => window.alert("このデモは画面遷移だけです。業務データは更新しません。")}
            >
              ? 使い方
            </button>
            <a href={path(1)}>⌂ ホーム</a>
          </div>
        </header>
        <section className={styles.content}>
          <div className={styles.pageHeading}>
            <div>
              <p>{screen.eyebrow}</p>
              <h1>{screen.title}</h1>
              <span>{screen.description}</span>
            </div>
            <a className={styles.safeChip} href={path(52)}>
              外部接続 0件
            </a>
          </div>
          <div className={styles.board}>
            <section className={styles.primaryPanel}>
              <div className={styles.panelHead}>
                <div>
                  <small>いま確認すること</small>
                  <h2>{screen.title}</h2>
                </div>
                <span className={styles.status}>人が確認</span>
              </div>
              <p className={styles.detail}>{screen.detail}</p>
              <div className={styles.factGrid}>
                {screen.facts.map(([label, value, tone]) => (
                  <article className={`${styles.fact} ${styles[tone]}`} key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                    <span>
                      {tone === "ok" ? "確認済み" : tone === "review" ? "要確認" : "現在の内容"}
                    </span>
                  </article>
                ))}
              </div>
              <div className={styles.actionRow}>
                <a className={styles.primary} href={path(next)}>
                  {screen.primary}
                  <span>→</span>
                </a>
                <a className={styles.secondary} href={path(previous)}>
                  {screen.number === 1 ? "画面一覧へ" : "前の画面"}
                </a>
              </div>
            </section>
            <aside className={styles.visualPanel}>
              <Visual screen={screen} />
              <div className={styles.visualNote}>
                <b>確認ポイント</b>
                <span>これは架空データの安全な見本です。保存・公開・外部送信は行いません。</span>
              </div>
            </aside>
          </div>
          <nav className={styles.stepper} aria-label="前後の画面へ移動">
            <a href={path(previous)} aria-disabled={screen.number === 1}>
              ← 前へ
            </a>
            <ol>
              {Array.from({ length: 4 }, (_, index) => {
                const number = Math.floor((screen.number - 1) / 4) * 4 + index + 1;
                return (
                  <li className={number === screen.number ? styles.activeStep : ""} key={number}>
                    <a href={path(number)}>{number}</a>
                  </li>
                );
              })}
            </ol>
            <a href={path(next)} aria-disabled={screen.number === 52}>
              次へ →
            </a>
          </nav>
        </section>
      </section>
    </main>
  );
}

export const approvedPcScreenCount = screens.length;
