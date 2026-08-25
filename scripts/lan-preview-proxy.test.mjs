import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  authorizeCaRequest,
  authorizeProxyRequest,
  buildClientResponseHeaders,
  buildUpstreamHeaders,
  containsPrivateKeyMaterial,
  isLocalLanIpv4,
  loadLanPreviewConfig,
  normalizeRemoteAddress,
  safeUpstreamPath,
} from "./lan-preview-proxy.mjs";

const baseEnvironment = {
  LAN_PREVIEW_BIND_HOST: "100.64.7.28",
  LAN_PREVIEW_ALLOWED_CLIENT_IP: "100.64.7.55",
  LAN_PREVIEW_HTTPS_PORT: "4274",
  LAN_PREVIEW_CA_PORT: "4275",
  LAN_PREVIEW_CERT_PATH: resolve(".test-preview/server.crt"),
  LAN_PREVIEW_KEY_PATH: resolve(".test-preview/server.key"),
  LAN_PREVIEW_CA_CERT_PATH: resolve(".test-preview/ca.cer"),
  LAN_PREVIEW_UPSTREAM_ORIGIN: "http://127.0.0.1:4273",
};

const config = loadLanPreviewConfig(baseEnvironment);

function request({
  remoteAddress = "::ffff:100.64.7.55",
  host = "100.64.7.28:4274",
  method = "GET",
  origin,
  fetchSite,
  url = "/workflow",
} = {}) {
  return {
    method,
    url,
    socket: { remoteAddress },
    headers: {
      host,
      ...(origin ? { origin } : {}),
      ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}),
    },
  };
}

describe("LAN preview configuration", () => {
  it("locks the public and upstream origins to explicit addresses", () => {
    expect(config.externalOrigin).toBe("https://100.64.7.28:4274");
    expect(config.upstreamOrigin).toBe("http://127.0.0.1:4273");
    expect(config.allowedClientIp).toBe("100.64.7.55");
  });

  it.each([
    { LAN_PREVIEW_BIND_HOST: "0.0.0.0" },
    { LAN_PREVIEW_BIND_HOST: "127.0.0.1" },
    { LAN_PREVIEW_BIND_HOST: "8.8.8.8" },
    { LAN_PREVIEW_ALLOWED_CLIENT_IP: "any" },
    { LAN_PREVIEW_ALLOWED_CLIENT_IP: "203.0.113.9" },
    { LAN_PREVIEW_HTTPS_PORT: "80" },
    { LAN_PREVIEW_CA_PORT: "4274" },
    { LAN_PREVIEW_CERT_PATH: "relative.crt" },
    { LAN_PREVIEW_UPSTREAM_ORIGIN: "http://0.0.0.0:4273" },
    { LAN_PREVIEW_UPSTREAM_ORIGIN: "https://127.0.0.1:4273" },
    { LAN_PREVIEW_UPSTREAM_ORIGIN: "http://127.0.0.1:4273/path" },
  ])("rejects unsafe configuration %#", (change) => {
    expect(() => loadLanPreviewConfig({ ...baseEnvironment, ...change })).toThrow();
  });

  it("accepts only RFC1918 and carrier-grade local IPv4 ranges", () => {
    expect(isLocalLanIpv4("10.2.3.4")).toBe(true);
    expect(isLocalLanIpv4("172.16.0.4")).toBe(true);
    expect(isLocalLanIpv4("172.31.255.4")).toBe(true);
    expect(isLocalLanIpv4("192.168.1.4")).toBe(true);
    expect(isLocalLanIpv4("100.64.7.28")).toBe(true);
    expect(isLocalLanIpv4("100.127.255.4")).toBe(true);
    expect(isLocalLanIpv4("172.15.0.4")).toBe(false);
    expect(isLocalLanIpv4("100.128.0.4")).toBe(false);
    expect(isLocalLanIpv4("8.8.8.8")).toBe(false);
  });

  it("recognizes private-key PEM material before any CA file can be served", () => {
    expect(containsPrivateKeyMaterial("-----BEGIN PRIVATE KEY-----\nsecret")).toBe(true);
    expect(containsPrivateKeyMaterial("-----BEGIN RSA PRIVATE KEY-----\nsecret")).toBe(true);
    expect(containsPrivateKeyMaterial("-----BEGIN CERTIFICATE-----\npublic")).toBe(false);
  });
});

describe("LAN preview request boundary", () => {
  it("accepts only the configured client, Host and HTTPS origin", () => {
    expect(authorizeProxyRequest(request(), config).allowed).toBe(true);
    expect(authorizeProxyRequest(request({ remoteAddress: "100.64.7.56" }), config).code).toBe(
      "client_rejected",
    );
    expect(authorizeProxyRequest(request({ host: "100.64.7.28:9999" }), config).code).toBe(
      "host_rejected",
    );
    expect(authorizeProxyRequest(request({ origin: "https://example.invalid" }), config).code).toBe(
      "origin_rejected",
    );
    expect(authorizeProxyRequest(request({ method: "TRACE" }), config).code).toBe(
      "method_rejected",
    );
  });

  it("requires exact same-origin evidence for every state-changing request", () => {
    expect(authorizeProxyRequest(request({ method: "POST" }), config).code).toBe("origin_required");
    expect(
      authorizeProxyRequest(
        request({
          method: "POST",
          origin: config.externalOrigin,
          fetchSite: "cross-site",
        }),
        config,
      ).code,
    ).toBe("fetch_site_rejected");
    expect(
      authorizeProxyRequest(
        request({
          method: "POST",
          origin: config.externalOrigin,
          fetchSite: "same-origin",
        }),
        config,
      ).allowed,
    ).toBe(true);
    expect(
      authorizeProxyRequest(
        {
          ...request({ origin: config.externalOrigin }),
          headers: {
            host: config.externalHost,
            origin: config.externalOrigin,
            referer: "https://example.invalid/",
          },
        },
        config,
      ).code,
    ).toBe("referer_rejected");
  });

  it("does not become an open forward proxy", () => {
    expect(() => safeUpstreamPath("https://example.invalid/", config.upstreamOrigin)).toThrow();
    expect(() => safeUpstreamPath("//example.invalid/", config.upstreamOrigin)).toThrow();
    expect(safeUpstreamPath("/v1/session/context?fresh=1", config.upstreamOrigin)).toBe(
      "/v1/session/context?fresh=1",
    );
  });

  it("serves only the public CA file to the same configured client", () => {
    const allowed = request({ host: config.caHost, url: config.caPath });
    expect(authorizeCaRequest(allowed, config).allowed).toBe(true);
    expect(authorizeCaRequest({ ...allowed, url: "/server.key" }, config).code).toBe("not_found");
    expect(
      authorizeCaRequest({ ...allowed, socket: { remoteAddress: "::ffff:100.64.7.56" } }, config)
        .code,
    ).toBe("client_rejected");
  });
});

describe("LAN preview header rewriting", () => {
  it("preserves the session cookie without logging it and strips spoofed forwarding headers", () => {
    const headers = buildUpstreamHeaders(
      {
        host: config.externalHost,
        origin: config.externalOrigin,
        referer: `${config.externalOrigin}/workflow?view=mobile`,
        cookie: "resale_session=secret-value",
        connection: "keep-alive, x-remove-me",
        "x-remove-me": "secret-value",
        "x-forwarded-for": "203.0.113.9",
        "x-forwarded-unrecognized": "secret-value",
        "proxy-connection": "keep-alive",
        via: "untrusted-proxy",
        "content-type": "application/json",
      },
      config,
    );
    expect(headers).toMatchObject({
      host: "127.0.0.1:4273",
      origin: "http://127.0.0.1:4273",
      referer: "http://127.0.0.1:4273/workflow?view=mobile",
      cookie: "resale_session=secret-value",
      "content-type": "application/json",
    });
    expect(headers).not.toHaveProperty("x-forwarded-for");
    expect(headers).not.toHaveProperty("x-forwarded-unrecognized");
    expect(headers).not.toHaveProperty("proxy-connection");
    expect(headers).not.toHaveProperty("via");
    expect(headers).not.toHaveProperty("x-remove-me");
  });

  it("rewrites only an internal absolute redirect and preserves Secure Set-Cookie", () => {
    const headers = buildClientResponseHeaders(
      {
        location: "http://127.0.0.1:4273/workflow",
        "set-cookie": ["resale_session=opaque; Secure; HttpOnly; SameSite=Strict"],
      },
      config,
    );
    expect(headers.location).toBe("https://100.64.7.28:4274/workflow");
    expect(headers["set-cookie"]).toEqual([
      "resale_session=opaque; Secure; HttpOnly; SameSite=Strict",
    ]);
    expect(() =>
      buildClientResponseHeaders({ location: "https://example.invalid/" }, config),
    ).toThrow();
    expect(
      buildClientResponseHeaders({ location: "//127.0.0.1:4273/workflow" }, config).location,
    ).toBe("https://100.64.7.28:4274/workflow");
    expect(() => buildClientResponseHeaders({ location: "//example.invalid/" }, config)).toThrow();
  });
});

describe("LAN client address normalization", () => {
  it("normalizes IPv4-mapped addresses without accepting missing values", () => {
    expect(normalizeRemoteAddress("::ffff:100.64.7.55")).toBe("100.64.7.55");
    expect(normalizeRemoteAddress("100.64.7.55")).toBe("100.64.7.55");
    expect(normalizeRemoteAddress(undefined)).toBeNull();
  });
});
