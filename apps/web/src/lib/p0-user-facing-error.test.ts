import { describe, expect, it } from "vitest";

import { p0UserFacingErrorMessage } from "./p0-user-facing-error";

describe("p0UserFacingErrorMessage", () => {
  it("turns the observed shipping assignment error into actionable Japanese", () => {
    expect(
      p0UserFacingErrorMessage(new Error("The shipping assignee is not an active member")),
    ).toBe("発送担当には、チームに参加中の「発送担当」メンバーを指定してください。");
  });

  it("explains how to recover when a saved photo is reused for another measurement", () => {
    expect(
      p0UserFacingErrorMessage(new Error("Dedicated measurement media cannot reuse another photo")),
    ).toBe(
      "この商品ですでに使った写真は、別の採寸項目や掲載用写真には使えません。別の写真を選んでください。",
    );
  });

  it("keeps an already user-facing validation message", () => {
    expect(p0UserFacingErrorMessage(new Error("注文番号を入力してください。"))).toBe(
      "注文番号を入力してください。",
    );
  });

  it("uses a safe fallback for an unknown non-error value", () => {
    expect(p0UserFacingErrorMessage(null)).toBe("操作を確認できませんでした。");
  });
});
