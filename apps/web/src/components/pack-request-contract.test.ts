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
      const payloadEnd = source.indexOf(operation.requestType, routeIndex);

      expect(routeIndex).toBeGreaterThan(-1);
      expect(payloadEnd).toBeGreaterThan(routeIndex);

      const payload = source.slice(routeIndex, payloadEnd);
      expect(payload).toContain("addressLeaseId:");
      expect(payload).toContain("idempotencyKey:");
      expect(payload).toContain("humanConfirmed:");
      expect(payload).not.toMatch(/confirmedAt|packingEvidenceReferenceId/u);

      if (operation.route === "pack") {
        expect(payload).not.toContain("shippedAt");
      }

      if (operation.route === "ship" && path.endsWith("shipping-workspace.tsx")) {
        expect(payload).toContain("shippingMethodSelectionId:");
        expect(payload).toContain("readinessConfirmationId:");
        expect(payload).toContain("shippedAt:");
        expect(payload).toContain("intent.shippingMethodSelectionId &&");
        expect(payload).toContain("intent.readinessConfirmationId &&");
        expect(payload).toContain("intent.shippedAt");
      }
    }
  });
});
