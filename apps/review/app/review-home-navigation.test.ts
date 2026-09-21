import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "apps/review/app/page.tsx"), "utf8");

describe("review home navigation", () => {
  it("uses browser-native links so a configured base path is applied exactly once", () => {
    expect(source).not.toContain('from "next/link"');
    expect(source).toContain('<a className={styles.primary} href="/mobile/screens/04">');
    expect(source).toContain('<a className={styles.secondary} href="/pc/2">');
    expect(source).not.toContain("<Link");
  });

  it("uses native navigation in the mobile index without requesting server route payloads", () => {
    const index = readFileSync(
      resolve(process.cwd(), "apps/review/app/mobile/screens/page.tsx"),
      "utf8",
    );
    expect(index).not.toContain('from "next/link"');
    expect(index).not.toContain("<Link");
    expect(index).toContain("<a href={`/mobile/screens/${screen}`}>{screen}</a>");
  });
});
