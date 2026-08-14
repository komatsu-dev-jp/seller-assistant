import { buildApp } from "./app.js";
import { PostgresWorkflowRepository } from "./repository.js";
import { createCookieAuthenticator, PostgresSessionRegistry } from "./session.js";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. The API will not silently use temporary memory storage.",
  );
}
if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required. The API will not accept unsigned actor identity.");
}

const sessionRegistry = new PostgresSessionRegistry(databaseUrl);
const app = buildApp({
  repository: new PostgresWorkflowRepository(databaseUrl),
  authenticate: createCookieAuthenticator(sessionSecret, undefined, sessionRegistry),
  revokeSession: async (actor) => {
    if (!actor.sessionId) throw new Error("Authenticated session ID is required for logout");
    await sessionRegistry.revoke(actor.sessionId, actor.identityId);
  },
  closeAuthentication: async () => sessionRegistry.close(),
});
const port = Number(process.env.PORT ?? 3100);

await app.listen({ host: "127.0.0.1", port });
