import { describe, expect, it } from "vitest";
import { createWriteOriginValidator } from "./security.js";

describe("write origin validation", () => {
  it("accepts only the exact configured same-origin request", () => {
    const validate = createWriteOriginValidator("https://resale.example");
    expect(validate({ origin: "https://resale.example", "sec-fetch-site": "same-origin" })).toBe(
      true,
    );
    expect(validate({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })).toBe(
      false,
    );
    expect(validate({ origin: "https://resale.example.evil.example" })).toBe(false);
    expect(validate({})).toBe(false);
  });

  it("allows explicit local http development but rejects paths and credentials", () => {
    expect(
      createWriteOriginValidator("http://127.0.0.1:3101")({
        origin: "http://127.0.0.1:3101",
      }),
    ).toBe(true);
    expect(() => createWriteOriginValidator("https://resale.example/path")).toThrow(/origin/u);
    expect(() => createWriteOriginValidator("https://user:pass@resale.example")).toThrow(/origin/u);
  });
});
