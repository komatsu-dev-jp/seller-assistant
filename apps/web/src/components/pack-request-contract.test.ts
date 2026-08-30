import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const operationCallers = [
  "apps/web/src/components/p0-workspace.tsx",
  "apps/web/src/components/shipping-workspace.tsx",
] as const;

const operations = [
  { route: "pack", requestType: "PackOrderRequest" },
  { route: "ship", requestType: "ShipOrderRequest" },
] as const;

describe("pack and ship request callers follow the strict public contracts", () => {
  it.each(operationCallers)("keeps server-owned evidence fields out of %s", (path) => {
    const source = readFileSync(resolve(path), "utf8");

    for (const operation of operations) {
      const routeIndex = source.indexOf(`/${operation.route}\``);
      const payloadIndex = source.indexOf("body: JSON.stringify({", routeIndex);
      const payloadEnd = source.indexOf(`} satisfies ${operation.requestType}`, payloadIndex);

      expect(routeIndex).toBeGreaterThan(-1);
      expect(payloadIndex).toBeGreaterThan(routeIndex);
      expect(payloadEnd).toBeGreaterThan(payloadIndex);

      const payload = source.slice(payloadIndex, payloadEnd);
      expect(payload).toContain("addressLeaseId:");
      expect(payload).toContain("idempotencyKey:");
      expect(payload).toContain("humanConfirmed:");
      expect(payload).not.toMatch(/confirmedAt|packingEvidenceReferenceId|shippedAt/u);
    }
  });
});
