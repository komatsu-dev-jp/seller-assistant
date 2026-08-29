export type MobileScreenFlow = "canonical" | "photo" | "box" | "sales" | "genre-suit";

export type MobileScreen = {
  readonly id: string;
  readonly title: string;
  readonly primary: string;
  readonly group: string;
  readonly flow: MobileScreenFlow;
  readonly source: string;
  readonly note: string;
};

const canonicalTitles = [
  ["ログイン", "ログイン"],
  ["はじめの設定", "設定を保存"],
  ["メンバーと担当", "この担当で招待"],
  ["ホーム", "作業を続ける"],
  ["作業一覧", "この作業を開く"],
  ["送信待ち", "もう一度送る"],
  ["仕入れ書類", "請求書を追加"],
  ["請求書を追加", "ファイルから選ぶ"],
  ["ファイル確認", "この請求書を使う"],
  ["読み取り確認", "商品行を確認"],
  ["商品行を確認", "確認した内容を保存"],
  ["商品の確認方法", "この方法で進む"],
  ["商品を確認", "この商品で進む"],
  ["棚を確認", "この棚にする"],
  ["格納確認", "この棚に格納"],
  ["次は検品", "検品を始める"],
  ["状態チェック", "次の項目へ"],
  ["汚れ・傷", "この内容を保存"],
  ["検品まとめ", "検品を完了"],
  ["撮る写真一覧", "正面を撮る"],
  ["撮影ガイド", "撮影"],
  ["写真確認", "この写真を使う"],
  ["撮り直し", "撮り直す"],
  ["写真まとめ", "採寸へ進む"],
  ["採寸の準備", "採寸を始める"],
  ["1か所ずつ採寸", "保存して次へ"],
  ["採寸写真", "写真を使う"],
  ["測り直し", "もう一度測る"],
  ["撮影した写真", "5枚を確認"],
  ["写真の保存先", "保存内容を確認"],
  ["ブランド・サイズ確認", "この内容で進む"],
  ["編集レシピを選ぶ", "編集方法を選ぶ"],
  ["編集方法を選ぶ", "編集用セットへ"],
  ["注文を登録", "注文を保存"],
  ["商品を取り出す", "取り出しを完了"],
  ["配送方法を選ぶ", "この方法にする"],
  ["発送内容を確認", "内容を確認しました"],
  ["発送を記録", "発送を記録"],
  ["数が合わない商品", "この商品を確認"],
  ["見つからない商品（仮）", "3秒押して仮状態にする"],
  ["見つかった商品を戻す", "在庫に戻す"],
  ["返品の状態確認", "確認結果を保存"],
  ["売上の事実", "会計の設定へ"],
  ["会計の基本設定", "内容を確認して保存"],
  ["会計項目の候補", "確認した項目を保存"],
  ["作成前の確認", "ファイル内容を確認"],
  ["ファイル内容の確認", "確認してダウンロード"],
  ["手動取込の結果", "結果を保存"],
  ["作成・取込履歴", "履歴の詳細を見る"],
] as const;

const groupFor = (number: number): string => {
  if (number <= 6) return "はじめる";
  if (number <= 11) return "仕入れ";
  if (number <= 16) return "格納";
  if (number <= 19) return "検品";
  if (number <= 23) return "撮影";
  if (number <= 28) return "採寸";
  if (number <= 33) return "写真受け渡し";
  if (number <= 38) return "注文・発送";
  if (number <= 43) return "在庫確認";
  return "会計";
};

const sourceFor = (number: number): string => {
  if (number <= 6) return "mobile-ios-redesign-b-board-01-entry-v2.png";
  if (number <= 11) return "mobile-ios-redesign-b-board-02-purchase-v3.png";
  if (number <= 16) return "mobile-ios-redesign-b-board-03-putaway-v2.png";
  if (number <= 22) return "mobile-ios-redesign-b-board-04-inspection-v1.png";
  if (number <= 28) return "mobile-ios-redesign-b-board-05-photo-measure-v1.png";
  if (number <= 33) return "mobile-ios-redesign-b-board-06-product-info-v6.png";
  if (number <= 38) return "mobile-ios-redesign-b-board-07-shipping-v4.png";
  if (number <= 43) return "mobile-ios-redesign-b-board-08-exceptions-v2.png";
  return "mobile-ios-redesign-b-board-09-accounting-v1.png";
};

export const canonicalScreens: readonly MobileScreen[] = canonicalTitles.map(
  ([title, primary], index) => {
    const number = index + 1;
    return {
      id: String(number).padStart(2, "0"),
      title,
      primary,
      group: groupFor(number),
      flow: "canonical",
      source: sourceFor(number),
      note:
        number === 38
          ? "発送内容を確認して記録します。送料と発送日時は人が確認します。"
          : "架空データの見本です。保存・公開・外部送信は行いません。",
    };
  },
);

const additionalScreens: readonly MobileScreen[] = [
  {
    id: "photo-01",
    title: "撮影した写真",
    primary: "5枚を確認",
    group: "写真受け渡し",
    flow: "photo",
    source: "mobile-ios-redesign-b-board-06-product-info-v6.png",
    note: "商品ごとの全写真を、役割と枚数つきで確認します。",
  },
  {
    id: "photo-02",
    title: "写真の保存先",
    primary: "保存内容を確認",
    group: "写真受け渡し",
    flow: "photo",
    source: "mobile-ios-redesign-b-board-06-product-info-v6.png",
    note: "写真の保存先を商品単位で確認します。外部サービスへ自動保存しません。",
  },
  {
    id: "photo-03",
    title: "ブランド・サイズ確認",
    primary: "この内容で進む",
    group: "写真受け渡し",
    flow: "photo",
    source: "mobile-ios-redesign-b-board-06-product-info-v6.png",
    note: "タグ候補は人が確認してから確定します。",
  },
  {
    id: "photo-04",
    title: "編集レシピを選ぶ",
    primary: "編集方法を選ぶ",
    group: "写真受け渡し",
    flow: "photo",
    source: "mobile-ios-redesign-b-board-06-product-info-v6.png",
    note: "無料の標準は編集せず進むこと。編集レシピは任意です。",
  },
  {
    id: "photo-05",
    title: "編集方法を選ぶ",
    primary: "編集用セットへ",
    group: "写真受け渡し",
    flow: "photo",
    source: "mobile-ios-redesign-b-board-06-product-info-v6.png",
    note: "外部編集は本人が手動で行い、アプリは画面操作を代行しません。",
  },
  {
    id: "photo-06",
    title: "編集用セットを作る",
    primary: "ZIPを作成",
    group: "写真受け渡し",
    flow: "photo",
    source: "mobile-ios-redesign-b-board-06-product-info-v6.png",
    note: "ZIPと一覧表を端末内で準備するだけです。公開先へ送信しません。",
  },
  {
    id: "photo-07",
    title: "加工後を戻して確認",
    primary: "5枚を承認",
    group: "写真受け渡し",
    flow: "photo",
    source: "mobile-ios-redesign-b-board-06-product-info-v6.png",
    note: "原本と加工後を比べ、人が承認してから採用します。",
  },
  {
    id: "box-01",
    title: "仕入箱を登録",
    primary: "箱を登録して数える",
    group: "卸箱",
    flow: "box",
    source: "mobile-ios-redesign-wholesale-box-inspection-v3.png",
    note: "箱の見込み数を先に決めず、まず箱と仕入資料を登録します。",
  },
  {
    id: "box-02",
    title: "入っている数を数える",
    primary: "48点で確定",
    group: "卸箱",
    flow: "box",
    source: "mobile-ios-redesign-wholesale-box-inspection-v3.png",
    note: "数えた数と、まだ確認できない数を分けて表示します。",
  },
  {
    id: "box-03",
    title: "1点を簡単登録",
    primary: "保存して次へ",
    group: "卸箱",
    flow: "box",
    source: "mobile-ios-redesign-wholesale-box-inspection-v3.png",
    note: "短い番号と写真で先に登録し、詳細確認は後から行えます。",
  },
  {
    id: "box-04",
    title: "あとで詳しく調べる",
    primary: "優先商品を開く",
    group: "卸箱",
    flow: "box",
    source: "mobile-ios-redesign-wholesale-box-inspection-v3.png",
    note: "高値候補や要確認だけを、通常作業と分けて調べます。",
  },
  {
    id: "box-05",
    title: "箱の見込み",
    primary: "見込みを確認",
    group: "卸箱",
    flow: "box",
    source: "mobile-ios-redesign-wholesale-box-inspection-v3.png",
    note: "見込み数は予測として表示し、販売後の実数と混ぜません。",
  },
  {
    id: "box-06",
    title: "販売後の実績",
    primary: "月別KPIを見る",
    group: "卸箱",
    flow: "box",
    source: "mobile-ios-redesign-wholesale-box-inspection-v3.png",
    note: "販売後の実績を記録し、税務上の利益を自動確定しません。",
  },
  {
    id: "box-07",
    title: "月別KPI",
    primary: "KPIの内訳を見る",
    group: "卸箱",
    flow: "box",
    source: "mobile-ios-redesign-wholesale-box-inspection-v3.png",
    note: "箱単位の見込み・実績を月別に比較します。",
  },
  {
    id: "sales-01",
    title: "見直し候補",
    primary: "候補を見る",
    group: "販売サポート",
    flow: "sales",
    source: "mobile-ios-redesign-sales-support-v3.png",
    note: "人が確認する候補だけを並べ、自動値下げは行いません。",
  },
  {
    id: "sales-02",
    title: "商品の状況を確認",
    primary: "入力内容を確認",
    group: "販売サポート",
    flow: "sales",
    source: "mobile-ios-redesign-sales-support-v3.png",
    note: "公式画面で本人が確認した数値を、確認日と一緒に記録します。",
  },
  {
    id: "sales-03",
    title: "提案の理由",
    primary: "値下げ幅を比べる",
    group: "販売サポート",
    flow: "sales",
    source: "mobile-ios-redesign-sales-support-v3.png",
    note: "価格候補には根拠を表示しますが、正解を自動で決めません。",
  },
  {
    id: "sales-04",
    title: "値下げ幅を比べる",
    primary: "10%を候補にする",
    group: "販売サポート",
    flow: "sales",
    source: "mobile-ios-redesign-sales-support-v3.png",
    note: "複数の幅と最低価格を比べ、本人が公式画面へ反映します。",
  },
  {
    id: "sales-05",
    title: "行事に合わせる",
    primary: "提案に追加",
    group: "販売サポート",
    flow: "sales",
    source: "mobile-ios-redesign-sales-support-v3.png",
    note: "季節や行事は参考情報として見せ、価格を自動変更しません。",
  },
  {
    id: "sales-06",
    title: "公式画面で実行",
    primary: "結果を記録",
    group: "販売サポート",
    flow: "sales",
    source: "mobile-ios-redesign-sales-support-v3.png",
    note: "コピー後の送信・公開・反映は、本人が公式画面で行います。",
  },
];

const genreSuitScreens: readonly MobileScreen[] = [
  {
    id: "genre-suit-01",
    title: "スーツの構成品",
    primary: "上着から撮る",
    group: "スーツ・セットアップ",
    flow: "genre-suit",
    source: "mobile-ios-redesign-b-board-10-genre-guide-v2.png",
    note: "上着とパンツを一組として確認してから撮影を始めます。",
  },
  {
    id: "genre-suit-02",
    title: "スーツ・上着",
    primary: "次に撮る：正面",
    group: "スーツ・セットアップ",
    flow: "genre-suit",
    source: "mobile-ios-redesign-b-board-10-genre-guide-v2.png",
    note: "上着に必要な写真を、正面から順番に案内します。",
  },
  {
    id: "genre-suit-03",
    title: "スーツ・パンツ",
    primary: "次に撮る：正面",
    group: "スーツ・セットアップ",
    flow: "genre-suit",
    source: "mobile-ios-redesign-b-board-10-genre-guide-v2.png",
    note: "パンツの形と品質表示を、一つずつ確認します。",
  },
  {
    id: "genre-suit-04",
    title: "セットアップの構成品",
    primary: "トップスから撮る",
    group: "スーツ・セットアップ",
    flow: "genre-suit",
    source: "mobile-ios-redesign-b-board-10-genre-guide-v2.png",
    note: "トップスとボトムスを一組として確認します。",
  },
  {
    id: "genre-suit-05",
    title: "セットアップ・トップス",
    primary: "次に撮る：正面",
    group: "スーツ・セットアップ",
    flow: "genre-suit",
    source: "mobile-ios-redesign-b-board-10-genre-guide-v2.png",
    note: "セットアップのトップスに必要な写真を案内します。",
  },
  {
    id: "genre-suit-06",
    title: "セットアップ・ボトムス",
    primary: "撮影内容を確認",
    group: "スーツ・セットアップ",
    flow: "genre-suit",
    source: "mobile-ios-redesign-b-board-10-genre-guide-v2.png",
    note: "ボトムスの写真と不足がないかを最後に確認します。",
  },
];

export const mobileScreens: readonly MobileScreen[] = [
  ...canonicalScreens,
  ...additionalScreens,
  ...genreSuitScreens,
];

export const mobileScreenIds = mobileScreens.map(({ id }) => id);

export function getMobileScreen(id: string): MobileScreen | undefined {
  return mobileScreens.find((screen) => screen.id === id);
}

export function getMobileScreenIndex(id: string): number {
  return mobileScreens.findIndex((screen) => screen.id === id);
}

export function getMobilePrevious(id: string): string | undefined {
  const index = getMobileScreenIndex(id);
  return index > 0 ? mobileScreens[index - 1]?.id : undefined;
}

export function getMobileNext(id: string): string | undefined {
  const index = getMobileScreenIndex(id);
  return index >= 0 && index < mobileScreens.length - 1 ? mobileScreens[index + 1]?.id : undefined;
}
