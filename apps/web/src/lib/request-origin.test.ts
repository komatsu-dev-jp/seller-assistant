import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { matchesConfiguredAppOrigin } from "./request-origin";

describe("web proxy origin validation", () => {
  it("accepts an exact browser Origin for write requests", () => {
    const request = new NextRequest("http://127.0.0.1:43121/v1/session/login", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:43121" },
    });
    expect(matchesConfiguredAppOrigin(request, "http://127.0.0.1:43121", true)).toBe(true);
  });

  it("rejects missing and cross-site browser Origin for write requests", () => {
    const missing = new NextRequest("http://127.0.0.1:43121/v1/session/login", {
      method: "POST",
    });
    const crossSite = new NextRequest("http://127.0.0.1:43121/v1/session/login", {
      method: "POST",
      headers: { origin: "https://attacker.invalid" },
    });
    expect(matchesConfiguredAppOrigin(missing, "http://127.0.0.1:43121", true)).toBe(false);
    expect(matchesConfiguredAppOrigin(crossSite, "http://127.0.0.1:43121", true)).toBe(false);
  });

  it("uses forwarded host and protocol only for read requests without Origin", () => {
    const request = new NextRequest("http://internal:3000/v1/session/context", {
      headers: {
        host: "internal:3000",
        "x-forwarded-host": "resale.example.invalid",
        "x-forwarded-proto": "https",
      },
    });
    expect(matchesConfiguredAppOrigin(request, "https://resale.example.invalid", false)).toBe(true);
    expect(matchesConfiguredAppOrigin(request, "http://resale.example.invalid", false)).toBe(false);
  });
});
