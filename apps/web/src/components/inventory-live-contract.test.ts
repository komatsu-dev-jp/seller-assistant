import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { appendCodeCheckDigit, type PutawayCatalogResponse } from "@resale/contracts";
import {
  inventoryFooterLinks,
  resolveInventoryCatalog,
  resolvePutawayLocationCatalog,
  assertStocktakeChallengeTarget,
  validateStocktakeScanTimes,
  selectedInventoryLabels,
  assertReturnSnapshot,
  validateReturnInventoryNumber,
  isPrivateInventoryPhotoUrl,
  createPrivateInventoryPhotoSession,
  isReturnQuarantineLocation,
} from "../lib/inventory-live-safety";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("inventory live stages", () => {
  it("blocks quarantine and legacy locations before normal putaway confirmation", () => {
    const place = { code: appendCodeCheckDigit("ROOM-A"), name: "通常棚", labelVersion: 1 };
    const general = { ...place, purpose: "general" as const };
    expect(resolvePutawayLocationCatalog(place.code, [general])).toEqual(general);
    expect(() =>
      resolvePutawayLocationCatalog(place.code, [{ ...place, purpose: "return_quarantine" }]),
    ).toThrow("通常の保管場所を選んでください");
    const legacyLocations = [place] as unknown as PutawayCatalogResponse["locations"];
    expect(() => resolvePutawayLocationCatalog(place.code, legacyLocations)).toThrow(
      "通常の商品格納には使えません",
    );
    expect(() =>
      resolvePutawayLocationCatalog(place.code, [
        general,
        { ...place, purpose: "return_quarantine" },
      ]),
    ).toThrow();
    expect(() => resolvePutawayLocationCatalog(place.code, [])).toThrow();
    const source = read("./mobile-scan-workflow.tsx");
    const guard = source.indexOf("match = resolvePutawayLocationCatalog(");
    const confirmation = source.indexOf('setStep("confirm")', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(confirmation).toBeGreaterThan(guard);
    expect(source.slice(guard, confirmation)).toMatch(
      /catch \(reason\)[\s\S]*setError\([\s\S]*return;/u,
    );
  });
  it("separates inventory purposes without replacing server reads and writes", () => {
    const source = read("./inventory-workspace.tsx");
    expect(source).toContain("data-stage={stage}");
    for (const stage of ["items", "locations", "photos", "create"])
      expect(source).toContain(`"${stage}"`);
    expect(source).toContain("/inventory/summary");
    expect(source).toContain("/photo-review-queue");
    expect(source).toContain("humanApproved: true");
    const css = read("./inventory-live.module.css");
    expect(css).toContain('.workspace:not([data-stage="items"])');
    expect(css).toContain(".stocktakeMobilePanel");
    expect(css).toContain(":not(:global(.isActive))");
  });

  it("defaults to handwritten internal numbers and keeps print optional", () => {
    const source = read("./inventory-label-workspace.tsx");
    expect(source).toContain('useState<"manual" | "barcode">("manual")');
    expect(source).toContain("自社内部コード（このアプリ専用）");
    expect(source).toContain('labelMode === "barcode" ?');
    expect(source).toContain("window.print()");
    expect(source).toContain("item.inventoryLabelVersion");
  });

  it("preserves two real scan times, version checks, human confirmation and offline saving", () => {
    const source = read("./mobile-scan-workflow.tsx");
    expect(source).toContain("setInventoryScannedAt(new Date().toISOString())");
    expect(source).toContain("setLocationScannedAt(new Date().toISOString())");
    expect(source).toContain("resolveInventoryCatalog(normalized, catalog?.inventory ?? [])");
    expect(source).toContain("savePutawayOnlineFirst(operation)");
    expect(source).toContain("一致を確認して保存");
    expect(source).toContain("競合時は自動上書きしません");
    expect(source).toContain("<details>");
    expect(inventoryFooterLinks("owner").map((entry) => entry.label)).toEqual([
      "ホーム",
      "作業",
      "商品",
      "在庫",
      "会計",
    ]);
    expect(source).not.toMatch(/9:41|Dynamic Island/);
    expect(read("./inventory-live.module.css")).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps stocktake confirmation and irreversible-action boundaries", () => {
    const source = read("./stocktake-workspace.tsx");
    expect(source).toContain("HoldToConfirmButton");
    expect(source).toContain("hasOnlyApprovalReadyDiscrepancies");
    expect(source).toContain("isApprovalActorEligible");
    expect(source).toContain("別担当者でログインし");
    expect(source).toContain("clearTimers");
    expect(source).not.toContain("/disposal/confirm");
  });

  it("resolves handwritten/full/barcode values uniquely and rejects absent/ambiguous/stale values", () => {
    const entry = {
      inventoryNumber: appendCodeCheckDigit("INV-000001"),
      labelVersion: 2,
      status: "putaway_pending" as const,
    };
    expect(resolveInventoryCatalog("0001", [entry])).toEqual(entry);
    expect(resolveInventoryCatalog(entry.inventoryNumber, [entry])).toEqual(entry);
    expect(resolveInventoryCatalog(`RESALE|${entry.inventoryNumber}|V2`, [entry])).toEqual(entry);
    expect(() => resolveInventoryCatalog("0001", [])).toThrow("見つかりません");
    expect(() => resolveInventoryCatalog("0001", [entry, entry])).toThrow("複数");
    expect(() => resolveInventoryCatalog(`RESALE|${entry.inventoryNumber}|V1`, [entry])).toThrow(
      "古い",
    );
    expect(() => resolveInventoryCatalog("INV-000001-0", [entry])).toThrow();
  });

  it("keeps five footer labels but removes unauthorized destinations for field workers", () => {
    const links = inventoryFooterLinks("field_worker");
    expect(links).toHaveLength(5);
    expect(links.filter((entry) => entry.href)).toEqual([{ label: "作業", href: "/mobile" }]);
    expect(inventoryFooterLinks("owner").every((entry) => entry.href)).toBe(true);
    expect(inventoryFooterLinks("inventory_manager").every((entry) => entry.href)).toBe(true);
  });

  it("rejects changed stocktake targets during the hold-to-confirm race", async () => {
    let active: string | null = "first";
    const bound = active;
    await Promise.resolve().then(() => {
      active = "second";
    });
    expect(() => assertStocktakeChallengeTarget(bound, active)).toThrow("棚卸対象が変わりました");
    expect(() => assertStocktakeChallengeTarget(bound, null)).toThrow();
    expect(() => assertStocktakeChallengeTarget(bound, bound)).not.toThrow();
  });

  it("requires separately ordered scan confirmations and clears initial label selection", () => {
    const first = "2026-09-09T01:00:00.000Z";
    const second = "2026-09-09T01:00:03.000Z";
    expect(() => validateStocktakeScanTimes(first, second)).not.toThrow();
    expect(() => validateStocktakeScanTimes(first, first)).toThrow();
    expect(() => validateStocktakeScanTimes(second, first)).toThrow();
    expect(() => validateStocktakeScanTimes("", second)).toThrow();
    const source = read("./inventory-label-workspace.tsx");
    expect(source).toContain("setSelectedIds([])");
    expect(source).not.toContain("printable.slice");
    expect(source).toContain("useState<string[]>([])");
    expect(source).toContain("disabled={selectedItems.length === 0}");
    const loadedItems = [{ inventoryUnitId: "one" }, { inventoryUnitId: "two" }];
    expect(selectedInventoryLabels(loadedItems, [])).toEqual([]);
    expect(selectedInventoryLabels(loadedItems, ["two"])).toEqual([{ inventoryUnitId: "two" }]);
    expect(selectedInventoryLabels(loadedItems, ["missing"])).toEqual([]);
  });

  it("rejects external and path-traversing private image addresses", () => {
    const origin = "http://127.0.0.1:3000";
    expect(isPrivateInventoryPhotoUrl("/v1/workspaces/demo/photo/content", "demo", origin)).toBe(
      true,
    );
    for (const url of [
      "https://outside.example/photo",
      "//outside.example/photo",
      "/v1/workspaces/other/photo",
      "/v1/workspaces/demo/../../other/photo",
    ])
      expect(isPrivateInventoryPhotoUrl(url, "demo", origin)).toBe(false);
    const source = read("../lib/inventory-live-safety.ts");
    expect(source).toContain("response.status === 401 || response.status === 403");
    expect(source).toContain('redirect: "error"');
  });

  it("rejects return catalog races and requires the selected current item label", () => {
    const order = {
      orderId: "order",
      orderNumber: "R1",
      orderState: "returned" as const,
      skuId: "sku",
      title: "架空商品",
      inventoryUnitId: "unit",
      inventoryNumber: appendCodeCheckDigit("INV-000001"),
      inventoryStatus: "shipped" as const,
      inventoryLabelVersion: 2,
      movementSequence: 3,
      locationId: null,
      locationCode: null,
      locationLabelVersion: null,
      quarantined: false,
    };
    expect(() => assertReturnSnapshot(order, { ...order })).not.toThrow();
    expect(() => assertReturnSnapshot(order, undefined)).toThrow();
    expect(() => assertReturnSnapshot(order, { ...order, movementSequence: 4 })).toThrow();
    expect(() =>
      assertReturnSnapshot(order, { ...order, inventoryStatus: "quarantined", quarantined: true }),
    ).toThrow();
    expect(() => assertReturnSnapshot(order, { ...order, inventoryLabelVersion: 3 })).toThrow();
    expect(() => validateReturnInventoryNumber("0001", order)).not.toThrow();
    expect(() => validateReturnInventoryNumber("0002", order)).toThrow();
    expect(() =>
      validateReturnInventoryNumber(`RESALE|${order.inventoryNumber}|V1`, order),
    ).toThrow();
    expect(() =>
      validateReturnInventoryNumber("0001", { ...order, inventoryLabelVersion: null }),
    ).toThrow();
    const source = read("./stocktake-workspace.tsx");
    for (const endpoint of ["return-catalog", "return-quarantine", "return-inspection"])
      expect(source).toContain(endpoint);
    expect(source).toContain("locked.current = true");
    expect(source).toMatch(/assertReturnSnapshot\(\s*selected/u);
    expect(source).not.toContain("/disposal/confirm");
  });

  it("revokes the actual inventory photo session on hide, rechecks authorization and disposes", async () => {
    const states: Array<{ url: string | null; message: string }> = [];
    const fetchImage = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Blob(["fixture"], { type: "image/png" })))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const revoke = vi.fn();
    const create = vi.fn(() => "blob:private-inventory");
    const session = createPrivateInventoryPhotoSession({
      url: "/v1/workspaces/demo/photo/content",
      workspaceId: "demo",
      origin: "http://127.0.0.1:3000",
      onChange: (state) => states.push(state),
      fetchImage,
      createObjectUrl: create,
      revokeObjectUrl: revoke,
    });
    await session.load();
    expect(states.at(-1)?.url).toBe("blob:private-inventory");
    session.conceal();
    expect(revoke).toHaveBeenCalledWith("blob:private-inventory");
    expect(states.at(-1)?.url).toBeNull();
    await session.load();
    expect(states.at(-1)?.message).toContain("表示権限");
    expect(states.at(-1)?.url).toBeNull();
    expect(fetchImage.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
    session.dispose();
    await session.load();
    expect(fetchImage).toHaveBeenCalledTimes(2);
    const inventory = read("./inventory-workspace.tsx");
    expect(inventory).toContain("<PrivateInventoryPhoto");
    expect(inventory).not.toMatch(/(?:src|href)=\{photo\.contentUrl\}/u);
    expect(inventory).toContain('stage === "photos"');
  });

  it("never publishes a late private image after location change or unmount", async () => {
    let finish: ((response: Response) => void) | undefined;
    const states: Array<{ url: string | null; message: string }> = [];
    const create = vi.fn(() => "blob:late");
    const session = createPrivateInventoryPhotoSession({
      url: "/v1/workspaces/demo/photo/content",
      workspaceId: "demo",
      origin: "http://127.0.0.1:3000",
      onChange: (state) => states.push(state),
      fetchImage: () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      createObjectUrl: create,
      revokeObjectUrl: vi.fn(),
    });
    const load = session.load();
    session.dispose();
    finish!(new Response(new Blob(["fixture"], { type: "image/png" })));
    await load;
    expect(create).not.toHaveBeenCalled();
    expect(states.every((state) => state.url === null)).toBe(true);
  });

  it("routes returns only through stocktake and never infers quarantine purpose from a name", () => {
    expect(read("./inventory-workspace.tsx")).not.toContain("InventoryReturnWorkflow");
    const stocktake = read("./stocktake-workspace.tsx");
    expect(stocktake).toContain("InventoryReturnWorkflow");
    expect(stocktake).toContain("stepHeading.current?.focus()");
    expect(stocktake).toContain("tabIndex={-1}");
    expect(stocktake).toContain('aria-live="polite"');
    expect(
      isReturnQuarantineLocation({ canStoreInventory: true, purpose: "return_quarantine" }),
    ).toBe(true);
    expect(isReturnQuarantineLocation({ canStoreInventory: true, purpose: "general" })).toBe(false);
    expect(isReturnQuarantineLocation({ canStoreInventory: true })).toBe(false);
    expect(
      isReturnQuarantineLocation({ canStoreInventory: false, purpose: "return_quarantine" }),
    ).toBe(false);
    expect(read("./inventory-workspace.tsx")).toContain('name="purpose"');
  });
});
