import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agentDir = vi.hoisted(() => ({ value: "" }));

vi.mock("@/lib/agent-dir", () => ({
  getAgentDir: () => agentDir.value,
}));

describe("middleware auth policy", () => {
  beforeEach(() => {
    agentDir.value = mkdtempSync(join(tmpdir(), "pi-mw-"));
    vi.stubEnv("PI_WEB_REMOTE", "");
    vi.stubEnv("PI_WEB_ALLOW_REMOTE_MUTATIONS", "");
    vi.stubEnv("PI_WEB_REMOTE_TOKEN", "");
  });

  afterEach(() => {
    rmSync(agentDir.value, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("blocks non-loopback API when remote is disabled", async () => {
    const { authorizeRequest } = await import("./remote-auth");
    const req = new Request("http://192.168.1.5:30141/api/sessions", {
      headers: { host: "192.168.1.5:30141" },
    });
    expect(authorizeRequest(req).authorized).toBe(false);
  });

  it("allows loopback same-origin when remote is disabled", async () => {
    const { authorizeRequest } = await import("./remote-auth");
    const req = new Request("http://127.0.0.1:30141/api/sessions", {
      headers: {
        host: "127.0.0.1:30141",
        origin: "http://127.0.0.1:30141",
      },
    });
    expect(authorizeRequest(req).authorized).toBe(true);
  });

  it("allows paired remote client with session cookie", async () => {
    const {
      authorizeRequest,
      createPairingOffer,
      enableRemoteAccess,
      redeemPairingCode,
    } = await import("./remote-auth");
    const { loadRemoteAuthConfig } = await import("./remote-auth-store");
    enableRemoteAccess();
    const config = loadRemoteAuthConfig();
    vi.stubEnv("PI_WEB_REMOTE", "1");
    vi.stubEnv("PI_WEB_REMOTE_SIGNING_SECRET", config!.signingSecret);
    const hostReq = new Request("http://127.0.0.1:30141/api/remote", {
      method: "POST",
      headers: { host: "127.0.0.1:30141", "user-agent": "host" },
    });
    const offer = createPairingOffer(hostReq);
    const { cookieValue } = redeemPairingCode(hostReq, offer.code);
    const remoteReq = new Request("http://192.168.1.5:30141/api/sessions", {
      headers: {
        host: "192.168.1.5:30141",
        cookie: `pi_web_session=${encodeURIComponent(cookieValue)}`,
      },
    });
    expect(authorizeRequest(remoteReq).authorized).toBe(true);
    const { authorizeMiddlewareRequest } = await import("./middleware-auth");
    const middlewareAuth = await authorizeMiddlewareRequest(remoteReq);
    expect(middlewareAuth.authorized).toBe(true);
  });

  it("blocks mutations for read-only remote clients", async () => {
    const { authorizeRequest, enableRemoteAccess, isAuthorizedForRequest } = await import("./remote-auth");
    const { masterToken } = enableRemoteAccess({ readOnly: true });
    const req = new Request("http://192.168.1.5:30141/api/agent/new", {
      method: "POST",
      headers: {
        host: "192.168.1.5:30141",
        authorization: `Bearer ${masterToken}`,
      },
    });
    const auth = authorizeRequest(req);
    expect(auth.authorized).toBe(true);
    expect(auth.readOnly).toBe(true);
    expect(isAuthorizedForRequest(req)).toBe(false);
  });
});
