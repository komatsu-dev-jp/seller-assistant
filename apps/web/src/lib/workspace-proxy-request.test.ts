import { describe, expect, it } from "vitest";
import { createWorkspaceProxyRequestInit } from "./workspace-proxy-request";

const accountingDownloadUrl =
  "http://api.invalid/v1/workspaces/11111111-1111-4111-8111-111111111111/accounting/exports/22222222-2222-4222-8222-222222222222/download";

describe("workspace proxy request forwarding", () => {
  it("constructs an empty accounting download POST without a body or content type", async () => {
    const init = createWorkspaceProxyRequestInit({
      method: "POST",
      accept: "text/csv",
      cookie: "session=fake-session",
      appOrigin: "http://127.0.0.1:3000",
      body: { kind: "json", text: "" },
    });

    const headers = new Headers(init.headers);
    const forwarded = new Request(accountingDownloadUrl, init);
    expect(init.body).toBeUndefined();
    expect(headers.get("content-type")).toBeNull();
    expect(forwarded.body).toBeNull();
    expect(forwarded.headers.get("accept")).toBe("text/csv");
    expect(forwarded.headers.get("cookie")).toBe("session=fake-session");
    expect(forwarded.headers.get("origin")).toBe("http://127.0.0.1:3000");
    expect(forwarded.headers.get("sec-fetch-site")).toBe("same-origin");
    expect(await forwarded.text()).toBe("");
  });

  it("forwards the exact body and JSON content type for a non-empty JSON POST", async () => {
    const body = JSON.stringify({ result: "success", humanConfirmed: true });
    const init = createWorkspaceProxyRequestInit({
      method: "POST",
      accept: "application/json",
      cookie: "session=fake-session",
      appOrigin: "http://127.0.0.1:3000",
      body: { kind: "json", text: body },
    });

    const forwarded = new Request(accountingDownloadUrl, init);
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(await forwarded.text()).toBe(body);
  });
});
