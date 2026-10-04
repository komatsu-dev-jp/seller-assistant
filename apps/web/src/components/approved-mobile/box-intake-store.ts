export interface SoldComparison {
  id: string;
  url: string;
  priceYen: string;
  confirmedSold: boolean;
  note: string;
}

export interface IntakeItem {
  id: string;
  name: string;
  brand: string;
  size: string;
  condition: string;
  inspection: "unchecked" | "sellable" | "hold" | "unsellable";
  memo: string;
  comparisons: SoldComparison[];
  priceYen: string;
  feePercent: string;
  shippingYen: string;
  packingYen: string;
  registered: boolean;
}

export interface IntakeBox {
  id: string;
  name: string;
  count: number;
  confirmed: boolean;
  purchaseYen: string;
  inboundShippingYen: string;
  items: IntakeItem[];
}

export interface IntakeState {
  version: 1;
  activeBoxId: string | null;
  boxes: IntakeBox[];
}

// Independent from every existing review/demo key. Never migrate or clear those keys.
export const intakeKey = "resale-box-intake-browser-v1";
export const emptyIntakeState = (): IntakeState => ({ version: 1, activeBoxId: null, boxes: [] });
export const createBox = (id: string, name = ""): IntakeBox => ({
  id,
  name,
  count: 0,
  confirmed: false,
  purchaseYen: "",
  inboundShippingYen: "0",
  items: [],
});
export const createItem = (id: string): IntakeItem => ({
  id,
  name: "",
  brand: "",
  size: "",
  condition: "",
  inspection: "unchecked",
  memo: "",
  comparisons: [],
  priceYen: "",
  feePercent: "10",
  shippingYen: "",
  packingYen: "0",
  registered: false,
});

export function confirmBox(box: IntakeBox): IntakeBox {
  if (!Number.isInteger(box.count) || box.count < 1 || box.count > 9999) {
    throw new Error("点数は1〜9999の整数で入力してください。");
  }
  const entered = (item: IntakeItem) => {
    const empty = createItem(item.id);
    return (Object.keys(empty) as (keyof IntakeItem)[]).some((key) =>
      key === "comparisons" ? item.comparisons.length > 0 : item[key] !== empty[key],
    );
  };
  if (box.items.slice(box.count).some(entered)) {
    throw new Error("入力済みの商品が消えるため、点数を減らせません。");
  }
  return {
    ...box,
    confirmed: true,
    items: Array.from(
      { length: box.count },
      (_, index) => box.items[index] ?? createItem(`${box.id}-${index + 1}`),
    ),
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const textWithin = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length <= limit;
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const unique = (ids: string[]) => new Set(ids).size === ids.length;

function validComparison(value: unknown): value is SoldComparison {
  return (
    record(value) &&
    exact(value, ["id", "url", "priceYen", "confirmedSold", "note"]) &&
    validId(value.id) &&
    textWithin(value.url, 1500) &&
    textWithin(value.priceYen, 20) &&
    typeof value.confirmedSold === "boolean" &&
    textWithin(value.note, 1000)
  );
}
function validItem(value: unknown): value is IntakeItem {
  return (
    record(value) &&
    exact(value, Object.keys(createItem("template"))) &&
    validId(value.id) &&
    textWithin(value.name, 100) &&
    textWithin(value.brand, 100) &&
    textWithin(value.size, 50) &&
    textWithin(value.condition, 500) &&
    textWithin(value.memo, 2000) &&
    typeof value.inspection === "string" &&
    ["unchecked", "sellable", "hold", "unsellable"].includes(value.inspection) &&
    typeof value.registered === "boolean" &&
    [value.priceYen, value.feePercent, value.shippingYen, value.packingYen].every((v) =>
      textWithin(v, 20),
    ) &&
    Array.isArray(value.comparisons) &&
    value.comparisons.length <= 100 &&
    value.comparisons.every(validComparison) &&
    unique(value.comparisons.map((v) => v.id))
  );
}
function validBox(value: unknown): value is IntakeBox {
  return (
    record(value) &&
    exact(value, Object.keys(createBox("template"))) &&
    validId(value.id) &&
    textWithin(value.name, 100) &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 0 &&
    value.count <= 9999 &&
    typeof value.confirmed === "boolean" &&
    textWithin(value.purchaseYen, 20) &&
    textWithin(value.inboundShippingYen, 20) &&
    Array.isArray(value.items) &&
    value.items.every(validItem) &&
    unique(value.items.map((v) => v.id)) &&
    (value.confirmed
      ? value.count > 0 && value.items.length === value.count
      : value.items.length === 0)
  );
}

export function parseIntake(raw: string | null): IntakeState {
  if (raw === null) return emptyIntakeState();
  try {
    if (raw.length > 20000000) throw new Error();
    const value: unknown = JSON.parse(raw);
    if (
      !record(value) ||
      !exact(value, ["version", "activeBoxId", "boxes"]) ||
      value.version !== 1 ||
      !Array.isArray(value.boxes) ||
      value.boxes.length > 100 ||
      !value.boxes.every(validBox) ||
      !unique(value.boxes.map((box) => box.id)) ||
      !unique(value.boxes.flatMap((box) => box.items.map((item) => item.id))) ||
      value.boxes.reduce((sum, box) => sum + box.items.length, 0) > 20000 ||
      !(
        (value.activeBoxId === null && value.boxes.length === 0) ||
        (validId(value.activeBoxId) && value.boxes.some((box) => box.id === value.activeBoxId))
      )
    ) {
      throw new Error();
    }
    return value as unknown as IntakeState;
  } catch {
    throw new Error("保存内容を読み取れません。元の保存内容は変更していません。");
  }
}

export function readIntake(storage: { getItem(key: string): string | null }): {
  state: IntakeState;
  raw: string | null;
} {
  const raw = storage.getItem(intakeKey);
  return { state: parseIntake(raw), raw };
}

// Caller must hold intakeWriteLock. The expectedRaw check additionally detects
// deletion, external edits, or stale state; it is not itself a cross-tab mutex.
export function writeIntake(
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void },
  state: IntakeState,
  expectedRaw: string | null,
): string {
  const current = storage.getItem(intakeKey);
  if (current !== expectedRaw)
    throw new Error("別の画面で保存内容が変わりました。再読み込みして確認してください。");
  parseIntake(current); // Never replace an unreadable record, even with a matching expected value.
  const raw = JSON.stringify(state);
  parseIntake(raw);
  storage.setItem(intakeKey, raw);
  return raw;
}

export function money(value: string): number | null {
  if (!/^[0-9]{1,9}$/.test(value)) return null;
  const result = Number(value);
  return result <= 100000000 ? result : null;
}

export function safeReferenceUrl(value: string): string | null {
  if (
    !value ||
    value.length > 1500 ||
    value !== value.trim() ||
    value.includes("\\") ||
    [...value].some((char) => char.charCodeAt(0) <= 32)
  )
    return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      !host.includes(".")
    )
      return null;
    if (host.startsWith("[")) return null; // IPv6 literals are not needed as resale reference pages.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a = 0, b = 0] = host.split(".").map(Number);
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 198 && (b === 18 || b === 19))
      )
        return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function comparisonsSummary(item: IntakeItem): {
  count: number;
  low: number | null;
  high: number | null;
  suggested: number | null;
} {
  const prices = new Map<string, number>();
  for (const comparison of item.comparisons) {
    const safe = safeReferenceUrl(comparison.url);
    const price = money(comparison.priceYen);
    if (!comparison.confirmedSold || !safe || price === null || price <= 0) continue;
    const url = new URL(safe);
    url.search = "";
    url.hash = "";
    // Conflicting duplicate observations use the lower value, never inflate evidence count.
    prices.set(url.href, Math.min(prices.get(url.href) ?? price, price));
  }
  const values = [...prices.values()];
  const low = values.length ? Math.min(...values) : null;
  return {
    count: values.length,
    low,
    high: values.length ? Math.max(...values) : null,
    suggested: low,
  };
}

export function itemRegistrationProblems(item: IntakeItem): string[] {
  const problems: string[] = [];
  if (!item.name.trim() || item.name.length > 100)
    problems.push("商品名を1〜100文字で入力してください。");
  if (!["sellable", "hold", "unsellable"].includes(item.inspection))
    problems.push("検品結果を選んでください。");
  if (item.inspection === "sellable" && !item.condition.trim())
    problems.push("販売できる商品の状態を入力してください。");
  if (
    item.brand.length > 100 ||
    item.size.length > 50 ||
    item.condition.length > 500 ||
    item.memo.length > 2000
  )
    problems.push(
      "ブランド100文字・サイズ50文字・状態500文字・メモ2000文字以内で入力してください。",
    );
  return problems;
}

export function itemProfit(
  box: IntakeBox,
  itemIndex: number,
): {
  price: number;
  cost: number;
  fee: number;
  shipping: number;
  packing: number;
  gross: number;
  margin: number | null;
} | null {
  const item = box.items[itemIndex];
  const purchase = money(box.purchaseYen);
  const inbound = money(box.inboundShippingYen);
  if (
    !box.confirmed ||
    !Number.isInteger(box.count) ||
    box.count < 1 ||
    box.count > 9999 ||
    box.items.length !== box.count ||
    !Number.isInteger(itemIndex) ||
    !item ||
    !item.registered ||
    itemRegistrationProblems(item).length ||
    purchase === null ||
    inbound === null
  )
    return null;
  const total = purchase + inbound;
  const cost = Math.floor(total / box.count) + (itemIndex < total % box.count ? 1 : 0);
  if (item.inspection === "unsellable")
    return { price: 0, cost, fee: 0, shipping: 0, packing: 0, gross: -cost, margin: null };
  if (item.inspection !== "sellable" || comparisonsSummary(item).count === 0) return null;
  const price = money(item.priceYen);
  const shipping = money(item.shippingYen);
  const packing = money(item.packingYen);
  if (
    price === null ||
    price <= 0 ||
    shipping === null ||
    packing === null ||
    !/^[0-9]{1,3}(?:\.[0-9]{1,2})?$/.test(item.feePercent) ||
    Number(item.feePercent) > 100
  )
    return null;
  // Round the fee UP to whole yen, using integer basis points to avoid floating-point artifacts.
  const basisPoints = Math.round(Number(item.feePercent) * 100);
  const fee = Math.ceil((price * basisPoints) / 10000);
  const gross = price - cost - fee - shipping - packing;
  return { price, cost, fee, shipping, packing, gross, margin: (gross / price) * 100 };
}
