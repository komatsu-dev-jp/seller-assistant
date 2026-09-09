import type {
  PutawayCatalogResponse,
  WorkspaceRole,
  ReturnCatalogResponse,
} from "@resale/contracts";
import { parseInventoryLookup, shortInventoryNumber } from "./inventory-label";

export function inventoryStateLabel(state: string) {
  return (
    (
      {
        putaway_pending: "場所登録待ち",
        available: "在庫あり",
        reserved: "注文に割当済み",
        picked: "取り出し済み",
        packed: "梱包済み",
        shipped: "発送済み",
        return_pending: "返品確認待ち",
        quarantined: "返品を別場所で保管",
        disposal_pending: "廃棄候補・未確定",
        disposed: "廃棄済み",
        missing_candidate: "不足候補・復元可能",
        lost: "不足候補・復元可能",
      } as Record<string, string>
    )[state] ?? "状態を確認してください"
  );
}

export function isReturnQuarantineLocation(place: {
  canStoreInventory: boolean;
  purpose?: string | undefined;
}) {
  return place.canStoreInventory && place.purpose === "return_quarantine";
}

export function createPrivateInventoryPhotoSession(options: {
  url: string | null | undefined;
  workspaceId: string;
  origin: string;
  onChange: (state: { url: string | null; message: string }) => void;
  fetchImage: typeof fetch;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
}) {
  let generation = 0;
  let controller: AbortController | null = null;
  let objectUrl: string | null = null;
  let disposed = false;
  function conceal() {
    generation += 1;
    controller?.abort();
    controller = null;
    if (objectUrl) options.revokeObjectUrl(objectUrl);
    objectUrl = null;
    options.onChange({ url: null, message: "写真は非表示です。表示時に権限を再確認します。" });
  }
  async function load() {
    if (disposed) return;
    conceal();
    const current = generation;
    const url = options.url;
    if (!url) {
      options.onChange({ url: null, message: "写真は未登録です。現物を確認してください。" });
      return;
    }
    if (!isPrivateInventoryPhotoUrl(url, options.workspaceId, options.origin)) {
      options.onChange({ url: null, message: "安全な写真の保存先を確認できません。" });
      return;
    }
    controller = new AbortController();
    options.onChange({ url: null, message: "写真を安全に読み込んでいます。" });
    try {
      const response = await options.fetchImage(url, {
        cache: "no-store",
        redirect: "error",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? "写真の表示権限を確認できません。再ログインまたは担当を確認してください。"
            : "写真を取得できませんでした。",
        );
      if (!response.headers.get("content-type")?.startsWith("image/"))
        throw new Error("安全な写真データを取得できません。");
      const blob = await response.blob();
      if (disposed || current !== generation) return;
      objectUrl = options.createObjectUrl(blob);
      options.onChange({
        url: objectUrl,
        message: "非公開の写真です。現物と照らし合わせてください。",
      });
    } catch (reason) {
      if (!disposed && current === generation)
        options.onChange({
          url: null,
          message: reason instanceof Error ? reason.message : "写真を取得できません。",
        });
    }
  }
  return {
    load,
    conceal,
    dispose: () => {
      disposed = true;
      conceal();
    },
  };
}

export function isPrivateInventoryPhotoUrl(value: string, workspaceId: string, origin: string) {
  try {
    const parsed = new URL(value, origin);
    return (
      value.startsWith(`/v1/workspaces/${workspaceId}/`) &&
      parsed.origin === origin &&
      parsed.pathname.startsWith(`/v1/workspaces/${workspaceId}/`) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export function assertReturnSnapshot(
  expected: ReturnCatalogResponse["orders"][number],
  current: ReturnCatalogResponse["orders"][number] | undefined,
) {
  const fields = [
    "orderId",
    "orderState",
    "inventoryUnitId",
    "inventoryStatus",
    "inventoryNumber",
    "inventoryLabelVersion",
    "movementSequence",
    "locationId",
    "locationCode",
    "locationLabelVersion",
    "quarantined",
  ] as const;
  if (!current || fields.some((field) => current[field] !== expected[field]))
    throw new Error("返品の状態が更新されています。最新一覧から選び直してください。");
}

export function validateReturnInventoryNumber(
  value: string,
  order: ReturnCatalogResponse["orders"][number],
) {
  const lookup = parseInventoryLookup(value);
  if (
    !lookup ||
    order.inventoryLabelVersion === null ||
    (lookup.kind === "short"
      ? Number(lookup.shortNumber) !== Number(shortInventoryNumber(order.inventoryNumber))
      : lookup.inventoryNumber !== order.inventoryNumber) ||
    (lookup.kind === "barcode" && lookup.labelVersion !== order.inventoryLabelVersion)
  )
    throw new Error("対象の現在の商品番号・ラベル版を確認してください。");
}

export function selectedInventoryLabels<T extends { inventoryUnitId: string }>(
  items: T[],
  selectedIds: string[],
): T[] {
  const selected = new Set(selectedIds);
  return items.filter((item) => selected.has(item.inventoryUnitId));
}

export function inventoryFooterLinks(role: WorkspaceRole) {
  return [
    ["ホーム", "/"],
    ["作業", "/mobile"],
    ["商品", "/workflow"],
    ["在庫", "/inventory"],
    ["会計", "/accounting"],
  ].map(([label, href]) => ({
    label: label!,
    href: role === "field_worker" && label !== "作業" ? null : href!,
  }));
}

export function resolveInventoryCatalog(
  value: string,
  inventory: PutawayCatalogResponse["inventory"],
) {
  const lookup = parseInventoryLookup(value);
  if (!lookup) throw new Error("商品番号または有効なバーコードを入力してください。");
  const matches = inventory.filter((entry) =>
    lookup.kind === "short"
      ? Number(shortInventoryNumber(entry.inventoryNumber)) === Number(lookup.shortNumber)
      : entry.inventoryNumber === lookup.inventoryNumber,
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "同じ番号が複数あります。管理担当に確認してください。"
        : "有効な未格納の商品が見つかりません。番号を確認してください。",
    );
  const match = matches[0]!;
  if (lookup.kind === "barcode" && lookup.labelVersion !== match.labelVersion)
    throw new Error("古い商品ラベルです。現在のラベルを確認してください。");
  return match;
}

export function resolvePutawayLocationCatalog(
  code: string,
  locations: PutawayCatalogResponse["locations"],
) {
  const matches = locations.filter((entry) => entry.code === code);
  if (matches.length !== 1)
    throw new Error("有効な保管場所を一つに確認できません。場所番号を確認してください。");
  const match = matches[0]!;
  if (match.purpose !== "general")
    throw new Error(
      "この場所は通常の商品格納には使えません。返品専用ではない通常の保管場所を選んでください。",
    );
  return match;
}

export function assertStocktakeChallengeTarget(boundId: string, activeId: string | null) {
  if (boundId !== activeId)
    throw new Error("棚卸対象が変わりました。現在の棚卸で最初から再確認してください。");
}

export function validateStocktakeScanTimes(inventoryTime: string, locationTime: string) {
  if (
    !Number.isFinite(Date.parse(inventoryTime)) ||
    !Number.isFinite(Date.parse(locationTime)) ||
    Date.parse(locationTime) <= Date.parse(inventoryTime)
  )
    throw new Error("商品番号と場所番号を順番に再確認してください。");
}
