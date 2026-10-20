export type Sale = {
  id: string;
  productId: string;
  productName: string;
  channel: string;
  soldOn: string;
  deadline: string;
  priceYen: number;
  costYen: number;
  feeYen: number;
  shippingYen: number;
  packingYen: number;
  stage: "unpacked" | "packed" | "shipped" | "paid";
  location: string;
};

export type Expense = {
  id: string;
  title: string;
  date: string;
  amountYen: number;
};

export type CommerceState = {
  version: 1;
  sales: Sale[];
  expenses: Expense[];
  locations: Record<string, string>;
};

// Independent of every intake/review key. No migration or synchronization.
export const commerceKey = "seller-workspace-commerce-v1";
const maxItems = 10_000;
const maxAmount = 100_000_000;
const stages: Sale["stage"][] = ["unpacked", "packed", "shipped", "paid"];
const saleKeys = [
  "id",
  "productId",
  "productName",
  "channel",
  "soldOn",
  "deadline",
  "priceYen",
  "costYen",
  "feeYen",
  "shippingYen",
  "packingYen",
  "stage",
  "location",
];

function fail(): never {
  throw new Error("売上・経費の記録が不正です。元の保存内容は変更していません。");
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    fail();
  return result;
}

function text(value: unknown, limit: number, empty = false): void {
  if (
    typeof value !== "string" ||
    value.length > limit ||
    (!empty && !value.trim()) ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    fail();
}

function amount(value: unknown, positive = false): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > maxAmount
  )
    fail();
}

function date(value: unknown): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) fail();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > (days[month - 1] ?? 0)) fail();
}

function validateSale(value: unknown): asserts value is Sale {
  const sale = record(value, saleKeys);
  text(sale.id, 128);
  text(sale.productId, 160);
  text(sale.productName, 200);
  text(sale.channel, 100);
  text(sale.location, 100, true);
  date(sale.soldOn);
  date(sale.deadline);
  if ((sale.deadline as string) < (sale.soldOn as string)) fail();
  amount(sale.priceYen, true);
  for (const key of ["costYen", "feeYen", "shippingYen", "packingYen"]) amount(sale[key]);
  if (!stages.includes(sale.stage as Sale["stage"])) fail();
}

function validateExpense(value: unknown): asserts value is Expense {
  const expense = record(value, ["id", "title", "date", "amountYen"]);
  text(expense.id, 128);
  text(expense.title, 200);
  date(expense.date);
  amount(expense.amountYen, true);
}

function validateState(value: unknown): asserts value is CommerceState {
  const state = record(value, ["version", "sales", "expenses", "locations"]);
  if (
    state.version !== 1 ||
    !Array.isArray(state.sales) ||
    !Array.isArray(state.expenses) ||
    state.sales.length > maxItems ||
    state.expenses.length > maxItems
  )
    fail();
  const saleIds = new Set<string>();
  const productIds = new Set<string>();
  for (const sale of state.sales) {
    validateSale(sale);
    if (saleIds.has(sale.id) || productIds.has(sale.productId)) fail();
    saleIds.add(sale.id);
    productIds.add(sale.productId);
  }
  const expenseIds = new Set<string>();
  for (const expense of state.expenses) {
    validateExpense(expense);
    if (expenseIds.has(expense.id)) fail();
    expenseIds.add(expense.id);
  }
  if (
    typeof state.locations !== "object" ||
    state.locations === null ||
    Array.isArray(state.locations) ||
    Object.keys(state.locations).length > maxItems
  )
    fail();
  const prototype: unknown = Object.getPrototypeOf(state.locations);
  if (prototype !== Object.prototype && prototype !== null) fail();
  for (const [id, location] of Object.entries(state.locations)) {
    locationId(id);
    text(location, 100, true);
  }
}

export function emptyCommerce(): CommerceState {
  return { version: 1, sales: [], expenses: [], locations: {} };
}

function locationId(id: unknown): void {
  text(id, 160);
  if (["__proto__", "prototype", "constructor"].includes(id as string)) fail();
}

export function setProductLocation(
  state: CommerceState,
  productId: string,
  location: string,
): CommerceState {
  validateState(state);
  locationId(productId);
  text(location, 100, true);
  const next = {
    ...state,
    locations: { ...state.locations, [productId]: location },
  };
  validateState(next);
  return next;
}

export function parseCommerce(raw: string | null): CommerceState {
  if (raw === null) return emptyCommerce();
  // Bound work before decoding; normal maximum-sized records fit below this limit.
  if (typeof raw !== "string" || raw.length > 25_000_000) fail();
  let state: unknown;
  try {
    state = JSON.parse(raw);
  } catch {
    fail();
  }
  validateState(state);
  return state;
}

/**
 * The caller must hold an origin-wide Web Lock around reread/edit/write.
 * The synchronous comparison detects stale snapshots, not cross-tab atomicity.
 */
export function writeCommerce(
  storage: Pick<Storage, "getItem" | "setItem">,
  state: CommerceState,
  expectedRaw: string | null,
): string {
  validateState(state);
  const current = storage.getItem(commerceKey);
  parseCommerce(current);
  if (current !== expectedRaw) {
    throw new Error("別の画面で記録が更新されました。再読み込みしてやり直してください。");
  }
  const raw = JSON.stringify(state);
  parseCommerce(raw);
  storage.setItem(commerceKey, raw);
  return raw;
}

export function addSale(state: CommerceState, sale: Sale): CommerceState {
  validateState(state);
  validateSale(sale);
  const next: CommerceState = { ...state, sales: [...state.sales, { ...sale }] };
  validateState(next);
  return next;
}

/** Explicit user correction; retain the sale's identity and shipping progress. */
export function amendSale(state: CommerceState, sale: Sale): CommerceState {
  validateState(state);
  validateSale(sale);
  const original = state.sales.find((item) => item.id === sale.id);
  if (!original || original.productId !== sale.productId || original.stage !== sale.stage) fail();
  const next = {
    ...state,
    sales: state.sales.map((item) => (item.id === sale.id ? { ...sale } : item)),
  };
  validateState(next);
  return next;
}

export function setSaleStage(
  state: CommerceState,
  id: string,
  stage: Sale["stage"],
): CommerceState {
  validateState(state);
  const sale = state.sales.find((item) => item.id === id);
  if (!sale || !stages.includes(stage)) fail();
  if (Math.abs(stages.indexOf(stage) - stages.indexOf(sale.stage)) > 1) fail();
  if (sale.stage === stage) return state;
  return {
    ...state,
    sales: state.sales.map((item) => (item.id === id ? { ...item, stage } : item)),
  };
}

export function advanceSale(state: CommerceState, id: string): CommerceState {
  validateState(state);
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) fail();
  return setSaleStage(state, id, stages[Math.min(stages.indexOf(sale.stage) + 1, 3)]!);
}

export function addExpense(state: CommerceState, expense: Expense): CommerceState {
  validateState(state);
  validateExpense(expense);
  const next: CommerceState = { ...state, expenses: [...state.expenses, { ...expense }] };
  validateState(next);
  return next;
}

export function removeExpense(state: CommerceState, id: string): CommerceState {
  validateState(state);
  if (!state.expenses.some((item) => item.id === id)) fail();
  return { ...state, expenses: state.expenses.filter((item) => item.id !== id) };
}

export function saleProfit(sale: Sale): number {
  validateSale(sale);
  return sale.priceYen - sale.costYen - sale.feeYen - sale.shippingYen - sale.packingYen;
}

export function monthlySummary(state: CommerceState, month: string) {
  validateState(state);
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) fail();
  date(`${month}-01`);
  const result = {
    revenue: 0,
    productProfit: 0,
    expenses: 0,
    netProfit: 0,
    cost: 0,
    fees: 0,
    shipping: 0,
    packing: 0,
    paidRevenue: 0,
    count: 0,
  };
  // Each array is bounded to 10,000, each amount to 100,000,000:
  // even combined signed totals remain well within safe integer precision.
  for (const sale of state.sales) {
    if (!sale.soldOn.startsWith(`${month}-`)) continue;
    result.count++;
    result.revenue += sale.priceYen;
    result.cost += sale.costYen;
    result.fees += sale.feeYen;
    result.shipping += sale.shippingYen;
    result.packing += sale.packingYen;
    result.productProfit += saleProfit(sale);
    if (sale.stage === "paid") result.paidRevenue += sale.priceYen;
  }
  for (const expense of state.expenses) {
    if (expense.date.startsWith(`${month}-`)) result.expenses += expense.amountYen;
  }
  result.netProfit = result.productProfit - result.expenses;
  return result;
}
