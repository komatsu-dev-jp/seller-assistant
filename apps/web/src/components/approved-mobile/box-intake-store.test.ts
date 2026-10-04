import { describe, expect, it } from "vitest";
import {
  comparisonsSummary,
  confirmBox,
  createBox,
  createItem,
  emptyIntakeState,
  intakeKey,
  itemProfit,
  itemRegistrationProblems,
  money,
  parseIntake,
  readIntake,
  safeReferenceUrl,
  writeIntake,
  type IntakeItem,
  type IntakeState,
} from "./box-intake-store";

function memory() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}
function soldItem(id: string): IntakeItem {
  return {
    ...createItem(id),
    name: "架空シャツ",
    condition: "小さな擦れ",
    inspection: "sellable",
    registered: true,
    priceYen: "1000",
    shippingYen: "200",
    comparisons: [
      {
        id: "evidence-1",
        url: "https://example.com/sold/1",
        priceYen: "1200",
        confirmedSold: true,
        note: "架空資料",
      },
    ],
  };
}
function state(): IntakeState {
  const box = confirmBox({ ...createBox("box"), count: 2 });
  box.items[0] = soldItem("box-1");
  return { version: 1, activeBoxId: "box", boxes: [box] };
}

describe("private browser box intake storage", () => {
  it("creates fresh blank state and restores exact records without touching demo keys", () => {
    const storage = memory();
    storage.entries.set("old-demo", "keep");
    expect(readIntake(storage)).toEqual({ state: emptyIntakeState(), raw: null });
    const data = state();
    const raw = writeIntake(storage, data, null);
    expect(readIntake(storage)).toEqual({ state: data, raw });
    expect(storage.entries.get("old-demo")).toBe("keep");
    expect(storage.entries.get(intakeKey)).toBe(raw);
    expect(createBox("new")).toMatchObject({
      count: 0,
      confirmed: false,
      purchaseYen: "",
      inboundShippingYen: "0",
    });
  });
  it("rejects stale writers, including a deleted saved record", () => {
    const storage = memory();
    const raw = writeIntake(storage, state(), null);
    expect(() => writeIntake(storage, emptyIntakeState(), null)).toThrow("別の画面");
    storage.entries.delete(intakeKey);
    expect(() => writeIntake(storage, state(), raw)).toThrow("別の画面");
  });
  it("propagates read and quota errors without success or fallback reset", () => {
    const denied = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("must not write");
      },
    };
    expect(() => readIntake(denied)).toThrow("denied");
    expect(() => writeIntake(denied, state(), null)).toThrow("denied");
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeIntake(full, state(), null)).toThrow("quota");
  });
  it.each(["", "null", "{}", "broken", '{"version":2,"activeBoxId":null,"boxes":[]}'])(
    "rejects corrupt raw %s",
    (raw) => {
      expect(() => parseIntake(raw)).toThrow("保存内容");
      const storage = memory();
      storage.entries.set(intakeKey, raw);
      expect(() => writeIntake(storage, emptyIntakeState(), raw)).toThrow();
      expect(storage.entries.get(intakeKey)).toBe(raw);
    },
  );
  it("validates IDs, shape, bounds, item count and active box", () => {
    const mutations: ((data: IntakeState) => void)[] = [
      (data) => {
        data.activeBoxId = "missing";
      },
      (data) => {
        data.activeBoxId = null;
      },
      (data) => {
        data.boxes.push(data.boxes[0]!);
      },
      (data) => {
        data.boxes[0]!.count = 3;
      },
      (data) => {
        data.boxes[0]!.items[1]!.id = "box-1";
      },
      (data) => {
        data.boxes[0]!.items[0]!.name = "x".repeat(101);
      },
      (data) => {
        data.boxes[0]!.items[0]!.comparisons.push(data.boxes[0]!.items[0]!.comparisons[0]!);
      },
      (data) => {
        data.boxes[0]!.items[0]!.shippingYen = "x".repeat(21);
      },
    ];
    for (const change of mutations) {
      const data = state();
      change(data);
      expect(() => parseIntake(JSON.stringify(data))).toThrow();
    }
    expect(() => parseIntake(JSON.stringify({ ...state(), unexpected: true }))).toThrow();
  });
});

describe("count confirmation protects entered products", () => {
  it("keeps stable IDs, previous entries and original input unchanged", () => {
    const original = state().boxes[0]!;
    const expanded = confirmBox({ ...original, count: 3 });
    expect(expanded.items.map((item) => item.id)).toEqual(["box-1", "box-2", "box-3"]);
    expect(expanded.items[0]).toEqual(original.items[0]);
    expect(original.items).toHaveLength(2);
    expect(confirmBox({ ...expanded, count: 1 }).items).toHaveLength(1);
  });
  it.each([
    { name: "entered" },
    { brand: "brand" },
    { size: "L" },
    { condition: "wear" },
    { memo: "note" },
    { inspection: "hold" as const },
    { registered: true },
    { priceYen: "0" },
    { shippingYen: "0" },
    { feePercent: "0" },
    { packingYen: "1" },
    { comparisons: soldItem("x").comparisons },
  ])("refuses to remove any entered data %j", (fields) => {
    const box = state().boxes[0]!;
    box.items[1] = { ...box.items[1]!, ...fields };
    expect(() => confirmBox({ ...box, count: 1 })).toThrow("消える");
  });
  it.each([0, -1, 1.1, 10000, Infinity, NaN])("rejects invalid count %s", (count) => {
    expect(() => confirmBox({ ...createBox("box"), count })).toThrow();
  });
});

describe("manual evidence and cautious estimates", () => {
  // Build synthetic credentials explicitly: these are invalid test input, never real secrets.
  const credentialFixture = new URL("https://example.com");
  credentialFixture.username = "fixture-user";
  credentialFixture.password = "not-a-secret";
  it.each(["", " ", "-1", "1e3", "Infinity", "NaN", "1.5", "100000001", "1,000"])(
    "rejects non-yen amount %s",
    (value) => {
      expect(money(value)).toBeNull();
    },
  );
  it("accepts explicit zero and bounded integer yen", () => {
    expect(money("0")).toBe(0);
    expect(money("100000000")).toBe(100000000);
  });
  it.each([
    "http://example.com",
    "javascript:alert(1)",
    credentialFixture.href,
    "https://example.com:444/a",
    "https://localhost/a",
    "https://127.1/a",
    "https://10.0.0.1",
    "https://192.168.1.1",
    "https://172.16.0.1",
    "https://169.254.1.1",
    "https://[::1]",
    "https://example.com/\\bad",
  ])("blocks unsafe reference %s", (url) => {
    expect(safeReferenceUrl(url)).toBeNull();
  });
  it("accepts HTTPS pages without fetching and counts only distinct confirmed evidence", () => {
    expect(safeReferenceUrl("https://example.com:443/item")).toBe("https://example.com/item");
    const item = soldItem("x");
    const base = item.comparisons[0]!;
    item.comparisons.push(
      { ...base, id: "2", url: `${base.url}?track=x#photo`, priceYen: "1000" },
      { ...base, id: "3", url: "https://example.com/sold/2", priceYen: "2000" },
      {
        ...base,
        id: "4",
        url: "https://example.com/sold/3",
        priceYen: "9999",
        confirmedSold: false,
      },
      { ...base, id: "5", url: "https://localhost/item", priceYen: "1" },
      { ...base, id: "6", url: "https://example.com/sold/4", priceYen: "0" },
    );
    expect(comparisonsSummary(item)).toEqual({ count: 2, low: 1000, high: 2000, suggested: 1000 });
    expect(item.priceYen).toBe("1000");
    expect(comparisonsSummary(createItem("empty"))).toEqual({
      count: 0,
      low: null,
      high: null,
      suggested: null,
    });
  });
  it("requires light registration and condition only when sellable", () => {
    expect(itemRegistrationProblems(createItem("x"))).toHaveLength(2);
    expect(itemRegistrationProblems({ ...soldItem("x"), condition: "" })).toHaveLength(1);
    expect(
      itemRegistrationProblems({ ...soldItem("x"), inspection: "hold", condition: "" }),
    ).toEqual([]);
  });
  it("allocates every yen exactly and preserves negative gross", () => {
    const box = confirmBox({
      ...createBox("box"),
      count: 3,
      purchaseYen: "3001",
      inboundShippingYen: "1",
    });
    box.items = box.items.map((item) => soldItem(item.id));
    const results = box.items.map((_, index) => itemProfit(box, index)!);
    expect(results.map((result) => result.cost)).toEqual([1001, 1001, 1000]);
    expect(results.reduce((sum, result) => sum + result.cost, 0)).toBe(3002);
    expect(results[0]).toMatchObject({
      price: 1000,
      cost: 1001,
      fee: 100,
      shipping: 200,
      packing: 0,
      gross: -301,
      margin: -30.099999999999998,
    });
  });
  it("rounds fees up conservatively without floating point penny overcount", () => {
    const box = confirmBox({ ...createBox("b"), count: 1, purchaseYen: "0" });
    box.items[0] = { ...soldItem("b-1"), priceYen: "100", feePercent: "7.01" };
    expect(itemProfit(box, 0)?.fee).toBe(8);
    box.items[0].feePercent = "7.00";
    expect(itemProfit(box, 0)?.fee).toBe(7);
  });
  it("does not coerce missing costs to zero or calculate incomplete items", () => {
    const base = confirmBox({ ...createBox("b"), count: 1, purchaseYen: "100" });
    base.items[0] = soldItem("b-1");
    for (const patch of [
      { shippingYen: "" },
      { packingYen: "" },
      { feePercent: "" },
      { feePercent: "101" },
      { feePercent: "1.234" },
      { registered: false },
      { priceYen: "0" },
      { comparisons: [] },
      { inspection: "hold" as const },
      { inspection: "unchecked" as const },
    ])
      expect(itemProfit({ ...base, items: [{ ...base.items[0], ...patch }] }, 0)).toBeNull();
    expect(itemProfit({ ...base, purchaseYen: "" }, 0)).toBeNull();
    expect(itemProfit({ ...base, inboundShippingYen: "" }, 0)).toBeNull();
    expect(itemProfit(base, -1)).toBeNull();
    expect(itemProfit(base, 0.5)).toBeNull();
  });
  it("counts registered unsellable goods as a cost, not hypothetical revenue", () => {
    const box = confirmBox({
      ...createBox("b"),
      count: 1,
      purchaseYen: "900",
      inboundShippingYen: "100",
    });
    box.items[0] = {
      ...createItem("b-1"),
      name: "傷みあり",
      inspection: "unsellable",
      registered: true,
    };
    expect(itemProfit(box, 0)).toEqual({
      price: 0,
      cost: 1000,
      fee: 0,
      shipping: 0,
      packing: 0,
      gross: -1000,
      margin: null,
    });
    box.items[0].registered = false;
    expect(itemProfit(box, 0)).toBeNull();
  });
});
