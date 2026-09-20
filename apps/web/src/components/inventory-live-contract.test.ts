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
  inventoryOperationErrorMessage,
  labelReissueSuccessMessage,
} from "../lib/inventory-live-safety";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("inventory live stages", () => {
  it("explains a return quarantine race in Japanese", () => {
    expect(
      inventoryOperationErrorMessage(
        new Error("Return quarantine requires the shipped allocated item"),
      ),
    ).toBe("この返品は、ほかの画面ですでに隔離されたか、状態が変わりました。");
  });
  it("removes desktop minimum width from mobile inventory cards", () => {
    const css = read("./inventory-live.module.css");
    expect(css).toMatch(
      /\.workspace :global\(\.inventoryTable\) > \[role="row"\]:not\(:global\(\.inventoryTableHead\)\) \{\s*min-width: 0;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u,
    );
  });
  it("explains revoked capture permissions in Japanese", () => {
    const source = read("./mobile-capture-workspace.tsx");
    const formatter = source.slice(source.indexOf("function errorMessage("));
    expect(formatter).toContain("if (isAssignmentRevokedError(reason))");
    expect(formatter).toContain("この商品の撮影・採寸は現在の担当範囲に含まれません。");
    expect(source).toContain("!loading && !task && !error ? (");
    expect(source).toContain("今は撮影・採寸できる商品がありません");
    expect(source).toContain("管理者が商品を割り当てると、この画面から撮影・採寸できます。");
    expect(source).toContain("今日の作業へ戻る");
  });
  it("resets the native evidence picker when moving to another measurement", () => {
    const source = read("./workflow-live-layout.tsx");
    expect(source).toMatch(/採寸写真を撮る・選ぶ\s*<input\s+key=\{definition.definitionId\}/u);
  });
  it("binds private photo requests to the browser window rather than the session options", () => {
    const source = read("./mobile-scan-workflow.tsx");
    expect(source).toContain("fetchImage: (input, init) => window.fetch(input, init)");
    expect(source).not.toContain("fetchImage: fetch,");
  });
  it("keeps field staff home navigation in scope and exposes safe mobile logout", () => {
    const source = read("../app/mobile/page.tsx");
    expect(source).toContain('href={canViewManagement ? "/" : "/mobile"}');
    expect(source).toContain('aria-label={canViewManagement ? "PCホームへ" : "作業ホームへ"}');
    expect(source).toContain("<LogoutButton />");
    expect(source).toContain("<MobileCaptureTaskAction workspaceId={session.workspaceId} />");
    const action = read("./mobile-capture-task-action.tsx");
    expect(action).toContain("/capture-tasks");
    expect(action).toContain("assignedCaptureTasks(await response.json(), workspaceId)");
    expect(action).toContain('<button className="mobileWorkflowAction" type="button" disabled>');
  });
  it("resets hold confirmation after a settled request for a fresh three-second retry", () => {
    const source = read("./stocktake-workspace.tsx");
    const hold = source.slice(source.indexOf("function HoldToConfirmButton("));
    expect(hold).toMatch(
      /await onConfirm\(\);\s*\}\s*finally\s*\{\s*setMode\("idle"\);\s*setRemaining\(3\);/u,
    );
    expect(hold.match(/void submitConfirmation\(\);/gu)).toHaveLength(2);
  });
  it("requires fresh inventory and location checks when a discrepancy changes state", () => {
    const source = read("./stocktake-workspace.tsx");
    expect(source).toContain("key={`${difference.discrepancyId}:${difference.state}`}");
  });
  it("explains self-captured photos without offering a forbidden approval action", () => {
    const source = read("./inventory-workspace.tsx");
    expect(read("../app/inventory/page.tsx")).toContain("identityId={session.identityId}");
    expect(source).toContain('photo.reviewState === "pending" && photo.capturedBy === identityId');
    expect(source).toContain("別の担当者による確認待ち");
    const approval = source.slice(source.indexOf("async function approveLocationPhoto("));
    const guardIndex = approval.indexOf("if (busy || photo.capturedBy === identityId) return;");
    const requestIndex = approval.indexOf("await requestJson(");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(requestIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(requestIndex);
  });
  it("allows explicit approved stocktake history selection and resets unfinished count input", () => {
    const source = read("./stocktake-workspace.tsx");
    expect(source).toContain("確認する棚卸し");
    expect(source).toContain('value={selectedStocktakeId ?? ""}');
    expect(source).toContain("setPendingChallenge(null)");
    expect(source).toContain("setSelectedEvidence([])");
    expect(source).toMatch(/<CountingPanel\s+key=\{active.stocktakeId\}/u);
    expect(source).toContain("進行中の棚卸し・新しく始める");
  });
  it("waits for a valid current-workspace catalog before manual or barcode resolution", () => {
    const source = read("./mobile-scan-workflow.tsx");
    const accept = source.slice(
      source.indexOf("function acceptValue("),
      source.indexOf('if (step === "saved")'),
    );
    expect(accept.indexOf("if (!catalogReady || !catalog) return;")).toBeGreaterThan(-1);
    expect(accept.indexOf("if (!catalogReady || !catalog) return;")).toBeLessThan(
      accept.indexOf("resolveInventoryCatalog("),
    );
    expect(source).toContain("catalogWorkspaceId === workspaceId");
    expect(source).toContain("disabled={!catalogReady}");
    expect(source).toContain("{catalogReady ? (");
    expect(source).toContain("商品と場所の一覧を読み込んでいます。");
    expect(accept).not.toContain("catalog?.inventory ?? []");
  });

  it("offers catalog retry and cancels late updates on disposal", () => {
    const source = read("./mobile-scan-workflow.tsx");
    const load = source.slice(
      source.indexOf("const controller = new AbortController()"),
      source.indexOf("const title = useMemo"),
    );
    expect(load).toContain("signal: controller.signal");
    expect(load).toContain("putawayCatalogResponseSchema.safeParse(payload)");
    expect(load).toContain("if (cancelled) return;");
    expect(load).toContain("if (!cancelled)");
    expect(load).toContain("if (!cancelled) setCatalogLoading(false)");
    expect(load).toContain("cancelled = true;");
    expect(load).toContain("controller.abort()");
    expect(load).toContain("[workspaceId, catalogRetry]");
    expect(source).toContain("setCatalogRetry((current) => current + 1)");
    expect(source).toContain("商品と場所の一覧を再読み込み");
  });
  it("ignores stale capture-task responses before clearing local work or changing the screen", () => {
    const source = read("./mobile-capture-workspace.tsx");
    const refresh = source.slice(
      source.indexOf("const refresh = useCallback"),
      source.indexOf("useEffect(() => {", source.indexOf("const refresh = useCallback")),
    );
    expect(source).toContain("const refreshRequest = useRef(0)");
    expect(refresh).toContain("const request = ++refreshRequest.current");
    const firstGuard = refresh.indexOf("if (request !== refreshRequest.current) return false;");
    const cleanup = refresh.indexOf("await clearUnassignedCaptureUploads(");
    const tasks = refresh.indexOf("setTasks(loaded)");
    const secondGuard = refresh.indexOf(
      "if (request !== refreshRequest.current) return false;",
      cleanup,
    );
    expect(firstGuard).toBeGreaterThan(-1);
    expect(firstGuard).toBeLessThan(cleanup);
    expect(secondGuard).toBeGreaterThan(cleanup);
    expect(secondGuard).toBeLessThan(tasks);
    expect(source).toContain("refreshRequest.current += 1");
    expect(source).toContain("if (request === refreshRequest.current) setLoading(false)");
  });
  it("uses the shared Japanese recovery message for saved-photo conflicts", () => {
    const source = read("./mobile-capture-workspace.tsx");
    expect(source).toContain(
      'import { p0UserFacingErrorMessage } from "../lib/p0-user-facing-error"',
    );
    expect(source).toContain("return p0UserFacingErrorMessage(reason)");
  });
  it("replaces the scan form with a clear assignment message when no valid work exists", () => {
    const source = read("./mobile-scan-workflow.tsx");
    expect(source).toContain("getPutawayActionState(");
    expect(source).toContain("if (catalogReady && !catalogAction.enabled)");
    expect(source).toContain("今は読み取れる作業がありません");
    expect(source).toContain("管理者が商品と保管場所を割り当てると、この画面から読み取れます。");
    expect(source).toContain("<p>{catalogAction.detail}。</p>");
  });
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

  it("keeps the location draft after a failed save and resets it only after success", () => {
    const source = read("./inventory-workspace.tsx");
    const create = source.slice(
      source.indexOf("async function createLocation("),
      source.indexOf("async function uploadLocationPhoto("),
    );
    expect(create).toContain("return true;");
    expect(create).toContain("setError(errorMessage(reason));\n      return false;");
    expect(create).toContain("場所の登録は完了しましたが、最新の一覧を読み込めませんでした。");
    expect(create.indexOf('setStage("locations")')).toBeLessThan(create.indexOf("await refresh()"));
    expect(create.indexOf("await refresh()")).toBeLessThan(create.indexOf("return true;"));
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("const form = event.currentTarget;");
    expect(source).toContain("void createLocation(new FormData(form)).then((created) => {");
    expect(source).toContain("if (created) form.reset();");
    expect(source).not.toContain('<form action={createLocation} className="inventoryFormGrid">');
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
    expect(source).toContain("resolveInventoryCatalog(normalized, catalog.inventory)");
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

  it("explains product and location label reissues with the correct next step", () => {
    expect(labelReissueSuccessMessage("inventory_unit", "INV-000006-2", 2)).toBe(
      "商品ラベルをV2として再発行しました。古い商品ラベルは無効です。「商品番号・ラベル」でV2を確認してください。",
    );
    expect(labelReissueSuccessMessage("location", "UI-CAP-SHELF-4", 3)).toBe(
      "場所ラベルをV3として再発行しました。古い場所ラベルは無効です。場所コード UI-CAP-SHELF-4 の新しい場所ラベルを使ってください。",
    );
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
