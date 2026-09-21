import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const postgresMock = vi.hoisted(() => vi.fn());
vi.mock("postgres", () => ({ default: postgresMock }));
import { PostgresP0ItemRepository } from "./p0-item-repository.js";

const workspaceId = "81111111-1111-4111-8111-111111111111";
const skuId = "82222222-2222-4222-8222-222222222222";
const identityId = "83333333-3333-4333-8333-333333333333";
const actor = { workspaceId, identityId };
const idempotencyKey = "84444444-4444-4444-8444-444444444444";
const pageInput = {
  salesChannelKey: "mercari" as const,
  salesChannelName: "メルカリ" as const,
  productId: "m123456789",
  productUrl: "https://jp.mercari.com/item/m123456789",
  humanConfirmed: true as const,
  idempotencyKey,
};
const salesInput = {
  listingDays: null,
  currentPriceYen: "0",
  viewCount: "123",
  searchCount: null,
  likeCount: null,
  priceReductionRequestCount: null,
  checkedOn: "2026-09-21",
  nextCheckOn: "2026-09-22",
  inputSource: "official_page_human_checked" as const,
  idempotencyKey,
};

function setup(
  kind: "page" | "sales",
  options: { authorized?: boolean; replay?: boolean; mismatch?: boolean; workflow?: string } = {},
) {
  const input = kind === "page" ? pageInput : salesInput;
  const { idempotencyKey: key, ...values } = input;
  const row = {
    id: key,
    workspace_id: workspaceId,
    sku_id: skuId,
    sales_channel_key: pageInput.salesChannelKey,
    sales_channel_name: pageInput.salesChannelName,
    product_id: pageInput.productId,
    product_url: pageInput.productUrl,
    confirmed_by: identityId,
    confirmed_at: new Date("2026-09-21T00:00:00Z"),
    saved_at: new Date("2026-09-21T00:00:00Z"),
    listing_days: null,
    current_price_yen: 0,
    view_count: 123,
    search_count: null,
    like_count: null,
    price_reduction_request_count: null,
    checked_on: salesInput.checkedOn,
    next_check_on: salesInput.nextCheckOn,
    input_source: salesInput.inputSource,
    payload_hash: options.mismatch
      ? "different"
      : createHash("sha256")
          .update(JSON.stringify({ skuId, ...values }), "utf8")
          .digest("hex"),
  };
  const queries: string[] = [];
  const transaction = vi.fn(async (parts: TemplateStringsArray) => {
    const query = parts.join("?");
    queries.push(query);
    if (query.includes("workspace_membership"))
      return options.authorized === false ? [] : [{ role: "owner" }];
    if (query.includes("from product_sku")) return [{ id: skuId }];
    if (query.includes("idempotency_key =")) return options.replay === false ? [] : [row];
    if (query.includes("from published_product_page")) return [row];
    if (query.includes("from p0_workflow"))
      return [{ state: options.workflow ?? "listing_confirmed" }];
    if (query.includes("from pilot_run")) return [{ id: "active-v1.1-pilot" }];
    if (query.includes("insert into")) throw new Error("Replay must not insert anything");
    return [];
  });
  postgresMock.mockReturnValueOnce({
    begin: async (callback: (sql: typeof transaction) => Promise<unknown>) => callback(transaction),
  });
  const repository = new PostgresP0ItemRepository("postgres://local-test");
  const run = () =>
    kind === "page"
      ? repository.registerPublishedProductPage(workspaceId, skuId, actor, pageInput)
      : repository.recordSalesCheck(workspaceId, skuId, actor, salesInput);
  return { run, queries };
}

describe.each(["page", "sales"] as const)("committed %s replay", (kind) => {
  it.each(["listing_confirmed", "purchase_confirmed"])(
    "returns the saved result after pilot start and workflow %s without another write",
    async (workflow) => {
      const { run, queries } = setup(kind, { workflow });
      const result = await run();
      expect(result).toMatchObject({ workspaceId, skuId, confirmedBy: identityId });
      expect("registrationId" in result ? result.registrationId : result.observationId).toBe(
        idempotencyKey,
      );
      expect(queries[0]).toContain("set_config");
      expect(queries[1]).toContain("workspace_membership");
      expect(queries.some((query) => /p0_workflow|pilot_run|insert into/.test(query))).toBe(false);
    },
  );

  it("denies revoked membership before looking up a saved response", async () => {
    const { run, queries } = setup(kind, { authorized: false });
    await expect(run()).rejects.toMatchObject({ code: "forbidden" });
    expect(queries).toHaveLength(2);
  });

  it("still rejects a different payload for the saved key during a pilot", async () => {
    const { run } = setup(kind, { mismatch: true });
    await expect(run()).rejects.toMatchObject({ code: "conflict" });
  });

  it("still rejects new writes during an active v1.1 pilot", async () => {
    const { run, queries } = setup(kind, { replay: false });
    await expect(run()).rejects.toThrow("disabled during the local-only pilot");
    expect(queries.some((query) => query.includes("insert into"))).toBe(false);
  });
});
