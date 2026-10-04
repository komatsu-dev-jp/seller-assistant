import { describe, expect, it } from "vitest";
import { brandChoices, productTitle } from "./intake-product-options";

describe("offline product choices", () => {
  it("searches Japanese and normalized English aliases without a network", () => {
    expect(brandChoices("ラルフ", "all", [])).toEqual(["ラルフローレン"]);
    expect(brandChoices("ＲＡＬＰＨ", "all", [])).toEqual(["ラルフローレン"]);
    expect(brandChoices("North Face", "all", [])).toEqual(["ザ・ノース・フェイス"]);
    expect(brandChoices("見つからない", "all", [])).toEqual([]);
  });
  it("filters used brands, deduplicates, and keeps unlisted brands", () => {
    expect(brandChoices("", "used", [])).toEqual([]);
    expect(brandChoices("", "used", ["独自ブランド", "独自ブランド", "", "ユニクロ"])).toHaveLength(
      2,
    );
    expect(brandChoices("独自", "all", ["独自ブランド"])).toEqual(["独自ブランド"]);
  });
  it("omits missing parts and joins sleeve with category", () => {
    expect(
      productTitle({
        brand: "ラルフローレン",
        sleeve: "半袖",
        category: "シャツ",
        audience: "レディース",
        color: "ネイビー",
        size: "M",
      }),
    ).toBe("ラルフローレン 半袖シャツ レディース ネイビー M");
    expect(
      productTitle({
        brand: "",
        sleeve: "",
        category: " ワンピース ",
        audience: "",
        color: "",
        size: "",
      }),
    ).toBe("ワンピース");
  });
});
