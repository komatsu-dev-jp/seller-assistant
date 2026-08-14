import { buildApp } from "./app.js";
import { PostgresWorkflowRepository } from "./repository.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. The API will not silently use temporary memory storage.",
  );
}

const app = buildApp({ repository: new PostgresWorkflowRepository(databaseUrl) });
const port = Number(process.env.PORT ?? 3100);

await app.listen({ host: "127.0.0.1", port });
