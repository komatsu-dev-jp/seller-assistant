import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import {
  accountingOrderOptionSchema,
  accountingExportPreflightResponseSchema,
  accountingExportPreviewResponseSchema,
  accountingProfileSchema,
  accountMappingRuleSchema,
  replaceAccountMappingRuleRequestSchema,
  replaceAccountMappingRuleResponseSchema,
  approveStocktakeRequestSchema,
  addressLeaseQuerySchema,
  addressLeaseResponseSchema,
  assignOrderRequestSchema,
  apiErrorSchema,
  advanceP0WorkflowRequestSchema,
  captureSummarySchema,
  captureTaskResponseSchema,
  confirmShippingPhotosRequestSchema,
  confirmIdentityCandidateRequestSchema,
  confirmProductAttributesRequestSchema,
  confirmAccountingImportRequestSchema,
  confirmMissingCandidateRequestSchema,
  createIdentityCandidateRequestSchema,
  createLocalMemberRequestSchema,
  createTeamAssignmentRequestSchema,
  createAccountMappingRuleRequestSchema,
  createAddressLeaseRequestSchema,
  createLocationRequestSchema,
  createMarketplaceReferenceRequestSchema,
  createDiscrepancyChallengeRequestSchema,
  createOrderRequestSchema,
  createP0ItemRequestSchema,
  createVersionedAccountingExportRequestSchema,
  createSkuRequestSchema,
  financialSummaryResponseSchema,
  discrepancyChallengeResponseSchema,
  discrepancyEvidenceListItemSchema,
  discrepancyEvidenceResponseSchema,
  evaluateShippingPhotoPreflightRequestSchema,
  inspectReturnRequestSchema,
  inventorySummarySchema,
  ownerPulseResponseSchema,
  loginRequestSchema,
  locationPhotoResponseSchema,
  locationNodeResponseSchema,
  measurementResponseSchema,
  identityCandidateResponseSchema,
  marketplaceReferenceResponseSchema,
  orderOperationResponseSchema,
  orderAssignmentResponseSchema,
  overrideShippingPhotoDecisionRequestSchema,
  packOrderRequestSchema,
  pickOrderRequestSchema,
  p0WorkflowResponseSchema,
  p0ItemResponseSchema,
  pilotRunResponseSchema,
  productMediaUploadResponseSchema,
  productAttributeConfirmationResponseSchema,
  productResearchResponseSchema,
  putawayInventoryRequestSchema,
  putawayInventoryResponseSchema,
  putawayCatalogResponseSchema,
  quarantineReturnRequestSchema,
  reissuedInventoryLabelResponseSchema,
  reissueInventoryLabelRequestSchema,
  invalidatePilotRunRequestSchema,
  recordPilotExceptionRequestSchema,
  recordMeasurementRequestSchema,
  recordOrderSaleAmountRequestSchema,
  recordOrderSaleAmountResponseSchema,
  reviewLocationPhotoRequestSchema,
  revokeTeamAssignmentRequestSchema,
  resolveStocktakeDiscrepancyRequestSchema,
  restoreMissingCandidateRequestSchema,
  returnOrderRequestSchema,
  sessionContextResponseSchema,
  shippingAddressResponseSchema,
  shippingPhotoAssetResponseSchema,
  shippingPhotoConfirmationResponseSchema,
  shippingPhotoPolicyResponseSchema,
  shippingPhotoPreflightResponseSchema,
  shippingTaskResponseSchema,
  shipOrderRequestSchema,
  skuResponseSchema,
  startStocktakeRequestSchema,
  startPilotRunRequestSchema,
  stocktakeObservationRequestSchema,
  stocktakeResponseSchema,
  teamAssignmentResponseSchema,
  teamMemberResponseSchema,
  teamStateResponseSchema,
  updateAccountingProfileRequestSchema,
  updateShippingPhotoPolicyRequestSchema,
  uploadLocationPhotoQuerySchema,
  uploadDiscrepancyEvidenceQuerySchema,
  uploadProductMediaQuerySchema,
  uploadShippingPhotoQuerySchema,
  versionedAccountingExportResponseSchema,
  workspaceIdSchema,
  type ApiError,
  type HealthResponse,
  type LocationNodeResponse,
  type P0ItemResponse,
  type PilotRunResponse,
} from "@resale/contracts";
import {
  InMemoryWorkflowRepository,
  RepositoryError,
  type RequestActor,
  type WorkflowRepository,
} from "./repository.js";
import { serializeClearedSessionCookie } from "./session.js";
import type { LoginService } from "./auth.js";
import { inspectImage, type PrivateMediaStore } from "./local-media-store.js";
import type { AddressCipher } from "./address-crypto.js";
import type { OrderRepository } from "./order-repository.js";
import type { P0ItemRepository } from "./p0-item-repository.js";
import type { TeamRepository } from "./team-repository.js";
import type { StocktakeRepository } from "./stocktake-repository.js";
import type { AccountingRepository } from "./accounting-repository.js";

interface BuildAppOptions {
  repository?: WorkflowRepository;
  authenticate?: (
    headers: IncomingHttpHeaders,
  ) => RequestActor | null | Promise<RequestActor | null>;
  revokeSession?: (actor: RequestActor) => Promise<void>;
  closeAuthentication?: () => Promise<void>;
  validateWriteOrigin?: (headers: IncomingHttpHeaders) => boolean;
  loginService?: LoginService;
  mediaStore?: PrivateMediaStore;
  orderRepository?: OrderRepository;
  addressCipher?: AddressCipher;
  p0ItemRepository?: P0ItemRepository;
  teamRepository?: TeamRepository;
  stocktakeRepository?: StocktakeRepository;
  accountingRepository?: AccountingRepository;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
    requestIdHeader: "x-request-id",
  });
  const repository = options.repository ?? new InMemoryWorkflowRepository();
  const authenticate = options.authenticate ?? (() => null);
  const validateWriteOrigin = options.validateWriteOrigin ?? (() => false);

  app.addContentTypeParser(
    ["image/jpeg", "image/png"],
    { parseAs: "buffer", bodyLimit: 25 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );

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
    await options.orderRepository?.close();
    await options.p0ItemRepository?.close();
    await options.teamRepository?.close();
    await options.stocktakeRepository?.close();
    await options.accountingRepository?.close();
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

  app.get<{
    Reply: ReturnType<typeof sessionContextResponseSchema.parse> | ApiError;
  }>("/v1/session/context", async (request, reply) => {
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    try {
      const context = await repository.sessionContext(actor);
      return reply.send(sessionContextResponseSchema.parse(context));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<typeof teamStateResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/team", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success) return reply.code(400).send(invalidOrderInput(request.id));
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.teamRepository) return reply.code(503).send(teamServiceUnavailable(request.id));
    try {
      return reply.send(
        teamStateResponseSchema.parse(await options.teamRepository.state(workspace.data, actor)),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Querystring: { orderId?: string };
    Reply:
      | ReturnType<ReturnType<typeof versionedAccountingExportResponseSchema.array>["parse"]>
      | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/exports", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const order = workspaceIdSchema.safeParse(request.query.orderId);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!order.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply.send(
        versionedAccountingExportResponseSchema
          .array()
          .parse(
            await options.accountingRepository.listExports(
              context.workspaceId,
              order.data,
              context.actor,
            ),
          ),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Querystring: { orderId?: string };
    Reply: ReturnType<typeof accountingExportPreflightResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/exports/preflight", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const order = workspaceIdSchema.safeParse(request.query.orderId);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!order.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply
        .header("cache-control", "private, no-store")
        .send(
          accountingExportPreflightResponseSchema.parse(
            await options.accountingRepository.exportPreflight(
              context.workspaceId,
              order.data,
              context.actor,
            ),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string; batchId: string };
    Reply: ReturnType<typeof accountingExportPreviewResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/exports/:batchId/preview", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const batch = workspaceIdSchema.safeParse(request.params.batchId);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!batch.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply
        .header("cache-control", "private, no-store")
        .send(
          accountingExportPreviewResponseSchema.parse(
            await options.accountingRepository.previewExport(
              context.workspaceId,
              batch.data,
              context.actor,
            ),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof teamMemberResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/team/members", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    const input = createLocalMemberRequestSchema.safeParse(request.body);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !input.success) {
      return reply.code(400).send(invalidOrderInput(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.teamRepository) return reply.code(503).send(teamServiceUnavailable(request.id));
    try {
      return reply
        .code(201)
        .send(
          teamMemberResponseSchema.parse(
            await options.teamRepository.createMember(workspace.data, actor, input.data),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof teamAssignmentResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/team/assignments", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    const input = createTeamAssignmentRequestSchema.safeParse(request.body);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !input.success) {
      return reply.code(400).send(invalidOrderInput(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.teamRepository) return reply.code(503).send(teamServiceUnavailable(request.id));
    try {
      return reply
        .code(201)
        .send(
          teamAssignmentResponseSchema.parse(
            await options.teamRepository.createAssignment(workspace.data, actor, input.data),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; assignmentId: string };
    Body: unknown;
    Reply: ReturnType<typeof teamAssignmentResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/team/assignments/:assignmentId/revoke",
    async (request, reply) => {
      const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
      const assignment = workspaceIdSchema.safeParse(request.params.assignmentId);
      const actor = await authenticate(request.headers);
      const input = revokeTeamAssignmentRequestSchema.safeParse(request.body);
      if (!actor) return reply.code(401).send(authenticationError(request.id));
      if (!workspace.success || !assignment.success || !input.success) {
        return reply.code(400).send(invalidOrderInput(request.id));
      }
      const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
      if (actorWorkspace) return reply.code(403).send(actorWorkspace);
      if (!options.teamRepository) {
        return reply.code(503).send(teamServiceUnavailable(request.id));
      }
      try {
        return reply.send(
          teamAssignmentResponseSchema.parse(
            await options.teamRepository.revokeAssignment(
              workspace.data,
              assignment.data,
              actor,
              input.data,
            ),
          ),
        );
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<ReturnType<typeof stocktakeResponseSchema.array>["parse"]> | ApiError;
  }>("/v1/workspaces/:workspaceId/stocktakes", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.stocktakeRepository) {
      return reply.code(503).send(stocktakeServiceUnavailable(request.id));
    }
    try {
      return reply.send(
        stocktakeResponseSchema
          .array()
          .parse(await options.stocktakeRepository.list(context.workspaceId, context.actor)),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof stocktakeResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/stocktakes", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const input = startStocktakeRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidLocationInput(request.id));
    if (!options.stocktakeRepository) {
      return reply.code(503).send(stocktakeServiceUnavailable(request.id));
    }
    try {
      return reply
        .code(201)
        .send(
          stocktakeResponseSchema.parse(
            await options.stocktakeRepository.start(context.workspaceId, context.actor, input.data),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; stocktakeId: string };
    Body: unknown;
    Reply: ReturnType<typeof stocktakeResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/stocktakes/:stocktakeId/observations", async (request, reply) => {
    const context = await stocktakeRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const input = stocktakeObservationRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidLocationInput(request.id));
    if (!options.stocktakeRepository)
      return reply.code(503).send(stocktakeServiceUnavailable(request.id));
    try {
      return reply.send(
        stocktakeResponseSchema.parse(
          await options.stocktakeRepository.observe(
            context.workspaceId,
            context.stocktakeId,
            context.actor,
            input.data,
          ),
        ),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  for (const action of ["reconcile", "approve"] as const) {
    app.post<{
      Params: { workspaceId: string; stocktakeId: string };
      Body: unknown;
      Reply: ReturnType<typeof stocktakeResponseSchema.parse> | ApiError;
    }>(`/v1/workspaces/:workspaceId/stocktakes/:stocktakeId/${action}`, async (request, reply) => {
      const context = await stocktakeRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      if (context.error) return reply.code(context.status).send(context.error);
      if (!options.stocktakeRepository)
        return reply.code(503).send(stocktakeServiceUnavailable(request.id));
      const approval =
        action === "approve" ? approveStocktakeRequestSchema.safeParse(request.body) : null;
      if (approval && !approval.success) {
        return reply.code(400).send(invalidLocationInput(request.id));
      }
      try {
        const result =
          action === "reconcile"
            ? await options.stocktakeRepository.reconcile(
                context.workspaceId,
                context.stocktakeId,
                context.actor,
              )
            : await options.stocktakeRepository.approve(
                context.workspaceId,
                context.stocktakeId,
                context.actor,
                approval!.data,
              );
        return reply.send(stocktakeResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    });
  }

  app.post<{
    Params: { workspaceId: string; stocktakeId: string; discrepancyId: string };
    Body: unknown;
    Reply: ReturnType<typeof stocktakeResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/stocktakes/:stocktakeId/discrepancies/:discrepancyId/resolve",
    async (request, reply) => {
      const context = await stocktakeRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const discrepancy = workspaceIdSchema.safeParse(request.params.discrepancyId);
      const input = resolveStocktakeDiscrepancyRequestSchema.safeParse(request.body);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!discrepancy.success || !input.success)
        return reply.code(400).send(invalidLocationInput(request.id));
      if (!options.stocktakeRepository)
        return reply.code(503).send(stocktakeServiceUnavailable(request.id));
      try {
        return reply.send(
          stocktakeResponseSchema.parse(
            await options.stocktakeRepository.resolve(
              context.workspaceId,
              context.stocktakeId,
              discrepancy.data,
              context.actor,
              input.data,
            ),
          ),
        );
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; skuId: string };
    Body: unknown;
    Reply: ReturnType<typeof productAttributeConfirmationResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/product-attributes", async (request, reply) => {
    const context = await skuRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const input = confirmProductAttributesRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidP0ItemInput(request.id));
    if (!options.p0ItemRepository)
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    try {
      return reply
        .code(201)
        .send(
          productAttributeConfirmationResponseSchema.parse(
            await options.p0ItemRepository.confirmProductAttributes(
              context.workspaceId,
              context.skuId,
              context.actor,
              input.data,
            ),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; stocktakeId: string; discrepancyId: string };
    Querystring: unknown;
    Body: Buffer;
    Reply: ReturnType<typeof discrepancyEvidenceResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/stocktakes/:stocktakeId/discrepancies/:discrepancyId/evidence",
    async (request, reply) => {
      const context = await stocktakeRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const discrepancy = workspaceIdSchema.safeParse(request.params.discrepancyId);
      const query = uploadDiscrepancyEvidenceQuerySchema.safeParse(request.query);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!discrepancy.success || !query.success || !Buffer.isBuffer(request.body)) {
        return reply.code(400).send(mediaInputError(request.id));
      }
      if (!options.stocktakeRepository) {
        return reply.code(503).send(stocktakeServiceUnavailable(request.id));
      }
      if (!options.mediaStore) return reply.code(503).send(mediaStoreUnavailable(request.id));
      try {
        const inspected = inspectImage(request.body);
        if (inspected.mimeType !== query.data.mimeType) {
          return reply.code(400).send(mediaInputError(request.id));
        }
        const evidenceId = randomUUID();
        const extension = inspected.mimeType === "image/jpeg" ? "jpg" : "png";
        const storageKey = `workspaces/${context.workspaceId}/originals/discrepancy-${discrepancy.data}-${evidenceId}.${extension}`;
        const stored = await options.mediaStore.saveOriginal(storageKey, request.body);
        try {
          const result = await options.stocktakeRepository.registerDiscrepancyEvidence(
            context.workspaceId,
            context.stocktakeId,
            discrepancy.data,
            context.actor,
            {
              evidenceId,
              mimeType: inspected.mimeType,
              width: inspected.width,
              height: inspected.height,
              sizeBytes: stored.sizeBytes,
              sha256: stored.sha256,
              storageKey: stored.storageKey,
            },
          );
          return reply.code(201).send(discrepancyEvidenceResponseSchema.parse(result));
        } catch (error) {
          if (stored.created)
            await options.mediaStore.removeOriginal(stored.storageKey, stored.sha256);
          throw error;
        }
      } catch (error) {
        if (error instanceof RepositoryError) {
          const mapped = mapRepositoryError(error, request.id);
          return reply.code(mapped.status).send(mapped.payload);
        }
        return reply.code(400).send(mediaInputError(request.id));
      }
    },
  );

  app.get<{
    Params: { workspaceId: string; stocktakeId: string; discrepancyId: string };
    Reply:
      ReturnType<ReturnType<typeof discrepancyEvidenceListItemSchema.array>["parse"]> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/stocktakes/:stocktakeId/discrepancies/:discrepancyId/evidence",
    async (request, reply) => {
      const context = await stocktakeRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const discrepancy = workspaceIdSchema.safeParse(request.params.discrepancyId);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!discrepancy.success) return reply.code(400).send(invalidLocationInput(request.id));
      if (!options.stocktakeRepository) {
        return reply.code(503).send(stocktakeServiceUnavailable(request.id));
      }
      try {
        const evidence = await options.stocktakeRepository.listDiscrepancyEvidence(
          context.workspaceId,
          context.stocktakeId,
          discrepancy.data,
          context.actor,
        );
        return reply
          .header("cache-control", "private, no-store")
          .send(discrepancyEvidenceListItemSchema.array().parse(evidence));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.get<{
    Params: {
      workspaceId: string;
      stocktakeId: string;
      discrepancyId: string;
      evidenceId: string;
    };
  }>(
    "/v1/workspaces/:workspaceId/stocktakes/:stocktakeId/discrepancies/:discrepancyId/evidence/:evidenceId/content",
    async (request, reply) => {
      const context = await stocktakeRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const discrepancy = workspaceIdSchema.safeParse(request.params.discrepancyId);
      const evidence = workspaceIdSchema.safeParse(request.params.evidenceId);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!discrepancy.success || !evidence.success) {
        return reply.code(400).send(invalidLocationInput(request.id));
      }
      if (!options.stocktakeRepository) {
        return reply.code(503).send(stocktakeServiceUnavailable(request.id));
      }
      if (!options.mediaStore) return reply.code(503).send(mediaStoreUnavailable(request.id));
      try {
        const stored = await options.stocktakeRepository.readDiscrepancyEvidence(
          context.workspaceId,
          context.stocktakeId,
          discrepancy.data,
          evidence.data,
          context.actor,
        );
        const sanitized = await options.mediaStore.readSanitizedOriginal({
          storageKey: stored.storageKey,
          expectedSha256: stored.sha256,
          expectedMimeType: stored.mimeType,
          expectedSizeBytes: stored.sizeBytes,
          expectedWidth: stored.width,
          expectedHeight: stored.height,
        });
        return reply
          .header("content-type", stored.mimeType)
          .header("content-length", String(sanitized.length))
          .header("content-disposition", "inline")
          .header("cache-control", "private, no-store")
          .header("x-content-type-options", "nosniff")
          .send(sanitized);
      } catch (error) {
        if (error instanceof RepositoryError) {
          const mapped = mapRepositoryError(error, request.id);
          return reply.code(mapped.status).send(mapped.payload);
        }
        return reply.code(503).send(mediaStoreUnavailable(request.id));
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; stocktakeId: string; discrepancyId: string };
    Body: unknown;
    Reply: ReturnType<typeof discrepancyChallengeResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/stocktakes/:stocktakeId/discrepancies/:discrepancyId/challenges",
    async (request, reply) => {
      const context = await stocktakeRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const discrepancy = workspaceIdSchema.safeParse(request.params.discrepancyId);
      const input = createDiscrepancyChallengeRequestSchema.safeParse(request.body);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!discrepancy.success || !input.success) {
        return reply.code(400).send(invalidLocationInput(request.id));
      }
      if (!options.stocktakeRepository) {
        return reply.code(503).send(stocktakeServiceUnavailable(request.id));
      }
      try {
        const result = await options.stocktakeRepository.createDiscrepancyChallenge(
          context.workspaceId,
          context.stocktakeId,
          discrepancy.data,
          context.actor,
          input.data,
        );
        return reply.code(201).send(discrepancyChallengeResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  for (const action of ["confirm", "restore"] as const) {
    app.post<{
      Params: { workspaceId: string; stocktakeId: string; discrepancyId: string };
      Body: unknown;
      Reply: ReturnType<typeof stocktakeResponseSchema.parse> | ApiError;
    }>(
      `/v1/workspaces/:workspaceId/stocktakes/:stocktakeId/discrepancies/:discrepancyId/${action}`,
      async (request, reply) => {
        const context = await stocktakeRequestContext(
          request.params,
          request.headers,
          request.id,
          authenticate,
        );
        const discrepancy = workspaceIdSchema.safeParse(request.params.discrepancyId);
        const input =
          action === "confirm"
            ? confirmMissingCandidateRequestSchema.safeParse(request.body)
            : restoreMissingCandidateRequestSchema.safeParse(request.body);
        if (context.error) return reply.code(context.status).send(context.error);
        if (!discrepancy.success || !input.success) {
          return reply.code(400).send(invalidLocationInput(request.id));
        }
        if (!options.stocktakeRepository) {
          return reply.code(503).send(stocktakeServiceUnavailable(request.id));
        }
        try {
          const result =
            action === "confirm"
              ? await options.stocktakeRepository.confirmMissingCandidate(
                  context.workspaceId,
                  context.stocktakeId,
                  discrepancy.data,
                  context.actor,
                  confirmMissingCandidateRequestSchema.parse(request.body),
                )
              : await options.stocktakeRepository.restoreMissingCandidate(
                  context.workspaceId,
                  context.stocktakeId,
                  discrepancy.data,
                  context.actor,
                  restoreMissingCandidateRequestSchema.parse(request.body),
                );
          return reply.send(stocktakeResponseSchema.parse(result));
        } catch (error) {
          const mapped = mapRepositoryError(error, request.id);
          return reply.code(mapped.status).send(mapped.payload);
        }
      },
    );
  }

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof reissuedInventoryLabelResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/inventory-labels/reissue", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const input = reissueInventoryLabelRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidLocationInput(request.id));
    if (!options.stocktakeRepository)
      return reply.code(503).send(stocktakeServiceUnavailable(request.id));
    try {
      return reply
        .code(201)
        .send(
          reissuedInventoryLabelResponseSchema.parse(
            await options.stocktakeRepository.reissueLabel(
              context.workspaceId,
              context.actor,
              input.data,
            ),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<ReturnType<typeof shippingTaskResponseSchema.array>["parse"]> | ApiError;
  }>("/v1/workspaces/:workspaceId/shipping-tasks", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success) return reply.code(400).send(invalidOrderInput(request.id));
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.orderRepository) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    try {
      const result = await options.orderRepository.shippingTasks(workspace.data, actor);
      return reply.send(shippingTaskResponseSchema.array().parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; orderId: string };
    Body: unknown;
    Reply: ReturnType<typeof orderAssignmentResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/orders/:orderId/assignment", async (request, reply) => {
    const context = await orderRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const input = assignOrderRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.orderRepository) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    try {
      const result = await options.orderRepository.assignShipping(
        context.workspaceId,
        context.orderId,
        context.actor,
        input.data,
      );
      return reply.code(201).send(orderAssignmentResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<typeof shippingPhotoPolicyResponseSchema.parse> | ApiError | undefined;
  }>("/v1/workspaces/:workspaceId/shipping-photo-policy", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.orderRepository) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    try {
      const result = await options.orderRepository.shippingPhotoPolicy(
        context.workspaceId,
        context.actor,
      );
      if (!result) {
        return reply.header("cache-control", "private, no-store").code(204).send(undefined);
      }
      return reply
        .header("cache-control", "private, no-store")
        .send(shippingPhotoPolicyResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.put<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof shippingPhotoPolicyResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/shipping-photo-policy", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const input = updateShippingPhotoPolicyRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.orderRepository) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    try {
      const result = await options.orderRepository.updateShippingPhotoPolicy(
        context.workspaceId,
        context.actor,
        input.data,
      );
      return reply.send(shippingPhotoPolicyResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string; orderId: string };
    Reply: ReturnType<typeof shippingPhotoPreflightResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/orders/:orderId/shipping-photo-preflight",
    async (request, reply) => {
      const context = await orderRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      if (context.error) return reply.code(context.status).send(context.error);
      if (!options.orderRepository) {
        return reply.code(503).send(orderServiceUnavailable(request.id));
      }
      try {
        const result = await options.orderRepository.shippingPhotoPreflight(
          context.workspaceId,
          context.orderId,
          context.actor,
        );
        return reply
          .header("cache-control", "private, no-store")
          .send(shippingPhotoPreflightResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; orderId: string };
    Body: unknown;
    Reply: ReturnType<typeof shippingPhotoPreflightResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/orders/:orderId/shipping-photo-preflight",
    async (request, reply) => {
      const context = await orderRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const input = evaluateShippingPhotoPreflightRequestSchema.safeParse(request.body);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
      if (!options.orderRepository) {
        return reply.code(503).send(orderServiceUnavailable(request.id));
      }
      try {
        const result = await options.orderRepository.evaluateShippingPhotoPreflight(
          context.workspaceId,
          context.orderId,
          context.actor,
          input.data,
        );
        return reply.send(shippingPhotoPreflightResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; orderId: string };
    Body: unknown;
    Reply: ReturnType<typeof shippingPhotoPreflightResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/orders/:orderId/shipping-photo-override",
    async (request, reply) => {
      const context = await orderRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const input = overrideShippingPhotoDecisionRequestSchema.safeParse(request.body);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
      if (!options.orderRepository) {
        return reply.code(503).send(orderServiceUnavailable(request.id));
      }
      try {
        const result = await options.orderRepository.overrideShippingPhotoDecision(
          context.workspaceId,
          context.orderId,
          context.actor,
          input.data,
        );
        return reply.send(shippingPhotoPreflightResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; orderId: string };
    Querystring: unknown;
    Body: Buffer;
    Reply: ReturnType<typeof shippingPhotoAssetResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/orders/:orderId/shipping-photos", async (request, reply) => {
    const context = await orderRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const query = uploadShippingPhotoQuerySchema.safeParse(request.query);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!query.success || !Buffer.isBuffer(request.body)) {
      return reply.code(400).send(mediaInputError(request.id));
    }
    if (!options.orderRepository) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    if (!options.mediaStore) return reply.code(503).send(mediaStoreUnavailable(request.id));

    let inspected: ReturnType<typeof inspectImage>;
    try {
      inspected = inspectImage(request.body);
    } catch {
      return reply.code(400).send(mediaInputError(request.id));
    }
    const assetId = randomUUID();
    const extension = inspected.mimeType === "image/jpeg" ? "jpg" : "png";
    const storageKey = `workspaces/${context.workspaceId}/originals/shipping-${context.orderId}-${assetId}.${extension}`;
    let stored: Awaited<ReturnType<PrivateMediaStore["saveOriginal"]>>;
    try {
      stored = await options.mediaStore.saveOriginal(storageKey, request.body);
    } catch {
      return reply.code(503).send(mediaStoreUnavailable(request.id));
    }
    let result: Awaited<ReturnType<OrderRepository["registerShippingPhoto"]>>;
    try {
      result = await options.orderRepository.registerShippingPhoto(
        context.workspaceId,
        context.orderId,
        context.actor,
        {
          assetId,
          role: query.data.role,
          mimeType: inspected.mimeType,
          sizeBytes: stored.sizeBytes,
          width: inspected.width,
          height: inspected.height,
          sha256: stored.sha256,
          storageKey: stored.storageKey,
          idempotencyKey: query.data.idempotencyKey,
        },
      );
    } catch (error) {
      if (stored.created) await options.mediaStore.removeOriginal(stored.storageKey, stored.sha256);
      if (error instanceof RepositoryError) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
      return reply.code(503).send(mediaStoreUnavailable(request.id));
    }
    if (result.assetId !== assetId && stored.created) {
      await options.mediaStore.removeOriginal(stored.storageKey, stored.sha256);
    }
    return reply.code(201).send(shippingPhotoAssetResponseSchema.parse(result));
  });

  app.get<{
    Params: { workspaceId: string; orderId: string; assetId: string };
  }>(
    "/v1/workspaces/:workspaceId/orders/:orderId/shipping-photos/:assetId/content",
    async (request, reply) => {
      const context = await orderRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const asset = workspaceIdSchema.safeParse(request.params.assetId);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!asset.success) return reply.code(400).send(invalidOrderInput(request.id));
      if (!options.orderRepository) {
        return reply.code(503).send(orderServiceUnavailable(request.id));
      }
      if (!options.mediaStore) return reply.code(503).send(mediaStoreUnavailable(request.id));
      try {
        const stored = await options.orderRepository.readShippingPhoto(
          context.workspaceId,
          context.orderId,
          asset.data,
          context.actor,
        );
        const sanitized = await options.mediaStore.readSanitizedOriginal({
          storageKey: stored.storageKey,
          expectedSha256: stored.sha256,
          expectedMimeType: stored.mimeType,
          expectedSizeBytes: stored.sizeBytes,
          expectedWidth: stored.width,
          expectedHeight: stored.height,
        });
        return reply
          .header("content-type", stored.mimeType)
          .header("content-length", String(sanitized.length))
          .header("content-disposition", "inline")
          .header("cache-control", "private, no-store")
          .header("pragma", "no-cache")
          .header("x-content-type-options", "nosniff")
          .send(sanitized);
      } catch (error) {
        if (error instanceof RepositoryError) {
          const mapped = mapRepositoryError(error, request.id);
          return reply.code(mapped.status).send(mapped.payload);
        }
        return reply.code(503).send(mediaStoreUnavailable(request.id));
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; orderId: string };
    Body: unknown;
    Reply: ReturnType<typeof shippingPhotoConfirmationResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/orders/:orderId/shipping-photo-confirmations",
    async (request, reply) => {
      const context = await orderRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const input = confirmShippingPhotosRequestSchema.safeParse(request.body);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
      if (!options.orderRepository) {
        return reply.code(503).send(orderServiceUnavailable(request.id));
      }
      try {
        const result = await options.orderRepository.confirmShippingPhotos(
          context.workspaceId,
          context.orderId,
          context.actor,
          input.data,
        );
        return reply.code(201).send(shippingPhotoConfirmationResponseSchema.parse(result));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; orderId: string };
    Body: unknown;
    Reply: ReturnType<typeof recordOrderSaleAmountResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/orders/:orderId/sale-amount", async (request, reply) => {
    const context = await orderRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const input = recordOrderSaleAmountRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.orderRepository) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    try {
      const result = await options.orderRepository.recordSaleAmount(
        context.workspaceId,
        context.orderId,
        context.actor,
        input.data,
      );
      return reply.code(201).send(recordOrderSaleAmountResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

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
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
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
    Reply: P0ItemResponse[] | ApiError;
  }>("/v1/workspaces/:workspaceId/p0-items", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success) return reply.code(400).send(invalidP0ItemInput(request.id));
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.p0ItemRepository) {
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    }
    try {
      const items = await options.p0ItemRepository.listItems(workspace.data, actor);
      return reply.send(p0ItemResponseSchema.array().parse(items));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: PilotRunResponse | null | ApiError;
  }>("/v1/workspaces/:workspaceId/pilot-runs/latest", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success) return reply.code(400).send(invalidP0ItemInput(request.id));
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.p0ItemRepository) {
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    }
    try {
      const run = await options.p0ItemRepository.latestPilotRun(workspace.data, actor);
      return reply.send(run === null ? null : pilotRunResponseSchema.parse(run));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: PilotRunResponse | ApiError;
  }>("/v1/workspaces/:workspaceId/pilot-runs", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const input = startPilotRunRequestSchema.safeParse(request.body);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !input.success) {
      return reply.code(400).send(invalidP0ItemInput(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.p0ItemRepository) {
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    }
    try {
      const run = await options.p0ItemRepository.startPilotRun(workspace.data, actor, input.data);
      return reply.code(201).send(pilotRunResponseSchema.parse(run));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<ReturnType<typeof captureTaskResponseSchema.array>["parse"]> | ApiError;
  }>("/v1/workspaces/:workspaceId/capture-tasks", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.p0ItemRepository)
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    try {
      return reply.send(
        captureTaskResponseSchema
          .array()
          .parse(await options.p0ItemRepository.captureTasks(context.workspaceId, context.actor)),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string; skuId: string };
    Reply: ReturnType<typeof productResearchResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/research", async (request, reply) => {
    const context = await skuRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.p0ItemRepository)
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    try {
      return reply.send(
        productResearchResponseSchema.parse(
          await options.p0ItemRepository.productResearch(
            context.workspaceId,
            context.skuId,
            context.actor,
          ),
        ),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; skuId: string };
    Body: unknown;
    Reply: ReturnType<typeof identityCandidateResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/identity-candidates", async (request, reply) => {
    const context = await skuRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const input = createIdentityCandidateRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidP0ItemInput(request.id));
    if (!options.p0ItemRepository)
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    try {
      return reply
        .code(201)
        .send(
          identityCandidateResponseSchema.parse(
            await options.p0ItemRepository.createIdentityCandidate(
              context.workspaceId,
              context.skuId,
              context.actor,
              input.data,
            ),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; skuId: string; candidateId: string };
    Body: unknown;
    Reply: ReturnType<typeof identityCandidateResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/skus/:skuId/identity-candidates/:candidateId/decision",
    async (request, reply) => {
      const context = await skuRequestContext(
        request.params,
        request.headers,
        request.id,
        authenticate,
      );
      const candidate = workspaceIdSchema.safeParse(request.params.candidateId);
      const input = confirmIdentityCandidateRequestSchema.safeParse(request.body);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!candidate.success || !input.success)
        return reply.code(400).send(invalidP0ItemInput(request.id));
      if (!options.p0ItemRepository)
        return reply.code(503).send(p0ItemServiceUnavailable(request.id));
      try {
        return reply.send(
          identityCandidateResponseSchema.parse(
            await options.p0ItemRepository.confirmIdentityCandidate(
              context.workspaceId,
              context.skuId,
              candidate.data,
              context.actor,
              input.data,
            ),
          ),
        );
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; skuId: string };
    Body: unknown;
    Reply: ReturnType<typeof marketplaceReferenceResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/market-references", async (request, reply) => {
    const context = await skuRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const input = createMarketplaceReferenceRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidP0ItemInput(request.id));
    if (!options.p0ItemRepository)
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    try {
      return reply
        .code(201)
        .send(
          marketplaceReferenceResponseSchema.parse(
            await options.p0ItemRepository.addMarketplaceReference(
              context.workspaceId,
              context.skuId,
              context.actor,
              input.data,
            ),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof p0ItemResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/p0-items", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const input = createP0ItemRequestSchema.safeParse(request.body);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !input.success) {
      return reply.code(400).send(invalidP0ItemInput(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.p0ItemRepository) {
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    }
    try {
      const item = await options.p0ItemRepository.createItem(workspace.data, actor, input.data);
      return reply.code(201).send(p0ItemResponseSchema.parse(item));
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
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    try {
      const summary = await repository.inventorySummary(workspace.data, actor);
      return reply.send(inventorySummarySchema.parse(summary));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; runId: string };
    Body: unknown;
    Reply: PilotRunResponse | ApiError;
  }>("/v1/workspaces/:workspaceId/pilot-runs/:runId/events", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const runId = workspaceIdSchema.safeParse(request.params.runId);
    const input = recordPilotExceptionRequestSchema.safeParse(request.body);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !runId.success || !input.success) {
      return reply.code(400).send(invalidP0ItemInput(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.p0ItemRepository) {
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    }
    try {
      const run = await options.p0ItemRepository.recordPilotException(
        workspace.data,
        runId.data,
        actor,
        input.data,
      );
      return reply.code(201).send(pilotRunResponseSchema.parse(run));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; runId: string };
    Body: unknown;
    Reply: PilotRunResponse | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/pilot-runs/:runId/external-invalidation",
    async (request, reply) => {
      const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
      const runId = workspaceIdSchema.safeParse(request.params.runId);
      const input = invalidatePilotRunRequestSchema.safeParse(request.body);
      const actor = await authenticate(request.headers);
      if (!actor) return reply.code(401).send(authenticationError(request.id));
      if (!workspace.success || !runId.success || !input.success) {
        return reply.code(400).send(invalidP0ItemInput(request.id));
      }
      const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
      if (actorWorkspace) return reply.code(403).send(actorWorkspace);
      if (!options.p0ItemRepository) {
        return reply.code(503).send(p0ItemServiceUnavailable(request.id));
      }
      try {
        const run = await options.p0ItemRepository.invalidatePilotRun(
          workspace.data,
          runId.data,
          actor,
          input.data,
        );
        return reply.send(pilotRunResponseSchema.parse(run));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<typeof ownerPulseResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/owner-pulse", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success) {
      return reply.code(400).send(invalidP0ItemInput(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    try {
      return reply.send(
        ownerPulseResponseSchema.parse(await repository.ownerPulse(workspace.data, actor)),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<typeof putawayCatalogResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/inventory/putaway-catalog", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success) return reply.code(400).send(invalidLocationInput(request.id));
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.p0ItemRepository) {
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    }
    try {
      const catalog = await options.p0ItemRepository.putawayCatalog(workspace.data, actor);
      return reply.send(putawayCatalogResponseSchema.parse(catalog));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: LocationNodeResponse[] | ApiError;
  }>("/v1/workspaces/:workspaceId/locations", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success) return reply.code(400).send(invalidLocationInput(request.id));
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.p0ItemRepository) {
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    }
    try {
      const locations = await options.p0ItemRepository.listLocations(workspace.data, actor);
      return reply.send(locationNodeResponseSchema.array().parse(locations));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof locationNodeResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/locations", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const input = createLocationRequestSchema.safeParse(request.body);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !input.success) {
      return reply.code(400).send(invalidLocationInput(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.p0ItemRepository) {
      return reply.code(503).send(p0ItemServiceUnavailable(request.id));
    }
    try {
      const location = await options.p0ItemRepository.createLocation(
        workspace.data,
        actor,
        input.data,
      );
      return reply.code(201).send(locationNodeResponseSchema.parse(location));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof putawayInventoryResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/inventory/putaway", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const input = putawayInventoryRequestSchema.safeParse(request.body);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !input.success) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "商品・場所ラベルと人の確認時刻を確認してください。",
          requestId: request.id,
        }),
      );
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    try {
      const result = await repository.putawayInventory(workspace.data, actor, input.data);
      return reply.code(201).send(putawayInventoryResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; locationId: string };
    Querystring: unknown;
    Body: Buffer;
    Reply: ReturnType<typeof locationPhotoResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/locations/:locationId/photos", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const location = workspaceIdSchema.safeParse(request.params.locationId);
    const input = uploadLocationPhotoQuerySchema.safeParse(request.query);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (
      !workspace.success ||
      !location.success ||
      !input.success ||
      !Buffer.isBuffer(request.body)
    ) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "場所、JPEG/PNG原本、人の確認を確認してください。",
          requestId: request.id,
        }),
      );
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.mediaStore) return reply.code(503).send(mediaStoreUnavailable(request.id));
    try {
      await repository.authorizeLocationPhotoCapture(workspace.data, location.data, actor);
      const inspected = inspectImage(request.body);
      const extension = inspected.mimeType === "image/jpeg" ? "jpg" : "png";
      const originalStorageKey = `workspaces/${workspace.data}/location-originals/${input.data.photoId}.${extension}`;
      const stored = await options.mediaStore.saveOriginal(originalStorageKey, request.body);
      try {
        const result = await repository.registerLocationPhoto(
          workspace.data,
          location.data,
          actor,
          {
            photoId: input.data.photoId,
            originalAssetId: input.data.originalAssetId,
            photoKind: input.data.photoKind,
            originalSha256: stored.sha256,
            originalStorageKey: stored.storageKey,
            mimeType: inspected.mimeType,
            sizeBytes: stored.sizeBytes,
            width: inspected.width,
            height: inspected.height,
            capturedAt: input.data.capturedAt,
            humanConfirmed: true,
          },
        );
        return reply.code(201).send(locationPhotoResponseSchema.parse(result));
      } catch (error) {
        if (stored.created) {
          await options.mediaStore.removeOriginal(stored.storageKey, stored.sha256);
        }
        throw error;
      }
    } catch (error) {
      if (!(error instanceof RepositoryError)) {
        return reply.code(400).send(mediaInputError(request.id));
      }
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; locationId: string; photoId: string };
    Body: unknown;
    Reply: ReturnType<typeof locationPhotoResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/locations/:locationId/photos/:photoId/approval",
    async (request, reply) => {
      const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
      const location = workspaceIdSchema.safeParse(request.params.locationId);
      const photo = workspaceIdSchema.safeParse(request.params.photoId);
      const input = reviewLocationPhotoRequestSchema.safeParse(request.body);
      const actor = await authenticate(request.headers);
      if (!actor) return reply.code(401).send(authenticationError(request.id));
      if (!workspace.success || !location.success || !photo.success || !input.success) {
        return reply.code(400).send(
          apiErrorSchema.parse({
            code: "invalid_request",
            message: "審査対象と人の承認を確認してください。",
            requestId: request.id,
          }),
        );
      }
      const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
      if (actorWorkspace) return reply.code(403).send(actorWorkspace);
      if (!options.mediaStore) return reply.code(503).send(mediaStoreUnavailable(request.id));
      try {
        const source = await repository.locationPhotoForReview(
          workspace.data,
          location.data,
          photo.data,
          actor,
        );
        const extension = source.mimeType === "image/jpeg" ? "jpg" : "png";
        const displayStorageKey = `workspaces/${workspace.data}/location-display/${photo.data}.${extension}`;
        const display = await options.mediaStore.createSanitizedDisplay(
          source.originalStorageKey,
          displayStorageKey,
          source.mimeType,
        );
        let result;
        try {
          result = await repository.approveLocationPhoto(
            workspace.data,
            location.data,
            photo.data,
            actor,
            {
              derivativeAssetId: randomUUID(),
              derivativeSha256: display.sha256,
              derivativeStorageKey: display.storageKey,
              gpsExifCount: 0,
              reviewedAt: input.data.reviewedAt,
              humanApproved: true,
            },
          );
        } catch (error) {
          await options.mediaStore.removeDisplay(display.storageKey, display.sha256);
          throw error;
        }
        return reply.send(locationPhotoResponseSchema.parse(result));
      } catch (error) {
        if (!(error instanceof RepositoryError)) {
          return reply.code(400).send(mediaInputError(request.id));
        }
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.get<{
    Params: { workspaceId: string; locationId: string; photoId: string };
    Reply: Buffer | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/locations/:locationId/photos/:photoId/content",
    async (request, reply) => {
      const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
      const location = workspaceIdSchema.safeParse(request.params.locationId);
      const photo = workspaceIdSchema.safeParse(request.params.photoId);
      const actor = await authenticate(request.headers);
      if (!actor) return reply.code(401).send(authenticationError(request.id));
      if (!workspace.success || !location.success || !photo.success) {
        return reply.code(400).send(
          apiErrorSchema.parse({
            code: "invalid_request",
            message: "表示対象の場所写真を確認してください。",
            requestId: request.id,
          }),
        );
      }
      const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
      if (actorWorkspace) return reply.code(403).send(actorWorkspace);
      if (!options.mediaStore) return reply.code(503).send(mediaStoreUnavailable(request.id));
      try {
        const source = await repository.approvedLocationPhotoContent(
          workspace.data,
          location.data,
          photo.data,
          actor,
        );
        const bytes = await options.mediaStore.readDisplay(
          source.displayStorageKey,
          source.displaySha256,
        );
        return reply.header("cache-control", "private, no-store").type(source.mimeType).send(bytes);
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.get<{
    Params: { workspaceId: string; locationId: string };
    Reply: ReturnType<ReturnType<typeof locationPhotoResponseSchema.array>["parse"]> | ApiError;
  }>("/v1/workspaces/:workspaceId/locations/:locationId/photos", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const location = workspaceIdSchema.safeParse(request.params.locationId);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !location.success) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          code: "invalid_request",
          message: "場所を確認してください。",
          requestId: request.id,
        }),
      );
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    try {
      const result = await repository.approvedLocationPhotos(workspace.data, location.data, actor);
      return reply.send(locationPhotoResponseSchema.array().parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string; locationId: string };
    Reply: ReturnType<ReturnType<typeof locationPhotoResponseSchema.array>["parse"]> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/locations/:locationId/photo-review-queue",
    async (request, reply) => {
      const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
      const location = workspaceIdSchema.safeParse(request.params.locationId);
      const actor = await authenticate(request.headers);
      if (!actor) return reply.code(401).send(authenticationError(request.id));
      if (!workspace.success || !location.success) {
        return reply.code(400).send(
          apiErrorSchema.parse({
            code: "invalid_request",
            message: "場所を確認してください。",
            requestId: request.id,
          }),
        );
      }
      const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
      if (actorWorkspace) return reply.code(403).send(actorWorkspace);
      try {
        const result = await repository.locationPhotosForManagement(
          workspace.data,
          location.data,
          actor,
        );
        return reply.send(locationPhotoResponseSchema.array().parse(result));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

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
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
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
    Querystring: unknown;
    Body: Buffer;
    Reply: ReturnType<typeof productMediaUploadResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/skus/:skuId/media-uploads", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const sku = workspaceIdSchema.safeParse(request.params.skuId);
    const query = uploadProductMediaQuerySchema.safeParse(request.query);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !sku.success || !query.success || !Buffer.isBuffer(request.body)) {
      return reply.code(400).send(mediaInputError(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.mediaStore) return reply.code(503).send(mediaStoreUnavailable(request.id));
    try {
      await repository.captureSummary(workspace.data, sku.data, actor);
      const inspected = inspectImage(request.body);
      const extension = inspected.mimeType === "image/jpeg" ? "jpg" : "png";
      const storageKey = `workspaces/${workspace.data}/originals/${query.data.assetId}.${extension}`;
      const stored = await options.mediaStore.saveOriginal(storageKey, request.body);
      try {
        const result = await repository.registerMediaAsset(workspace.data, sku.data, actor, {
          assetId: query.data.assetId,
          role: query.data.role,
          originalSha256: stored.sha256,
          originalStorageKey: stored.storageKey,
          mimeType: inspected.mimeType,
          sizeBytes: stored.sizeBytes,
          width: inspected.width,
          height: inspected.height,
        });
        return reply.code(201).send(
          productMediaUploadResponseSchema.parse({
            assetId: result.assetId,
            workspaceId: result.workspaceId,
            skuId: result.skuId,
            role: result.role,
            originalSha256: result.originalSha256,
            mimeType: result.mimeType,
            sizeBytes: result.sizeBytes,
            width: result.width,
            height: result.height,
            createdAt: result.createdAt,
          }),
        );
      } catch (error) {
        if (stored.created) {
          await options.mediaStore.removeOriginal(stored.storageKey, stored.sha256);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof RepositoryError) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
      return reply.code(400).send(mediaInputError(request.id));
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
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
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
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    try {
      const result = await repository.captureSummary(workspace.data, sku.data, actor);
      return reply.send(captureSummarySchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof orderOperationResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/orders", async (request, reply) => {
    const workspace = workspaceIdSchema.safeParse(request.params.workspaceId);
    const input = createOrderRequestSchema.safeParse(request.body);
    const actor = await authenticate(request.headers);
    if (!actor) return reply.code(401).send(authenticationError(request.id));
    if (!workspace.success || !input.success) {
      return reply.code(400).send(invalidOrderInput(request.id));
    }
    const actorWorkspace = actorWorkspaceError(actor, workspace.data, request.id);
    if (actorWorkspace) return reply.code(403).send(actorWorkspace);
    if (!options.orderRepository || !options.addressCipher) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    const orderId = randomUUID();
    try {
      const encryptedAddress = options.addressCipher.encrypt(
        workspace.data,
        orderId,
        input.data.shippingAddress,
      );
      const addressFingerprint = options.addressCipher.fingerprint(
        workspace.data,
        input.data.idempotencyKey,
        input.data.shippingAddress,
      );
      const result = await options.orderRepository.createOrder(workspace.data, actor, {
        orderId,
        encryptedAddress,
        addressFingerprint,
        input: input.data,
      });
      return reply.code(201).send(orderOperationResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; orderId: string };
    Body: unknown;
    Reply: ReturnType<typeof addressLeaseResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/orders/:orderId/address-leases", async (request, reply) => {
    const context = await orderRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const input = createAddressLeaseRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.orderRepository) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    try {
      const result = await options.orderRepository.createAddressLease(
        context.workspaceId,
        context.orderId,
        context.actor,
        input.data,
      );
      return reply.code(201).send(addressLeaseResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string; orderId: string };
    Querystring: unknown;
    Reply: ReturnType<typeof shippingAddressResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/orders/:orderId/address", async (request, reply) => {
    const context = await orderRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    const query = addressLeaseQuerySchema.safeParse(request.query);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!query.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.orderRepository || !options.addressCipher) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    try {
      const access = await options.orderRepository.accessEncryptedAddress(
        context.workspaceId,
        context.orderId,
        query.data.leaseId,
        context.actor,
      );
      const shippingAddress = options.addressCipher.decrypt(
        context.workspaceId,
        context.orderId,
        access.value,
      );
      return reply
        .header("cache-control", "private, no-store")
        .header("pragma", "no-cache")
        .send(
          shippingAddressResponseSchema.parse({
            orderId: context.orderId,
            shippingAddress,
            expiresAt: access.expiresAt,
          }),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  registerOrderMutation(
    "pick",
    pickOrderRequestSchema,
    (repository, workspaceId, orderId, actor, input) =>
      repository.pickOrder(workspaceId, orderId, actor, input),
  );
  registerOrderMutation(
    "pack",
    packOrderRequestSchema,
    (repository, workspaceId, orderId, actor, input) =>
      repository.packOrder(workspaceId, orderId, actor, input),
  );
  registerOrderMutation(
    "ship",
    shipOrderRequestSchema,
    (repository, workspaceId, orderId, actor, input) =>
      repository.shipOrder(workspaceId, orderId, actor, input),
  );
  registerOrderMutation(
    "return",
    returnOrderRequestSchema,
    (repository, workspaceId, orderId, actor, input) =>
      repository.returnOrder(workspaceId, orderId, actor, input),
  );
  registerOrderMutation(
    "return-quarantine",
    quarantineReturnRequestSchema,
    (repository, workspaceId, orderId, actor, input) =>
      repository.quarantineReturn(workspaceId, orderId, actor, input),
  );
  registerOrderMutation(
    "return-inspection",
    inspectReturnRequestSchema,
    (repository, workspaceId, orderId, actor, input) =>
      repository.inspectReturn(workspaceId, orderId, actor, input),
  );

  app.get<{
    Params: { workspaceId: string; orderId: string };
    Reply: ReturnType<typeof financialSummaryResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/orders/:orderId/financial-summary", async (request, reply) => {
    const context = await orderRequestContext(
      request.params,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.orderRepository) {
      return reply.code(503).send(orderServiceUnavailable(request.id));
    }
    try {
      const result = await options.orderRepository.financialSummary(
        context.workspaceId,
        context.orderId,
        context.actor,
      );
      return reply.send(financialSummaryResponseSchema.parse(result));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<ReturnType<typeof accountingOrderOptionSchema.array>["parse"]> | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/orders", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply.send(
        accountingOrderOptionSchema
          .array()
          .parse(
            await options.accountingRepository.listReadyOrders(context.workspaceId, context.actor),
          ),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<typeof accountingProfileSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/profile", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply.send(
        accountingProfileSchema.parse(
          await options.accountingRepository.getProfile(context.workspaceId, context.actor),
        ),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof accountingProfileSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/profile", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const input = updateAccountingProfileRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply.send(
        accountingProfileSchema.parse(
          await options.accountingRepository.updateProfile(
            context.workspaceId,
            context.actor,
            input.data,
          ),
        ),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string };
    Reply: ReturnType<ReturnType<typeof accountMappingRuleSchema.array>["parse"]> | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/mapping-rules", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply.send(
        accountMappingRuleSchema
          .array()
          .parse(
            await options.accountingRepository.listMappingRules(context.workspaceId, context.actor),
          ),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof accountMappingRuleSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/mapping-rules", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const input = createAccountMappingRuleRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply
        .code(201)
        .send(
          accountMappingRuleSchema.parse(
            await options.accountingRepository.createMappingRule(
              context.workspaceId,
              context.actor,
              input.data,
            ),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; ruleId: string };
    Body: unknown;
    Reply: ReturnType<typeof replaceAccountMappingRuleResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/accounting/mapping-rules/:ruleId/replacements",
    async (request, reply) => {
      const context = await workspaceRequestContext(
        request.params.workspaceId,
        request.headers,
        request.id,
        authenticate,
      );
      const rule = workspaceIdSchema.safeParse(request.params.ruleId);
      const input = replaceAccountMappingRuleRequestSchema.safeParse(request.body);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!rule.success || !input.success) {
        return reply.code(400).send(invalidOrderInput(request.id));
      }
      if (!options.accountingRepository) {
        return reply.code(503).send(accountingServiceUnavailable(request.id));
      }
      try {
        return reply
          .code(201)
          .send(
            replaceAccountMappingRuleResponseSchema.parse(
              await options.accountingRepository.replaceMappingRule(
                context.workspaceId,
                rule.data,
                context.actor,
                input.data,
              ),
            ),
          );
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: unknown;
    Reply: ReturnType<typeof versionedAccountingExportResponseSchema.parse> | ApiError;
  }>("/v1/workspaces/:workspaceId/accounting/exports", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const input = createVersionedAccountingExportRequestSchema.safeParse(request.body);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      return reply
        .code(201)
        .send(
          versionedAccountingExportResponseSchema.parse(
            await options.accountingRepository.createExport(
              context.workspaceId,
              context.actor,
              input.data,
            ),
          ),
        );
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; batchId: string };
  }>("/v1/workspaces/:workspaceId/accounting/exports/:batchId/download", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    const batch = workspaceIdSchema.safeParse(request.params.batchId);
    if (context.error) return reply.code(context.status).send(context.error);
    if (!batch.success) return reply.code(400).send(invalidOrderInput(request.id));
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      const result = await options.accountingRepository.exportContent(
        context.workspaceId,
        batch.data,
        context.actor,
      );
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${result.filename}"`)
        .header("cache-control", "private, no-store")
        .header("x-content-sha256", result.sha256)
        .send(result.csv);
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.post<{
    Params: { workspaceId: string; batchId: string };
    Body: unknown;
    Reply: ReturnType<typeof versionedAccountingExportResponseSchema.parse> | ApiError;
  }>(
    "/v1/workspaces/:workspaceId/accounting/exports/:batchId/import-confirmation",
    async (request, reply) => {
      const context = await workspaceRequestContext(
        request.params.workspaceId,
        request.headers,
        request.id,
        authenticate,
      );
      const batch = workspaceIdSchema.safeParse(request.params.batchId);
      const input = confirmAccountingImportRequestSchema.safeParse(request.body);
      if (context.error) return reply.code(context.status).send(context.error);
      if (!batch.success || !input.success) {
        return reply.code(400).send(invalidOrderInput(request.id));
      }
      if (!options.accountingRepository) {
        return reply.code(503).send(accountingServiceUnavailable(request.id));
      }
      try {
        return reply.send(
          versionedAccountingExportResponseSchema.parse(
            await options.accountingRepository.confirmImport(
              context.workspaceId,
              batch.data,
              context.actor,
              input.data,
            ),
          ),
        );
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  app.post<{
    Params: { workspaceId: string; orderId: string };
    Body: unknown;
    Reply: ApiError;
  }>("/v1/workspaces/:workspaceId/orders/:orderId/accounting-exports", async (request, reply) => {
    const context = await workspaceRequestContext(
      request.params.workspaceId,
      request.headers,
      request.id,
      authenticate,
    );
    if (context.error) return reply.code(context.status).send(context.error);
    if (!options.accountingRepository) {
      return reply.code(503).send(accountingServiceUnavailable(request.id));
    }
    try {
      await options.accountingRepository.getProfile(context.workspaceId, context.actor);
      return reply.code(410).send(legacyAccountingRouteRetired(request.id));
    } catch (error) {
      const mapped = mapRepositoryError(error, request.id);
      return reply.code(mapped.status).send(mapped.payload);
    }
  });

  app.get<{
    Params: { workspaceId: string; orderId: string; exportId: string };
    Reply: ApiError;
  }>(
    "/v1/workspaces/:workspaceId/orders/:orderId/accounting-exports/:exportId/content",
    async (request, reply) => {
      const context = await workspaceRequestContext(
        request.params.workspaceId,
        request.headers,
        request.id,
        authenticate,
      );
      if (context.error) return reply.code(context.status).send(context.error);
      if (!options.accountingRepository) {
        return reply.code(503).send(accountingServiceUnavailable(request.id));
      }
      try {
        await options.accountingRepository.getProfile(context.workspaceId, context.actor);
        return reply.code(410).send(legacyAccountingRouteRetired(request.id));
      } catch (error) {
        const mapped = mapRepositoryError(error, request.id);
        return reply.code(mapped.status).send(mapped.payload);
      }
    },
  );

  function registerOrderMutation<T>(
    operation: string,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    run: (
      repository: OrderRepository,
      workspaceId: string,
      orderId: string,
      actor: RequestActor,
      input: T,
    ) => Promise<unknown>,
  ): void {
    app.post<{ Params: { workspaceId: string; orderId: string }; Body: unknown }>(
      `/v1/workspaces/:workspaceId/orders/:orderId/${operation}`,
      async (request, reply) => {
        const context = await orderRequestContext(
          request.params,
          request.headers,
          request.id,
          authenticate,
        );
        const input = schema.safeParse(request.body);
        if (context.error) return reply.code(context.status).send(context.error);
        if (!input.success) return reply.code(400).send(invalidOrderInput(request.id));
        if (!options.orderRepository) {
          return reply.code(503).send(orderServiceUnavailable(request.id));
        }
        try {
          const result = await run(
            options.orderRepository,
            context.workspaceId,
            context.orderId,
            context.actor,
            input.data,
          );
          return reply.send(orderOperationResponseSchema.parse(result));
        } catch (error) {
          const mapped = mapRepositoryError(error, request.id);
          return reply.code(mapped.status).send(mapped.payload);
        }
      },
    );
  }

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

function mediaStoreUnavailable(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "media_store_unavailable",
    message: "非公開の写真保存先を確認できないため、安全のため停止しました。",
    requestId,
  });
}

function orderServiceUnavailable(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "order_service_unavailable",
    message: "受注・配送の安全な保存先を確認できないため、操作を停止しました。",
    requestId,
  });
}

function invalidOrderInput(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "invalid_request",
    message: "受注、配送、返品、または会計出力の入力を確認してください。",
    requestId,
  });
}

function p0ItemServiceUnavailable(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "p0_item_service_unavailable",
    message: "仕入証憑と現物を結ぶ保存先を確認できないため、操作を停止しました。",
    requestId,
  });
}

function teamServiceUnavailable(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "team_service_unavailable",
    message: "外注担当と期限付き割当の保存先を確認できないため、操作を停止しました。",
    requestId,
  });
}

function stocktakeServiceUnavailable(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "stocktake_service_unavailable",
    message: "棚卸とラベル履歴の保存先を確認できないため、操作を停止しました。",
    requestId,
  });
}

function accountingServiceUnavailable(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "accounting_service_unavailable",
    message: "会計候補とCSV履歴の安全な保存先を確認できないため、操作を停止しました。",
    requestId,
  });
}

function legacyAccountingRouteRetired(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "legacy_accounting_export_retired",
    message:
      "旧7列CSVは安全要件を満たさないため停止しました。会計設定から版管理CSVを作成してください。",
    requestId,
  });
}

function invalidP0ItemInput(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "invalid_request",
    message: "SKU、仕入証憑、原価、または確認状態を確認してください。",
    requestId,
  });
}

function invalidLocationInput(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "invalid_request",
    message: "場所名、場所コード、親場所、または保管上限を確認してください。",
    requestId,
  });
}

function mediaInputError(requestId: string): ApiError {
  return apiErrorSchema.parse({
    code: "invalid_image",
    message: "画像本体を検証または位置情報除去できませんでした。",
    requestId,
  });
}

function actorWorkspaceError(
  actor: RequestActor,
  requestedWorkspaceId: string,
  requestId: string,
): ApiError | null {
  if (!actor.workspaceId || actor.workspaceId === requestedWorkspaceId) return null;
  return apiErrorSchema.parse({
    code: "active_workspace_mismatch",
    message: "ログイン中の事業所と操作対象が一致しません。",
    requestId,
  });
}

type OrderRequestContext =
  | {
      workspaceId: string;
      orderId: string;
      actor: RequestActor;
      error?: undefined;
      status?: undefined;
    }
  | {
      error: ApiError;
      status: 400 | 401 | 403;
      workspaceId?: undefined;
      orderId?: undefined;
      actor?: undefined;
    };

async function orderRequestContext(
  params: { workspaceId: string; orderId: string },
  headers: IncomingHttpHeaders,
  requestId: string,
  authenticate: (
    headers: IncomingHttpHeaders,
  ) => RequestActor | null | Promise<RequestActor | null>,
): Promise<OrderRequestContext> {
  const actor = await authenticate(headers);
  if (!actor) return { error: authenticationError(requestId), status: 401 };
  const workspace = workspaceIdSchema.safeParse(params.workspaceId);
  const order = workspaceIdSchema.safeParse(params.orderId);
  if (!workspace.success || !order.success) {
    return { error: invalidOrderInput(requestId), status: 400 };
  }
  const actorWorkspace = actorWorkspaceError(actor, workspace.data, requestId);
  if (actorWorkspace) return { error: actorWorkspace, status: 403 };
  return { workspaceId: workspace.data, orderId: order.data, actor };
}

type WorkspaceRequestContext =
  | { workspaceId: string; actor: RequestActor; error?: undefined; status?: undefined }
  | {
      error: ApiError;
      status: 400 | 401 | 403;
      workspaceId?: undefined;
      actor?: undefined;
    };

async function workspaceRequestContext(
  workspaceId: string,
  headers: IncomingHttpHeaders,
  requestId: string,
  authenticate: (
    headers: IncomingHttpHeaders,
  ) => RequestActor | null | Promise<RequestActor | null>,
): Promise<WorkspaceRequestContext> {
  const actor = await authenticate(headers);
  if (!actor) return { error: authenticationError(requestId), status: 401 };
  const workspace = workspaceIdSchema.safeParse(workspaceId);
  if (!workspace.success) return { error: invalidLocationInput(requestId), status: 400 };
  const mismatch = actorWorkspaceError(actor, workspace.data, requestId);
  if (mismatch) return { error: mismatch, status: 403 };
  return { workspaceId: workspace.data, actor };
}

type StocktakeRequestContext =
  | {
      workspaceId: string;
      stocktakeId: string;
      actor: RequestActor;
      error?: undefined;
      status?: undefined;
    }
  | {
      error: ApiError;
      status: 400 | 401 | 403;
      workspaceId?: undefined;
      stocktakeId?: undefined;
      actor?: undefined;
    };

async function stocktakeRequestContext(
  params: { workspaceId: string; stocktakeId: string },
  headers: IncomingHttpHeaders,
  requestId: string,
  authenticate: (
    headers: IncomingHttpHeaders,
  ) => RequestActor | null | Promise<RequestActor | null>,
): Promise<StocktakeRequestContext> {
  const base = await workspaceRequestContext(params.workspaceId, headers, requestId, authenticate);
  if (base.error) return base;
  const stocktake = workspaceIdSchema.safeParse(params.stocktakeId);
  if (!stocktake.success) return { error: invalidLocationInput(requestId), status: 400 };
  return { ...base, stocktakeId: stocktake.data };
}

type SkuRequestContext =
  | {
      workspaceId: string;
      skuId: string;
      actor: RequestActor;
      error?: undefined;
      status?: undefined;
    }
  | {
      error: ApiError;
      status: 400 | 401 | 403;
      workspaceId?: undefined;
      skuId?: undefined;
      actor?: undefined;
    };

async function skuRequestContext(
  params: { workspaceId: string; skuId: string },
  headers: IncomingHttpHeaders,
  requestId: string,
  authenticate: (
    headers: IncomingHttpHeaders,
  ) => RequestActor | null | Promise<RequestActor | null>,
): Promise<SkuRequestContext> {
  const base = await workspaceRequestContext(params.workspaceId, headers, requestId, authenticate);
  if (base.error) return base;
  const sku = workspaceIdSchema.safeParse(params.skuId);
  if (!sku.success) return { error: invalidP0ItemInput(requestId), status: 400 };
  return { ...base, skuId: sku.data };
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
