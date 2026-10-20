import { describe, expect, it, vi } from "vitest";
import {
  addExpense,
  addSale,
  amendSale,
  advanceSale,
  commerceKey,
  emptyCommerce,
  monthlySummary,
  parseCommerce,
  removeExpense,
  saleProfit,
  setProductLocation,
  setSaleStage,
  writeCommerce,
  type CommerceState,
  type Expense,
  type Sale,
} from "./sales-store";

const sale = (overrides: Partial<Sale> = {}): Sale => ({
  id: "sale-1",
  productId: "product-1",
  productName: "架空シャツ",
  channel: "手動記録",
  soldOn: "2026-10-20",
  deadline: "2026-10-22",
  priceYen: 5000,
  costYen: 1000,
  feeYen: 500,
  shippingYen: 210,
  packingYen: 50,
  stage: "unpacked",
  location: "",
  ...overrides,
});
const expense = (overrides: Partial<Expense> = {}): Expense => ({
  id: "expense-1",
  title: "架空経費",
  date: "2026-10-20",
  amountYen: 100,
  ...overrides,
});
const encoded = (entry: Sale = sale()) => JSON.stringify({ ...emptyCommerce(), sales: [entry] });

describe("strict commerce schema", () => {
  it("returns independent empty states only for missing storage", () => {
    const first = parseCommerce(null);
    first.sales.push(sale());
    expect(emptyCommerce().sales).toEqual([]);
    expect(parseCommerce(null)).toEqual(emptyCommerce());
    expect(parseCommerce(encoded()).sales).toEqual([sale()]);
  });

  it.each(["", "undefined", "null", "[]", "{", "1", '"text"'])(
    "does not replace corrupt JSON %s with empty data",
    (raw) => expect(() => parseCommerce(raw)).toThrow(),
  );

  it("rejects missing, extra, future-version and wrongly typed root fields", () => {
    for (const value of [
      {},
      { ...emptyCommerce(), version: 2 },
      { ...emptyCommerce(), extra: true },
      { ...emptyCommerce(), sales: {} },
      { ...emptyCommerce(), expenses: null },
      { version: 1, sales: [], expenses: [] },
    ])
      expect(() => parseCommerce(JSON.stringify(value))).toThrow();
  });

  it("rejects omitted and unknown sale/expense fields", () => {
    const missing = Object.fromEntries(
      Object.entries(sale()).filter(([key]) => key !== "location"),
    );
    expect(() => parseCommerce(encoded(missing as Sale))).toThrow();
    expect(() => parseCommerce(encoded({ ...sale(), extra: true } as Sale))).toThrow();
    const missingTitle = Object.fromEntries(
      Object.entries(expense()).filter(([key]) => key !== "title"),
    );
    expect(() => addExpense(emptyCommerce(), missingTitle as Expense)).toThrow();
    expect(() => addExpense(emptyCommerce(), { ...expense(), extra: true } as Expense)).toThrow();
  });

  it.each(["priceYen", "costYen", "feeYen", "shippingYen", "packingYen"] as const)(
    "validates numeric %s without coercion",
    (key) => {
      for (const invalid of [-1, 1.5, NaN, Infinity, 100_000_001, "1", null, undefined]) {
        expect(() => addSale(emptyCommerce(), sale({ [key]: invalid } as Partial<Sale>))).toThrow();
      }
      expect(() => addSale(emptyCommerce(), sale({ [key]: 100_000_000 }))).not.toThrow();
      if (key === "priceYen") {
        expect(() => addSale(emptyCommerce(), sale({ [key]: 0 }))).toThrow();
      } else {
        expect(() => addSale(emptyCommerce(), sale({ [key]: 0 }))).not.toThrow();
      }
    },
  );

  it("requires positive sale price and expense but permits zero costs and losses", () => {
    expect(() => addSale(emptyCommerce(), sale({ priceYen: 0 }))).toThrow();
    expect(saleProfit(sale({ priceYen: 1 }))).toBe(-1759);
    expect(saleProfit(sale({ costYen: 0, feeYen: 0, shippingYen: 0, packingYen: 0 }))).toBe(5000);
    for (const amountYen of [0, -1, 1.2, NaN, Infinity, 100_000_001]) {
      expect(() => addExpense(emptyCommerce(), expense({ amountYen }))).toThrow();
    }
  });

  it.each([
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "0000-01-01",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "2026-1-01",
    "2026-10-20T00:00:00Z",
  ])("rejects invalid calendar date %s", (value) => {
    expect(() => addSale(emptyCommerce(), sale({ soldOn: value }))).toThrow();
    expect(() => addSale(emptyCommerce(), sale({ deadline: value }))).toThrow();
    expect(() => addExpense(emptyCommerce(), expense({ date: value }))).toThrow();
  });

  it("accepts leap dates, same-day deadlines and year transitions", () => {
    for (const value of ["2000-02-29", "2024-02-29", "0001-01-01", "9999-12-31"]) {
      expect(() =>
        addSale(emptyCommerce(), sale({ soldOn: value, deadline: value })),
      ).not.toThrow();
    }
    expect(() =>
      addSale(emptyCommerce(), sale({ soldOn: "2026-12-31", deadline: "2027-01-01" })),
    ).not.toThrow();
    expect(() => addSale(emptyCommerce(), sale({ deadline: "2026-10-19" }))).toThrow();
  });

  it("bounds text, rejects blank required values/control characters and unknown stages", () => {
    for (const key of ["id", "productId", "productName", "channel"] as const) {
      for (const value of ["", " ", "x".repeat(201), "\n", 1]) {
        expect(() => addSale(emptyCommerce(), sale({ [key]: value } as Partial<Sale>))).toThrow();
      }
    }
    expect(() => addSale(emptyCommerce(), sale({ location: "x".repeat(101) }))).toThrow();
    expect(() => addSale(emptyCommerce(), sale({ stage: "other" as Sale["stage"] }))).toThrow();
  });

  it("rejects duplicate sale IDs, product IDs and expense IDs during parsing and mutation", () => {
    const state = addSale(emptyCommerce(), sale());
    for (const duplicate of [sale({ productId: "different" }), sale({ id: "different" })]) {
      expect(() => addSale(state, duplicate)).toThrow();
      expect(() =>
        parseCommerce(JSON.stringify({ ...state, sales: [...state.sales, duplicate] })),
      ).toThrow();
    }
    const withExpense = addExpense(state, expense());
    expect(() => addExpense(withExpense, expense())).toThrow();
    expect(() =>
      parseCommerce(JSON.stringify({ ...state, expenses: [expense(), expense()] })),
    ).toThrow();
  });

  it("bounds collection sizes before processing", () => {
    expect(() =>
      parseCommerce(JSON.stringify({ ...emptyCommerce(), sales: Array(10_001).fill(sale()) })),
    ).toThrow();
    expect(() =>
      parseCommerce(
        JSON.stringify({ ...emptyCommerce(), expenses: Array(10_001).fill(expense()) }),
      ),
    ).toThrow();
    expect(() => parseCommerce(" ".repeat(25_000_001))).toThrow();
  });
});

describe("record updates", () => {
  it("corrects sale amounts without duplicate sales or changed shipping identity", () => {
    const original = sale({ stage: "shipped" });
    const state = addSale(emptyCommerce(), original);
    const next = amendSale(state, { ...original, shippingYen: 700, soldOn: "2026-09-30" });
    expect(next.sales).toHaveLength(1);
    expect(next.sales[0]!.stage).toBe("shipped");
    expect(monthlySummary(next, "2026-10").revenue).toBe(0);
    expect(monthlySummary(next, "2026-09").shipping).toBe(700);
    expect(state.sales[0]!.shippingYen).toBe(210);
    expect(() => amendSale(state, { ...original, stage: "paid" })).toThrow();
    expect(() => amendSale(state, { ...original, productId: "other" })).toThrow();
    expect(() => amendSale(state, { ...original, id: "other" })).toThrow();
  });
  it("advances each stage, keeps paid terminal and permits only single-step corrections", () => {
    let state = addSale(emptyCommerce(), sale());
    for (const stage of ["packed", "shipped", "paid"] as const) {
      state = advanceSale(state, "sale-1");
      expect(state.sales[0]!.stage).toBe(stage);
    }
    expect(advanceSale(state, "sale-1")).toBe(state);
    expect(setSaleStage(state, "sale-1", "shipped").sales[0]!.stage).toBe("shipped");
    expect(() => setSaleStage(state, "sale-1", "packed")).toThrow();
    expect(() => setSaleStage(state, "sale-1", "other" as Sale["stage"])).toThrow();
    expect(() => advanceSale(state, "absent")).toThrow();
    expect(() => setSaleStage(state, "absent", "paid")).toThrow();
    expect(() => setSaleStage(addSale(emptyCommerce(), sale()), "sale-1", "paid")).toThrow();
  });

  it("does not mutate source states or incoming records", () => {
    const original = emptyCommerce();
    const input = sale();
    const next = addSale(original, input);
    input.productName = "changed";
    expect(next.sales[0]!.productName).toBe("架空シャツ");
    expect(original.sales).toEqual([]);
    const inputExpense = expense();
    const withExpense = addExpense(next, inputExpense);
    inputExpense.title = "changed";
    expect(withExpense.expenses[0]!.title).toBe("架空経費");
    expect(removeExpense(withExpense, "expense-1").expenses).toEqual([]);
    expect(withExpense.expenses).toHaveLength(1);
    expect(() => removeExpense(withExpense, "absent")).toThrow();
  });

  it("stores product locations independently from sale snapshots", () => {
    const state = addSale(emptyCommerce(), sale({ location: "棚A" }));
    const next = setProductLocation(state, "product-1", "棚B");
    expect(next.locations["product-1"]).toBe("棚B");
    expect(state.locations).toEqual({});
    expect(next.sales[0]!.location).toBe("棚A");
    expect(setProductLocation(next, "product-1", "").locations["product-1"]).toBe("");
    expect(parseCommerce(JSON.stringify(next))).toEqual(next);
  });

  it("rejects dangerous, oversized or invalid locations without prototype pollution", () => {
    for (const id of ["__proto__", "constructor", "prototype", "", "x".repeat(161)]) {
      expect(() => setProductLocation(emptyCommerce(), id, "棚")).toThrow();
    }
    for (const locations of [
      [],
      null,
      { x: 1 },
      { x: "x".repeat(101) },
      JSON.parse('{"__proto__":"棚"}'),
      Object.fromEntries(Array.from({ length: 10_001 }, (_, i) => [`p${i}`, "棚"])),
    ])
      expect(() => parseCommerce(JSON.stringify({ ...emptyCommerce(), locations }))).toThrow();
    const inherited = Object.create({ hidden: "棚" }) as Record<string, string>;
    expect(() =>
      setProductLocation({ ...emptyCommerce(), locations: inherited }, "p", "棚"),
    ).toThrow();
  });
});

describe("guarded independent storage", () => {
  function memory(raw: string | null = null) {
    const entries = new Map<string, string>([["old-intake-key", "untouched"]]);
    if (raw !== null) entries.set(commerceKey, raw);
    return {
      entries,
      getItem: vi.fn((key: string) => entries.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        entries.set(key, value);
      }),
    };
  }
  it("compares the exact prior raw value and touches only its new key", () => {
    const storage = memory();
    const state = addSale(emptyCommerce(), sale());
    const raw = writeCommerce(storage, state, null);
    expect(parseCommerce(raw)).toEqual(state);
    expect(storage.entries.get("old-intake-key")).toBe("untouched");
    expect(storage.getItem).toHaveBeenCalledWith(commerceKey);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(writeCommerce(storage, state, raw)).toBe(raw);
  });
  it("refuses stale snapshots including externally removed records", () => {
    const raw = encoded();
    for (const [current, expected] of [
      [raw, null],
      [null, raw],
      [raw, `${raw} `],
    ]) {
      const storage = memory(current ?? null);
      expect(() => writeCommerce(storage, emptyCommerce(), expected ?? null)).toThrow();
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });
  it("refuses corrupt current storage even with a matching snapshot", () => {
    const storage = memory("broken");
    expect(() => writeCommerce(storage, emptyCommerce(), "broken")).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("propagates access/quota failures and never reports a successful save", () => {
    const quota = new Error("quota");
    const storage = memory();
    storage.setItem.mockImplementation(() => {
      throw quota;
    });
    expect(() => writeCommerce(storage, emptyCommerce(), null)).toThrow(quota);
    expect(storage.entries.has(commerceKey)).toBe(false);
    storage.getItem.mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writeCommerce(storage, emptyCommerce(), null)).toThrow("denied");
  });
  it("rejects an invalid new state before writing", () => {
    const storage = memory();
    expect(() =>
      writeCommerce(storage, { ...emptyCommerce(), version: 2 } as unknown as CommerceState, null),
    ).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("monthly reporting", () => {
  it("uses sale dates, independent expense dates, and paid-only revenue", () => {
    let state = addSale(emptyCommerce(), sale({ deadline: "2026-11-01" }));
    state = addSale(state, sale({ id: "s2", productId: "p2", stage: "paid" }));
    state = addSale(
      state,
      sale({ id: "s3", productId: "p3", soldOn: "2025-10-20", stage: "paid" }),
    );
    state = addExpense(state, expense());
    state = addExpense(state, expense({ id: "e2", date: "2026-11-01", amountYen: 300 }));
    expect(monthlySummary(state, "2026-10")).toEqual({
      revenue: 10000,
      productProfit: 6480,
      expenses: 100,
      netProfit: 6380,
      cost: 2000,
      fees: 1000,
      shipping: 420,
      packing: 100,
      paidRevenue: 5000,
      count: 2,
    });
    expect(monthlySummary(state, "2026-11").netProfit).toBe(-300);
    expect(monthlySummary(state, "2025-10").count).toBe(1);
    expect(monthlySummary(state, "2027-10").count).toBe(0);
    expect(monthlySummary(emptyCommerce(), "2026-10").netProfit).toBe(0);
  });
  it.each(["2026", "2026-1", "2026-00", "2026-13", "0000-01", "2026-10-01", " 2026-10"])(
    "rejects invalid month %s",
    (month) => expect(() => monthlySummary(emptyCommerce(), month)).toThrow(),
  );
  it("safely sums maximum bounded amounts, including negative totals", () => {
    const state = emptyCommerce();
    state.sales = Array.from({ length: 10_000 }, (_, i) =>
      sale({
        id: `s${i}`,
        productId: `p${i}`,
        priceYen: 1,
        costYen: 100_000_000,
        feeYen: 100_000_000,
        shippingYen: 100_000_000,
        packingYen: 100_000_000,
      }),
    );
    state.expenses = Array.from({ length: 10_000 }, (_, i) =>
      expense({ id: `e${i}`, amountYen: 100_000_000 }),
    );
    const report = monthlySummary(state, "2026-10");
    expect(report.netProfit).toBe(-4_999_999_990_000);
    expect(Number.isSafeInteger(report.netProfit)).toBe(true);
  });
});
