import Fastify from "fastify";
import type { HealthResponse } from "@resale/contracts";

export function buildApp() {
  const app = Fastify({
    logger: false,
    requestIdHeader: "x-request-id",
  });

  app.get<{ Reply: HealthResponse }>("/health", () => ({
    status: "ok",
    service: "resale-ops-api",
    time: new Date().toISOString(),
  }));

  return app;
}
