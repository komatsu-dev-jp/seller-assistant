import { buildApp } from "./app.js";
import { PostgresWorkflowRepository } from "./repository.js";
import { createCookieAuthenticator, PostgresSessionRegistry } from "./session.js";
import { createWriteOriginValidator } from "./security.js";
import { PostgresLoginService } from "./auth.js";
import { assertRestrictedDatabaseRole } from "./db-security.js";
import { LocalPrivateMediaStore } from "./local-media-store.js";
import { AesGcmAddressCipher } from "./address-crypto.js";
import { PostgresOrderRepository } from "./order-repository.js";
import { PostgresP0ItemRepository } from "./p0-item-repository.js";
import { PostgresTeamRepository } from "./team-repository.js";
import { PostgresStocktakeRepository } from "./stocktake-repository.js";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const appOrigin = process.env.APP_ORIGIN;
const localMediaRoot = process.env.LOCAL_MEDIA_ROOT;
const addressEncryptionKey = process.env.ADDRESS_ENCRYPTION_KEY;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. The API will not silently use temporary memory storage.",
  );
}
if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required. The API will not accept unsigned actor identity.");
}
if (!appOrigin) {
  throw new Error("APP_ORIGIN is required. Write requests will not accept an unknown origin.");
}
if (!localMediaRoot) {
  throw new Error(
    "LOCAL_MEDIA_ROOT is required. Photos will not use a public or temporary fallback.",
  );
}
if (!addressEncryptionKey) {
  throw new Error(
    "ADDRESS_ENCRYPTION_KEY is required. Shipping addresses will not be stored without encryption.",
  );
}

await assertRestrictedDatabaseRole(databaseUrl);

const sessionRegistry = new PostgresSessionRegistry(databaseUrl);
const app = buildApp({
  repository: new PostgresWorkflowRepository(databaseUrl),
  authenticate: createCookieAuthenticator(sessionSecret, undefined, sessionRegistry),
  revokeSession: async (actor) => {
    if (!actor.sessionId || !actor.workspaceId) {
      throw new Error("Authenticated session and workspace are required for logout");
    }
    await sessionRegistry.revoke(actor.sessionId, actor.identityId, actor.workspaceId);
  },
  closeAuthentication: async () => sessionRegistry.close(),
  validateWriteOrigin: createWriteOriginValidator(appOrigin),
  loginService: new PostgresLoginService(databaseUrl, sessionSecret),
  mediaStore: new LocalPrivateMediaStore(localMediaRoot),
  orderRepository: new PostgresOrderRepository(databaseUrl),
  addressCipher: new AesGcmAddressCipher(addressEncryptionKey),
  p0ItemRepository: new PostgresP0ItemRepository(databaseUrl),
  teamRepository: new PostgresTeamRepository(databaseUrl),
  stocktakeRepository: new PostgresStocktakeRepository(databaseUrl),
});
const port = Number(process.env.PORT ?? 3100);

await app.listen({ host: "127.0.0.1", port });
