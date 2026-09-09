import type { ProductResearchResponse } from "@resale/contracts";
import { describe, expect, it } from "vitest";
import {
  buildCodexResearchQuestion,
  buildMercariSearchUrl,
  buildResearchSearchTerms,
  copyResearchText,
  normalizeSearchTerms,
} from "./product-research-handoff";

describe("human-operated research handoff", () => {
  it("normalizes whitespace, width and duplicate terms", () => {
    expect(normalizeSearchTerms(" ＡＢＣ\t白　ABC  白 ")).toBe("ABC 白");
  });
  it("prefers confirmed attributes and excludes unrelated candidate values", () => {
    const input = {
      confirmedAttributes: { brand: "確認ブランド", sizeLabel: "Ｍ", color: "白" },
      candidates: [{ brandCandidate: "未確認" }],
    } as unknown as ProductResearchResponse;
    expect(buildResearchSearchTerms(input)).toBe("確認ブランド M 白");
  });
  it("uses stable candidate order, excludes rejected values and deduplicates", () => {
    const input = {
      confirmedAttributes: null,
      candidates: [
        {
          candidateId: "b",
          status: "candidate",
          brandCandidate: "Brand",
          modelCandidate: "B",
          sizeCandidate: "M",
        },
        {
          candidateId: "a",
          status: "human_confirmed",
          brandCandidate: "Brand",
          modelCandidate: "A",
          colorCandidate: "白",
        },
        { candidateId: "c", status: "rejected", brandCandidate: "Rejected" },
      ],
    } as unknown as ProductResearchResponse;
    expect(buildResearchSearchTerms(input)).toBe("Brand A 白 B M");
    expect(buildResearchSearchTerms({ confirmedAttributes: null, candidates: [] })).toBe("");
  });
  it("encodes only the official keyword URL and rejects blank searches", () => {
    expect(buildMercariSearchUrl("白 & #/?")).toBe(
      `https://jp.mercari.com/search?keyword=${encodeURIComponent("白 & #/?")}`,
    );
    expect(buildMercariSearchUrl("　\n ")).toBeNull();
  });
  it("does not treat unverified price as final", () => {
    const prompt = buildCodexResearchQuestion("架空ブランド");
    expect(prompt).toContain("未確認の価格を確定扱いせず");
    expect(prompt).toContain("最終価格は人が確認");
    expect(prompt).toContain("根拠不足なら明記");
  });
  it("reports success only after writing succeeds and handles denied/unavailable clipboard", async () => {
    expect(
      await copyResearchText("候補", async (value) => {
        expect(value).toBe("候補");
      }),
    ).toBe(true);
    expect(
      await copyResearchText("候補", async () => {
        throw new Error("denied");
      }),
    ).toBe(false);
    expect(
      await copyResearchText("候補", () => {
        throw new TypeError("unavailable");
      }),
    ).toBe(false);
    expect(
      await copyResearchText(" ", async () => {
        throw new Error("must not run");
      }),
    ).toBe(false);
  });
});
