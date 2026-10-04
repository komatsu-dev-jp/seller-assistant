export const audiences = ["レディース", "メンズ", "ユニセックス", "キッズ"];
export const categories = [
  "シャツ",
  "Tシャツ",
  "ポロシャツ",
  "ブラウス",
  "ニット",
  "カーディガン",
  "パーカー",
  "スウェット",
  "ジャケット",
  "コート",
  "ワンピース",
  "パンツ",
  "スカート",
  "靴",
  "バッグ",
  "その他",
];
export const sleeves = ["半袖", "長袖", "ノースリーブ", "七分袖"];
export const colors = [
  "ブラック",
  "ホワイト",
  "ネイビー",
  "ブルー",
  "グレー",
  "ベージュ",
  "ブラウン",
  "グリーン",
  "レッド",
  "ピンク",
  "イエロー",
  "パープル",
  "オレンジ",
  "マルチカラー",
];
export const sizes = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "FREE",
  "サイズ表記なし",
  "不明",
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
  "52",
  "54",
  "60",
  "70",
  "80",
  "90",
  "100",
  "110",
  "120",
  "130",
  "140",
  "150",
  "160",
  "22cm",
  "22.5cm",
  "23cm",
  "23.5cm",
  "24cm",
  "24.5cm",
  "25cm",
  "25.5cm",
  "26cm",
  "26.5cm",
  "27cm",
  "27.5cm",
  "28cm",
  "28.5cm",
  "29cm",
  "30cm",
];

// A small offline starting list, not a complete brand master. Unlisted brands remain usable.
const brands = [
  ["ラルフローレン", "Ralph Lauren Polo ポロ"],
  ["ユニクロ", "UNIQLO"],
  ["ジーユー", "GU"],
  ["ザラ", "ZARA"],
  ["エイチアンドエム", "H&M"],
  ["無印良品", "MUJI"],
  ["ナイキ", "NIKE"],
  ["アディダス", "adidas"],
  ["プーマ", "PUMA"],
  ["ニューバランス", "New Balance"],
  ["チャンピオン", "Champion"],
  ["ザ・ノース・フェイス", "THE NORTH FACE ノースフェイス"],
  ["パタゴニア", "Patagonia"],
  ["コロンビア", "Columbia"],
  ["リーバイス", "Levi's Levis"],
  ["エドウイン", "EDWIN"],
  ["トミーヒルフィガー", "Tommy Hilfiger"],
  ["ラコステ", "LACOSTE"],
  ["バーバリー", "BURBERRY"],
  ["コーチ", "COACH"],
  ["ビームス", "BEAMS"],
  ["ユナイテッドアローズ", "UNITED ARROWS"],
  ["シップス", "SHIPS"],
  ["グローバルワーク", "GLOBAL WORK"],
  ["ローリーズファーム", "LOWRYS FARM"],
  ["ニコアンド", "niko and..."],
  ["スナイデル", "SNIDEL"],
  ["アーバンリサーチ", "URBAN RESEARCH"],
  ["ナチュラルビューティーベーシック", "NATURAL BEAUTY BASIC"],
] as const;
export type BrandFilter = "all" | "used";
const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/gu, "");
export function brandChoices(query: string, filter: BrandFilter, used: string[]) {
  const saved = [...new Set(used.map((name) => name.trim()).filter(Boolean))];
  const names =
    filter === "used" ? saved : [...new Set([...saved, ...brands.map(([name]) => name)])];
  const search = normalize(query.trim());
  return names
    .filter((name) => {
      const aliases = brands.find(([label]) => label === name)?.[1] ?? "";
      return normalize(`${name} ${aliases}`).includes(search);
    })
    .sort((a, b) => a.localeCompare(b, "ja"));
}

export function productTitle(item: {
  brand: string;
  sleeve: string;
  category: string;
  audience: string;
  color: string;
  size: string;
}): string {
  return [
    item.brand,
    `${item.sleeve.trim()}${item.category.trim()}`,
    item.audience,
    item.color,
    item.size,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
