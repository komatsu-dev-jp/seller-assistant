import { describe, expect, it } from "vitest";
import {
  getCaptureActionState,
  getPutawayActionState,
  getShippingActionState,
} from "./mobile-assignment-action";

describe("mobile assignment action availability", () => {
  it("keeps putaway unavailable while loading or when either required assignment is missing", () => {
    expect(getPutawayActionState(true, 1, 1)).toEqual({
      enabled: false,
      detail: "担当範囲を確認しています",
    });
    expect(getPutawayActionState(false, 0, 0)).toEqual({
      enabled: false,
      detail: "商品と保管場所の割当後に利用できます",
    });
    expect(getPutawayActionState(false, 0, 1)).toEqual({
      enabled: false,
      detail: "格納する商品の割当が必要です",
    });
    expect(getPutawayActionState(false, 1, 0)).toEqual({
      enabled: false,
      detail: "保管場所の割当が必要です",
    });
    expect(getPutawayActionState(false, 1, 1)).toEqual({
      enabled: true,
      detail: "割当範囲・チェック値を照合",
    });
  });

  it("opens shipping only after an assignment is loaded", () => {
    expect(getShippingActionState(true, 1)).toEqual({
      enabled: false,
      detail: "担当範囲を確認しています",
    });
    expect(getShippingActionState(false, 0)).toEqual({
      enabled: false,
      detail: "発送の割当後に利用できます",
    });
    expect(getShippingActionState(false, 1)).toEqual({
      enabled: true,
      detail: "割当期間中の注文だけ",
    });
  });

  it("opens capture only after its own assignment is loaded", () => {
    expect(getCaptureActionState(true, 1)).toEqual({
      enabled: false,
      detail: "撮影の担当商品を確認しています",
    });
    expect(getCaptureActionState(false, 0)).toEqual({
      enabled: false,
      detail: "撮影の担当商品が割り当てられると利用できます",
    });
    expect(getCaptureActionState(false, 1)).toEqual({
      enabled: true,
      detail: "途中保存・再測定・タグ文字候補",
    });
    expect(getCaptureActionState(false, 1, true)).toEqual({
      enabled: false,
      detail: "担当情報を確認できません。通信後に画面を更新してください",
    });
  });
});
