import Fastify from "fastify";
import {
  apiErrorSchema,
  advanceP0WorkflowRequestSchema,
  captureSummarySchema,
  createSkuRequestSchema,
  inventorySummarySchema,
  measurementResponseSchema,
  mediaAssetResponseSchema,
  p0WorkflowResponseSchema,
  recordMeasurementRequestSchema,
  registerMediaAssetRequestSchema,
  skuResponseSchema,
  workspaceIdSchema,
  type ApiError,
  type HealthResponse,
} from "@resale/contracts";
import {
  InMemoryWorkflowRepository,
  RepositoryError,
  type RequestActor,
  type WorkflowRepository,
} from "./repository.js";

interface BuildAppOptions {
  repository?: WorkflowRepository;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
    requestIdHeader: "x-request-id",
  });
  const repository = options.repository ?? new InMemoryWorkflowRepository();

  app.addHook("onClose", async () => repository.close());

  app.get<{ Reply: HealthResponse }>("/health", () => ({
    status: "ok",
    service: "resale-ops-api",
    time: new Date().toISOString(),
  }));

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof skuResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const input = createSkuRequestSchema.safeParse(request.body);
    const actor = parseActor(request.headers["x-actor-id"]);
    if (!workspace.success || !input.success || !actor) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "workspace、actor、またはSKU入力を確認してください。",
          requestId: request.id,
        }),
      );
    }
    try {
      const row = await repository.createSku(workspace.data, actor, input.data);
      return reply.code(201).send(skuResponseSchema.parse(row));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<typeof inventorySummarySchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/inventory/summary", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = parseActor(request.headers["x-actor-id"]);
    if (!workspace.success || !actor) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "workspaceとactorを確認してください。",
          requestId: request.id,
        }),
      );
    }
    try {
      const summary = await repository.inventorySummary(workspace.data, actor);
      return reply.send(inventorySummarySchema.parse(summary));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; skuId: string };
    Body: unknown;
    Reply: ReturnType<typeof p0WorkflowResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/p0-actions", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const sku = workspaceIdSchema.safeParse(request.params.skuId);
    const input = advanceP0WorkflowRequestSchema.safeParse(request.body);
    const actor = parseActor(request.headers["x-actor-id"]);
    if (!workspace.success || !sku.success || !input.success || !actor) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "workspace、SKU、actor、またはP0操作を確認してください。",
          requestId: request.id,
        }),
      );
    }
    try {
      const result = await repository.advanceP0Workflow(
        workspace.data,
        sku.data,
        actor,
        input.data,
      );
      return reply.send(p0WorkflowResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; skuId: string };
    Body: unknown;
    Reply: ReturnType<typeof mediaAssetResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/media-assets", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const sku = workspaceIdSchema.safeParse(request.params.skuId);
    const input = registerMediaAssetRequestSchema.safeParse(request.body);
    const actor = parseActor(request.headers["x-actor-id"]);
    if (!workspace.success || !sku.success || !input.success || !actor) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "workspace、SKU、actor、または原本メタデータを確認してください。",
          requestId: request.id,
        }),
      );
    }
    try {
      const result = await repository.registerMediaAsset(
        workspace.data,
        sku.data,
        actor,
        input.data,
      );
      return reply.code(201).send(mediaAssetResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; skuId: string };
    Body: unknown;
    Reply: ReturnType<typeof measurementResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/measurements", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const sku = workspaceIdSchema.safeParse(request.params.skuId);
    const input = recordMeasurementRequestSchema.safeParse(request.body);
    const actor = parseActor(request.headers["x-actor-id"]);
    if (!workspace.success || !sku.success || !input.success || !actor) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "workspace、SKU、actor、または採寸入力を確認してください。",
          requestId: request.id,
        }),
      );
    }
    try {
      const result = await repository.recordMeasurement(
        workspace.data,
        sku.data,
        actor,
        input.data,
      );
      return reply.code(201).send(measurementResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string; skuId: string };
    Reply: ReturnType<typeof captureSummarySchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/capture-summary", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const sku = workspaceIdSchema.safeParse(request.params.skuId);
    const actor = parseActor(request.headers["x-actor-id"]);
    if (!workspace.success || !sku.success || !actor) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "workspace、SKU、actorを確認してください。",
          requestId: request.id,
        }),
      );
    }
    try {
      const result = await repository.captureSummary(workspace.data, sku.data, actor);
      return reply.send(captureSummarySchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  return app;
}

function parseActor(value: string | string[] | undefined): RequestActor | null {
  if (typeof value !== "string" || !workspaceIdSchema.safeParse(value).success) return null;
  return { identityId: value };
}

function mapRepositoryError(
  error: unknown,
  requestId: string,
): { status: 403 | 409 | 503; payload: ApiError } {
  const repositoryError =
    error instanceof RepositoryError
      ? error
      : new RepositoryError("database_error", "The operation failed safely");
  const status =
    repositoryError.code === "forbidden" ? 403 : repositoryError.code === "conflict" ? 409 : 503;
  return {
    status,
    payload: apiErrorSchema.parse({
      code: repositoryError.code,
      message: repositoryError.message,
      requestId,
    }),
  };
}
