import Fastify from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import {
  apiErrorSchema,
  advanceP0WorkflowRequestSchema,
  captureSummarySchema,
  createSkuRequestSchema,
  inventorySummarySchema,
  loginRequestSchema,
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
import { serializeClearedSessionCookie } from "./session.js";
import type { LoginService } from "./auth.js";

interface BuildAppOptions {
  repository?: WorkflowRepository;
  authenticate?: (
    headers: IncomingHttpHeaders,
  ) => RequestActor | null | Promise<RequestActor | null>;
  revokeSession?: (actor: RequestActor) => Promise<void>;
  closeAuthentication?: () => Promise<void>;
  validateWriteOrigin?: (headers: IncomingHttpHeaders) => boolean;
  loginService?: LoginService;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
    requestIdHeader: "x-request-id",
  });
  const repository = options.repository ?? new InMemoryWorkflowRepository();
  const authenticate = options.authenticate ?? (() => null);
  const validateWriteOrigin = options.validateWriteOrigin ?? (() => false);

  app.addHook("preHandler", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    if (!validateWriteOrigin(request.headers)) {
      return reply.code(403).send(
        apiErrorSchema.parse({
          code: "write_origin_rejected",
          message: "変更操作の送信元を確認できませんでした。",
          requestId: request.id,
        }),
      );
    }
  });

  app.addHook("onClose", async () => {
    await repository.close();
    await options.closeAuthentication?.();
    await options.loginService?.close();
  });

  app.get<{ Reply: HealthResponse }>("/health", () => ({
    status: "ok",
    service: "resale-ops-api",
    time: new Date().toISOString(),
  }));

  app.post<{ Body: unknown; Reply: ApiError | undefined }>(
    "/v1/session/login",
    async (request, reply) => {
      const input = loginRequestSchema.safeParse(request.body);
      if (!input.success) {
        return reply.code(400).send(
          apiErrorSchema.parse({
            code: "invalid_request",
            message: "メールアドレスと12〜128文字のパスワードを確認してください。",
            requestId: request.id,
          }),
        );
      }
      if (!options.loginService) {
        return reply.code(503).send(
          apiErrorSchema.parse({
            code: "login_unavailable",
            message: "ログイン基盤が未接続です。",
            requestId: request.id,
          }),
        );
      }
      const result = await options.loginService.login(input.data, request.ip);
      if (result.kind === "rate_limited") {
        return reply
          .header("retry-after", String(result.retryAfterSeconds ?? 900))
          .code(429)
          .send(
            apiErrorSchema.parse({
              code: "login_rate_limited",
              message: "ログイン試行が多いため、時間を置いて再実行してください。",
              requestId: request.id,
            }),
          );
      }
      if (result.kind === "invalid" || !result.setCookie) {
        return reply.code(401).send(
          apiErrorSchema.parse({
            code: "invalid_credentials",
            message: "メールアドレスまたはパスワードを確認してください。",
            requestId: request.id,
          }),
        );
      }
      return reply.header("set-cookie", result.setCookie).code(204).send(undefined);
    },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof skuResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const input = createSkuRequestSchema.safeParse(request.body);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !input.success) {
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
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success) {
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
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !sku.success || !input.success) {
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
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !sku.success || !input.success) {
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
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !sku.success || !input.success) {
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
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !sku.success) {
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

  app.post("/v1/session/logout", async (request, reply) => {
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!actor.sessionId || !options.revokeSession) {
      return reply.code(503).send(
        apiErrorSchema.parse({
          code: "session_registry_unavailable",
          message: "session失効を確認できないため、安全のためログアウトを停止しました。",
          requestId: request.id,
        }),
      );
    }
    await options.revokeSession(actor);
    return reply.header("set-cookie", serializeClearedSessionCookie()).code(204).send();
  });

  return app;
}

function authenticationError(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "authentication_required",
    message: "有効な署名付きセッションが必要です。",
    requestId,
  });
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
