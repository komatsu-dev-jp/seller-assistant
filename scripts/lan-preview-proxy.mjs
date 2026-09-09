import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer, request as createHttpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const allowedMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const fixedCaPath = "/resale-ops-local-preview-ca.cer";
const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
]);
const spoofableForwardingHeaders = new Set([
  "forwarded",
  "true-client-ip",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
]);

export function loadLanPreviewConfig(environment) {
  const bindHost = required(environment, "LAN_PREVIEW_BIND_HOST");
  const allowedClientIp = required(environment, "LAN_PREVIEW_ALLOWED_CLIENT_IP");
  const httpsPort = parsePort(required(environment, "LAN_PREVIEW_HTTPS_PORT"));
  const caPort = parsePort(required(environment, "LAN_PREVIEW_CA_PORT"));
  const certificatePath = absolutePath(environment, "LAN_PREVIEW_CERT_PATH");
  const privateKeyPath = absolutePath(environment, "LAN_PREVIEW_KEY_PATH");
  const caCertificatePath = absolutePath(environment, "LAN_PREVIEW_CA_CERT_PATH");
  const upstreamOrigin = parseLoopbackUpstream(
    required(environment, "LAN_PREVIEW_UPSTREAM_ORIGIN"),
  );

  if (!isLocalLanIpv4(bindHost)) {
    throw new Error("LAN_PREVIEW_BIND_HOST must be one explicit local-only IPv4 address");
  }
  if (!isLocalLanIpv4(allowedClientIp)) {
    throw new Error("LAN_PREVIEW_ALLOWED_CLIENT_IP must be one explicit local-only IPv4 address");
  }
  if (httpsPort === caPort) {
    throw new Error("LAN preview HTTPS and CA ports must be different");
  }
  if (new Set([certificatePath, privateKeyPath, caCertificatePath]).size !== 3) {
    throw new Error("LAN preview TLS paths must refer to three different files");
  }

  return Object.freeze({
    bindHost,
    allowedClientIp,
    httpsPort,
    caPort,
    certificatePath,
    privateKeyPath,
    caCertificatePath,
    upstreamOrigin: upstreamOrigin.origin,
    externalOrigin: `https://${bindHost}:${httpsPort}`,
    externalHost: `${bindHost}:${httpsPort}`,
    caHost: `${bindHost}:${caPort}`,
    caPath: fixedCaPath,
  });
}

export function readLanPreviewFiles(config) {
  try {
    const certificate = readFileSync(config.certificatePath);
    const privateKey = readFileSync(config.privateKeyPath);
    const caCertificate = readFileSync(config.caCertificatePath);
    if (
      containsPrivateKeyMaterial(certificate) ||
      containsPrivateKeyMaterial(caCertificate) ||
      !containsPrivateKeyMaterial(privateKey)
    ) {
      throw new Error("Unexpected key material");
    }
    const leaf = new X509Certificate(certificate);
    const ca = new X509Certificate(caCertificate);
    const parsedPrivateKey = createPrivateKey(privateKey);
    const now = Date.now();
    if (
      ca.ca !== true ||
      leaf.ca !== false ||
      leaf.checkIP(config.bindHost) !== config.bindHost ||
      !leaf.verify(ca.publicKey) ||
      !createPublicKey(parsedPrivateKey).equals(leaf.publicKey) ||
      Date.parse(leaf.validFrom) > now ||
      Date.parse(leaf.validTo) <= now ||
      Date.parse(ca.validFrom) > now ||
      Date.parse(ca.validTo) <= now
    ) {
      throw new Error("Certificate boundary mismatch");
    }
    return Object.freeze({ certificate, privateKey, caCertificate });
  } catch {
    throw new Error("LAN preview certificate files are invalid or do not match");
  }
}

export function containsPrivateKeyMaterial(value) {
  return /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/u.test(
    Buffer.isBuffer(value) ? value.toString("utf8") : String(value),
  );
}

export function isLocalLanIpv4(value) {
  if (isIP(value) !== 4) return false;
  const [first, second] = value.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

export function normalizeRemoteAddress(remoteAddress) {
  if (typeof remoteAddress !== "string") return null;
  return remoteAddress.startsWith("::ffff:") ? remoteAddress.slice(7) : remoteAddress;
}

export function authorizeProxyRequest(request, config) {
  if (normalizeRemoteAddress(request.socket?.remoteAddress) !== config.allowedClientIp) {
    return { allowed: false, status: 403, code: "client_rejected" };
  }
  if (request.headers.host !== config.externalHost) {
    return { allowed: false, status: 421, code: "host_rejected" };
  }
  const method = String(request.method ?? "GET").toUpperCase();
  if (!allowedMethods.has(method)) {
    return { allowed: false, status: 405, code: "method_rejected" };
  }
  const origin = firstHeader(request.headers.origin);
  if (origin && origin !== config.externalOrigin) {
    return { allowed: false, status: 403, code: "origin_rejected" };
  }
  if (
    (stateChangingMethods.has(method) || method === "OPTIONS") &&
    origin !== config.externalOrigin
  ) {
    return { allowed: false, status: 403, code: "origin_required" };
  }
  const fetchSite = firstHeader(request.headers["sec-fetch-site"]);
  if (
    (stateChangingMethods.has(method) || method === "OPTIONS") &&
    fetchSite &&
    fetchSite !== "same-origin"
  ) {
    return { allowed: false, status: 403, code: "fetch_site_rejected" };
  }
  const referer = firstHeader(request.headers.referer);
  if (referer && !hasExactOrigin(referer, config.externalOrigin)) {
    return { allowed: false, status: 403, code: "referer_rejected" };
  }
  try {
    safeUpstreamPath(request.url, config.upstreamOrigin);
  } catch {
    return { allowed: false, status: 400, code: "target_rejected" };
  }
  return { allowed: true, status: 200, code: "allowed" };
}

export function authorizeCaRequest(request, config) {
  if (normalizeRemoteAddress(request.socket?.remoteAddress) !== config.allowedClientIp) {
    return { allowed: false, status: 403, code: "client_rejected" };
  }
  if (request.headers.host !== config.caHost) {
    return { allowed: false, status: 421, code: "host_rejected" };
  }
  if (request.method !== "GET" || request.url !== config.caPath) {
    return { allowed: false, status: 404, code: "not_found" };
  }
  return { allowed: true, status: 200, code: "allowed" };
}

export function buildUpstreamHeaders(headers, config) {
  const blocked = blockedHeaderNames(headers);
  const result = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (
      value === undefined ||
      blocked.has(name) ||
      spoofableForwardingHeaders.has(name) ||
      name.startsWith("x-forwarded-") ||
      name === "host" ||
      name === "origin" ||
      name === "referer"
    ) {
      continue;
    }
    result[name] = value;
  }
  result.host = new URL(config.upstreamOrigin).host;
  if (firstHeader(headers.origin)) result.origin = config.upstreamOrigin;
  const referer = firstHeader(headers.referer);
  if (referer) result.referer = rewriteIncomingReferer(referer, config);
  return result;
}

export function buildClientResponseHeaders(headers, config) {
  const blocked = blockedHeaderNames(headers);
  const result = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (value === undefined || blocked.has(name)) continue;
    if (name === "location") {
      result[name] = rewriteLocation(firstHeader(value), config);
    } else {
      result[name] = value;
    }
  }
  return result;
}

export function safeUpstreamPath(rawPath, upstreamOrigin) {
  if (typeof rawPath !== "string" || !rawPath.startsWith("/") || rawPath.startsWith("//")) {
    throw new Error("Unsafe proxy target");
  }
  const target = new URL(rawPath, upstreamOrigin);
  if (target.origin !== upstreamOrigin || target.hash) throw new Error("Unsafe proxy target");
  return `${target.pathname}${target.search}`;
}

export function startLanPreview(config, files, logger = console) {
  const upstream = new URL(config.upstreamOrigin);
  const httpsServer = createHttpsServer(
    {
      cert: files.certificate,
      key: files.privateKey,
      minVersion: "TLSv1.2",
    },
    (request, response) => {
      const authorization = authorizeProxyRequest(request, config);
      if (!authorization.allowed) {
        sendSafeError(response, authorization.status, authorization.code);
        return;
      }
      let upstreamRequest;
      try {
        upstreamRequest = createHttpRequest(
          {
            hostname: upstream.hostname,
            port: Number(upstream.port),
            method: request.method,
            path: safeUpstreamPath(request.url, config.upstreamOrigin),
            headers: buildUpstreamHeaders(request.headers, config),
          },
          (upstreamResponse) => {
            let responseHeaders;
            try {
              responseHeaders = buildClientResponseHeaders(upstreamResponse.headers, config);
            } catch {
              upstreamResponse.destroy();
              sendSafeError(response, 502, "upstream_redirect_rejected");
              return;
            }
            response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
            upstreamResponse.pipe(response);
          },
        );
      } catch {
        sendSafeError(response, 400, "request_rejected");
        return;
      }
      upstreamRequest.setTimeout(120_000, () => upstreamRequest.destroy());
      upstreamRequest.on("error", () => {
        if (!response.headersSent) sendSafeError(response, 502, "upstream_unavailable");
        else response.destroy();
      });
      request.on("aborted", () => upstreamRequest.destroy());
      request.pipe(upstreamRequest);
    },
  );

  const caServer = createHttpServer((request, response) => {
    const authorization = authorizeCaRequest(request, config);
    if (!authorization.allowed) {
      sendSafeError(response, authorization.status, authorization.code);
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store, max-age=0",
      "content-disposition": 'attachment; filename="resale-ops-local-preview-ca.cer"',
      "content-length": String(files.caCertificate.length),
      "content-type": "application/pkix-cert",
      "x-content-type-options": "nosniff",
    });
    response.end(files.caCertificate);
  });

  httpsServer.on("clientError", (_error, socket) => socket.destroy());
  caServer.on("clientError", (_error, socket) => socket.destroy());
  const httpsSockets = trackConnections(httpsServer);
  const caSockets = trackConnections(caServer);

  const ready = Promise.all([
    listen(httpsServer, config.httpsPort, config.bindHost),
    listen(caServer, config.caPort, config.bindHost),
  ])
    .then(() => {
      logger.info(`LAN preview ready at ${config.externalOrigin}`);
      logger.info(`Public CA download: http://${config.caHost}${config.caPath}`);
    })
    .catch(async () => {
      await Promise.allSettled([
        closeServer(httpsServer, httpsSockets),
        closeServer(caServer, caSockets),
      ]);
      throw new Error("LAN preview ports could not be opened");
    });

  let closingPromise;
  return Object.freeze({
    ready,
    async close() {
      closingPromise ??= Promise.all([
        closeServer(httpsServer, httpsSockets),
        closeServer(caServer, caSockets),
      ]).then(() => undefined);
      await closingPromise;
    },
  });
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function absolutePath(environment, name) {
  const value = required(environment, name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("LAN preview ports must be integers from 1024 to 65535");
  }
  return port;
}

function parseLoopbackUpstream(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("LAN_PREVIEW_UPSTREAM_ORIGIN must be an absolute URL");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin !== value
  ) {
    throw new Error("LAN_PREVIEW_UPSTREAM_ORIGIN must be an exact loopback HTTP origin");
  }
  return url;
}

function firstHeader(value) {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function blockedHeaderNames(headers) {
  const blocked = new Set(hopByHopHeaders);
  const connection = firstHeader(headers.connection);
  if (connection) {
    for (const token of connection.split(",")) blocked.add(token.trim().toLowerCase());
  }
  return blocked;
}

function rewriteIncomingReferer(referer, config) {
  let parsed;
  try {
    parsed = new URL(referer);
  } catch {
    throw new Error("Invalid referer");
  }
  if (parsed.origin !== config.externalOrigin) throw new Error("Invalid referer origin");
  return `${config.upstreamOrigin}${parsed.pathname}${parsed.search}`;
}

function hasExactOrigin(value, expectedOrigin) {
  try {
    return new URL(value).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function rewriteLocation(location, config) {
  if (!location) return location;
  if (location.startsWith("/") && !location.startsWith("//")) return location;
  let parsed;
  try {
    parsed = new URL(location, config.upstreamOrigin);
  } catch {
    throw new Error("Invalid upstream redirect");
  }
  if (parsed.origin !== config.upstreamOrigin) throw new Error("External redirect rejected");
  return `${config.externalOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function sendSafeError(response, status, code) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const body = JSON.stringify({ code });
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(body)),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function trackConnections(server) {
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  return sockets;
}

function closeServer(server, sockets) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      for (const socket of sockets) socket.destroy();
      resolve();
      return;
    }
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections?.();
      finish();
    }, 2_000);
    timer.unref();
    server.close(finish);
    server.closeIdleConnections?.();
  });
}
