import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { decryptPayload, deriveSharedKey, encryptPayload, generateRelayKeyPair } from "./crypto";
import type { E2EEHelloMessage, E2EEPayloadMessage, HttpTunnelRequest, HttpTunnelResponse } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function relayPost(relayEndpoint: string, serverId: string, role: "server" | "client", body: string): Promise<void> {
  const url = new URL(`/relay/${encodeURIComponent(serverId)}/${role}`, relayEndpoint);
  await fetch(url, { method: "POST", body, headers: { "Content-Type": "text/plain" } });
}

async function relayPoll(relayEndpoint: string, serverId: string, role: "server" | "client"): Promise<string | null> {
  const url = new URL(`/relay/${encodeURIComponent(serverId)}/${role}/poll`, relayEndpoint);
  const res = await fetch(url);
  if (res.status === 204) return null;
  const data = (await res.json()) as { message?: string | null };
  return data.message ?? null;
}

function parseJsonLine<T>(line: string): T {
  return JSON.parse(line) as T;
}

export async function runRelayHost(options: {
  relayEndpoint: string;
  serverId: string;
  hostPrivateKeyB64: string;
  hostPublicKeyB64: string;
  targetOrigin: string;
}): Promise<never> {
  let sharedKey: Buffer | null = null;
  let clientPublicKey: string | null = null;

  const sendPlain = (payload: unknown) => relayPost(options.relayEndpoint, options.serverId, "server", JSON.stringify(payload));
  const sendEncrypted = (payload: unknown) => {
    if (!sharedKey) return;
    const encrypted = encryptPayload(sharedKey, JSON.stringify(payload));
    const message: E2EEPayloadMessage = { type: "e2ee", ...encrypted };
    void sendPlain(message);
  };

  const proxyHttp = async (tunnel: HttpTunnelRequest) => {
    const target = new URL(tunnel.path, options.targetOrigin);
    const res = await fetch(target, {
      method: tunnel.method,
      headers: tunnel.headers,
      body: tunnel.body ?? undefined,
    });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    sendEncrypted({
      type: "http_response",
      id: tunnel.id,
      status: res.status,
      headers,
      body,
    } satisfies HttpTunnelResponse);
  };

  while (true) {
    const line = await relayPoll(options.relayEndpoint, options.serverId, "server");
    if (!line) continue;
    const parsed = parseJsonLine<Record<string, unknown>>(line);
    if (parsed.type === "e2ee_hello" && typeof parsed.key === "string") {
      clientPublicKey = parsed.key;
      sharedKey = deriveSharedKey(options.hostPrivateKeyB64, clientPublicKey);
      await sendPlain({ type: "e2ee_ready" });
      continue;
    }
    if (parsed.type === "e2ee" && sharedKey && typeof parsed.nonce === "string" && typeof parsed.ciphertext === "string") {
      const inner = parseJsonLine<HttpTunnelRequest>(decryptPayload(sharedKey, parsed.nonce, parsed.ciphertext));
      if (inner.type === "http_request") {
        void proxyHttp(inner);
      }
    }
  }
}

export async function runRelayClientProxy(options: {
  relayEndpoint: string;
  serverId: string;
  hostPublicKeyB64: string;
  listenPort: number;
  listenHost?: string;
}): Promise<ReturnType<typeof createServer>> {
  const clientKeys = generateRelayKeyPair();
  let sharedKey: Buffer | null = null;
  const pending = new Map<string, { resolve: (res: HttpTunnelResponse) => void; reject: (err: Error) => void }>();

  const sendPlain = (payload: unknown) => relayPost(options.relayEndpoint, options.serverId, "client", JSON.stringify(payload));
  const sendEncrypted = (payload: unknown) => {
    if (!sharedKey) throw new Error("E2EE channel not ready");
    const encrypted = encryptPayload(sharedKey, JSON.stringify(payload));
    void sendPlain({ type: "e2ee", ...encrypted } satisfies E2EEPayloadMessage);
  };

  void (async () => {
    const hello: E2EEHelloMessage = { type: "e2ee_hello", key: clientKeys.publicKeyB64 };
    while (!sharedKey) {
      await sendPlain(hello);
      const line = await relayPoll(options.relayEndpoint, options.serverId, "client");
      if (!line) continue;
      const parsed = parseJsonLine<Record<string, unknown>>(line);
      if (parsed.type === "e2ee_ready") {
        sharedKey = deriveSharedKey(clientKeys.privateKeyB64, options.hostPublicKeyB64);
      }
    }

    while (true) {
      const line = await relayPoll(options.relayEndpoint, options.serverId, "client");
      if (!line || !sharedKey) continue;
      const parsed = parseJsonLine<Record<string, unknown>>(line);
      if (parsed.type !== "e2ee" || typeof parsed.nonce !== "string" || typeof parsed.ciphertext !== "string") continue;
      const inner = parseJsonLine<HttpTunnelResponse>(decryptPayload(sharedKey, parsed.nonce, parsed.ciphertext));
      if (inner.type === "http_response") {
        const waiter = pending.get(inner.id);
        if (waiter) {
          pending.delete(inner.id);
          waiter.resolve(inner);
        }
      }
    }
  })();

  while (!sharedKey) {
    await sleep(50);
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!sharedKey) {
        res.writeHead(503);
        res.end("E2EE channel not ready");
        return;
      }
      const id = randomUUID();
      const bodyChunks: Buffer[] = [];
      for await (const chunk of req) {
        bodyChunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers[key] = value;
      }
      const tunnelReq: HttpTunnelRequest = {
        type: "http_request",
        id,
        method: req.method ?? "GET",
        path: req.url ?? "/",
        headers,
        body: bodyChunks.length > 0 ? Buffer.concat(bodyChunks).toString("utf8") : null,
      };
      const responsePromise = new Promise<HttpTunnelResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error("Relay request timed out"));
          }
        }, 120_000);
      });
      sendEncrypted(tunnelReq);
      const tunnelRes = await responsePromise;
      const headerEntries = Object.entries(tunnelRes.headers ?? {});
      res.writeHead(tunnelRes.status, Object.fromEntries(headerEntries));
      res.end(tunnelRes.body ?? "");
    } catch (error) {
      res.writeHead(502);
      res.end(String(error));
    }
  });

  server.listen(options.listenPort, options.listenHost ?? "127.0.0.1");
  return server;
}
