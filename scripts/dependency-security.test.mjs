import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import Fastify from "fastify";
import { z } from "zod";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const require = createRequire(import.meta.url);
const copiesOf = (name) =>
  Object.entries(lock.packages).filter(([path]) => path.endsWith(`node_modules/${name}`));

it("keeps every locked copy outside the October 2026 advisory ranges", () => {
  const minimums = {
    next: { 16: "16.4.1" },
    zod: { 4: "4.6.6" },
    fastify: { 5: "5.12.6" },
    vitest: { 4: "4.1.12" },
    "@vitest/coverage-v8": { 4: "4.1.12" },
    "@vitest/mocker": { 4: "4.1.12" },
    vite: { 8.2: "8.2.4" },
    "brace-expansion": { 5: "5.0.12" },
    "source-map-js": { 1: "1.2.2" },
    "fast-uri": { 3: "3.1.9", 4: "4.2.3" },
    sharp: { 0: "0.35.5" },
  };
  for (const [name, lines] of Object.entries(minimums)) {
    const copies = copiesOf(name);
    expect(copies.length, name).toBeGreaterThan(0);
    for (const [path, { version }] of copies) {
      expect(version, path).toMatch(/^\d+\.\d+\.\d+$/u);
      const parts = version.split(".");
      const minimum = lines[parts.slice(0, 2).join(".")] ?? lines[Number(parts[0])];
      expect(minimum, `review advisory coverage for ${path}@${version}`).toBeDefined();
      const current = version.split(".").map(Number);
      const required = minimum.split(".").map(Number);
      const firstDifference = current.findIndex((part, index) => part !== required[index]);
      expect(
        firstDifference === -1 || current[firstDifference] > required[firstDifference],
        path,
      ).toBe(true);
    }
  }
});

it.each(["array", "set", "map"])(
  "rejects an oversized %s before parsing its elements, but accepts normal data",
  (kind) => {
    let visited = 0;
    const element = z.string().refine(() => {
      visited += 1;
      return true;
    });
    const values = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const schema =
      kind === "array"
        ? z.array(element).max(2)
        : kind === "set"
          ? z.set(element).max(2)
          : z.map(z.string(), element).max(2);
    const collection = (items) =>
      kind === "array"
        ? items
        : kind === "set"
          ? new Set(items)
          : new Map(items.map((value) => [value, value]));
    const invalid = schema.safeParse(collection(values));
    expect(invalid.success).toBe(false);
    expect(visited).toBe(0);
    expect(invalid.error.issues).toHaveLength(1);
    const valid = collection(values.slice(0, 2));
    expect(schema.parse(valid)).toEqual(valid);
    expect(visited).toBe(2);
  },
);

it.each(["enum", "const"])("enforces case-insensitive header-name %s constraints", async (kind) => {
  const app = Fastify();
  try {
    app.get(
      "/dependency-security-check",
      {
        schema: {
          headers: {
            type: "object",
            propertyNames: {
              not: kind === "enum" ? { enum: ["X-Debug-Override"] } : { const: "X-Debug-Override" },
            },
          },
        },
      },
      async () => ({ ok: true }),
    );
    for (const header of ["x-debug-override", "X-Debug-Override", "x-DeBuG-oVeRrIdE"]) {
      const response = await app.inject({
        url: "/dependency-security-check",
        headers: { [header]: "1" },
      });
      expect(response.statusCode).toBe(400);
    }
    const normal = await app.inject({
      url: "/dependency-security-check",
      headers: { "x-request-id": "synthetic-control" },
    });
    expect(normal.statusCode).toBe(200);
    expect(normal.json()).toEqual({ ok: true });
  } finally {
    await app.close();
  }
});

it("does not decode a hidden executable URI scheme in any installed fast-uri copy", () => {
  for (const [path] of copiesOf("fast-uri")) {
    const uri = require(fileURLToPath(new URL(`../${path}`, import.meta.url)));
    for (const input of [
      "%6Aavascript:alert(1)",
      "%u006Aavascript:alert(1)",
      "%64ata:text/plain,test",
    ]) {
      expect(uri.parse(input).scheme, path).not.toBe("javascript");
      expect(uri.parse(input).scheme, path).not.toBe("data");
      expect(uri.normalize(input), path).not.toMatch(/^(?:javascript|data):/iu);
      expect(() => uri.resolve("https://example.test/", input), path).toThrow(
        "URI scheme is malformed.",
      );
    }
    expect(uri.normalize("https://example.test/path"), path).toBe("https://example.test/path");
    expect(uri.resolve("https://example.test/", "normal"), path).toBe(
      "https://example.test/normal",
    );
  }
});
