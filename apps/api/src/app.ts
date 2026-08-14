import Fastify from "fastify";
import {
  apiErrorSchema,
  createSkuRequestSchema,
  inventorySummarySchema,
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
