import { describe, expect, it } from "vitest";

import {
  APPROVED_PC_LISTING_DESCRIPTION,
  getApprovedPcListingStorage,
  loadApprovedPcListingDraft,
  readApprovedPcListingDraft,
  writeApprovedPcListingDraft,
} from "./approved-listing-draft";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    },
  };
}

describe("approved PC listing draft", () => {
  it("distinguishes an empty store from an unreadable store", () => {
    expect(loadApprovedPcListingDraft(memoryStorage())).toEqual({ status: "read", draft: null });
    expect(loadApprovedPcListingDraft(null)).toEqual({ status: "unavailable", draft: null });
    expect(
      loadApprovedPcListingDraft({
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {},
      }),
    ).toEqual({ status: "unavailable", draft: null });
  });
  it("round-trips the edited description and keeps the note separate", () => {
    const storage = memoryStorage();
    const draft = { description: "1行目\n2行目", note: "本文へ混ぜないメモ" };

    expect(writeApprovedPcListingDraft(storage, draft)).toBe(true);
    expect(readApprovedPcListingDraft(storage)).toEqual(draft);
  });

  it("ignores stale, malformed, or differently scoped data", () => {
    expect(readApprovedPcListingDraft(memoryStorage("not-json"))).toBeNull();
    expect(
      readApprovedPcListingDraft(
        memoryStorage(
          JSON.stringify({
            version: 1,
            itemKey: "another-item",
            description: "古い文章",
            note: "",
          }),
        ),
      ),
    ).toBeNull();
  });

  it("keeps the approved initial candidate available for reset", () => {
    expect(APPROVED_PC_LISTING_DESCRIPTION).toContain("サンプルブランド");
    expect(APPROVED_PC_LISTING_DESCRIPTION).toContain("【実寸（cm）】");
    expect(APPROVED_PC_LISTING_DESCRIPTION).toContain("【状態】");
  });

  it("reports a storage write failure without throwing", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };

    expect(
      writeApprovedPcListingDraft(storage, {
        description: APPROVED_PC_LISTING_DESCRIPTION,
        note: "",
      }),
    ).toBe(false);
  });

  it("treats unavailable browser storage as an explicit safe failure", () => {
    expect(getApprovedPcListingStorage()).toBeNull();
    expect(readApprovedPcListingDraft(null)).toBeNull();
    expect(
      writeApprovedPcListingDraft(null, {
        description: APPROVED_PC_LISTING_DESCRIPTION,
        note: "",
      }),
    ).toBe(false);
  });
});
