import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agentDir = vi.hoisted(() => ({ value: "" }));

vi.mock("@/lib/agent-dir", () => ({
  getAgentDir: () => agentDir.value,
}));

describe("remote auth", () => {
  beforeEach(() => {
    agentDir.value = mkdtempSync(join(tmpdir(), "pi-remote-auth-"));
    vi.stubEnv("PI_WEB_REMOTE", "");
    vi.stubEnv("PI_WEB_REMOTE_TOKEN", "");
    vi.stubEnv("PI_WEB_REMOTE_SIGNING_SECRET", "");
    vi.stubEnv("PI_WEB_ALLOW_REMOTE_MUTATIONS", "");
    vi.stubEnv("PI_WEB_REMOTE_READ_ONLY", "");
  });

  afterEach(() => {
    rmSync(agentDir.value, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("allows loopback requests when remote is disabled", async () => {
    const { authorizeRequest } = await import("./remote-auth");
    const req = new Request("http://127.0.0.1:30141/api/sessions", {
      headers: { host: "127.0.0.1:30141" },
    });
    expect(authorizeRequest(req).authorized).toBe(true);
  });

  it("rejects non-loopback requests when remote is disabled", async () => {
    const { authorizeRequest } = await import("./remote-auth");
    const req = new Request("http://192.168.1.10:30141/api/sessions", {
      headers: { host: "192.168.1.10:30141" },
    });
    expect(authorizeRequest(req).authorized).toBe(false);
  });

  it("issues and verifies signed session cookies", async () => {
    const { enableRemoteAccess, issueSessionCookieValue, parseSessionCookieValue, redeemPairingCode } = await import("./remote-auth");
    const { loadRemoteAuthConfig } = await import("./remote-auth-store");

    enableRemoteAccess();
    const config = loadRemoteAuthConfig();
    expect(config?.enabled).toBe(true);

    const req = new Request("http://127.0.0.1:30141/api/remote", {
      method: "POST",
      headers: { host: "127.0.0.1:30141", "user-agent": "vitest" },
    });
    const { createPairingOffer } = await import("./remote-auth");
    const offer = createPairingOffer(req);
    const { cookieValue } = redeemPairingCode(req, offer.code);
    const secret = config!.signingSecret;
    const parsed = parseSessionCookieValue(cookieValue, secret);
    expect(parsed?.sessionId).toBeTruthy();

    const expiresAtMs = Date.now() + 60_000;
    const signed = issueSessionCookieValue("session-1", expiresAtMs, secret);
    expect(parseSessionCookieValue(signed, secret)?.sessionId).toBe("session-1");
  });

  it("accepts bearer master token after enable", async () => {
    const { enableRemoteAccess, authorizeRequest } = await import("./remote-auth");
    const { masterToken } = enableRemoteAccess();
    const req = new Request("http://192.168.1.10:30141/api/sessions", {
      headers: {
        host: "192.168.1.10:30141",
        authorization: `Bearer ${masterToken}`,
      },
    });
    expect(authorizeRequest(req).authorized).toBe(true);
  });

  it("blocks mutations in read-only mode", async () => {
    const { enableRemoteAccess, authorizeRequest } = await import("./remote-auth");
    const { masterToken } = enableRemoteAccess({ readOnly: true });
    const req = new Request("http://192.168.1.10:30141/api/agent/new", {
      method: "POST",
      headers: {
        host: "192.168.1.10:30141",
        authorization: `Bearer ${masterToken}`,
      },
    });
    const auth = authorizeRequest(req);
    expect(auth.authorized).toBe(true);
    expect(auth.readOnly).toBe(true);
    const { isAuthorizedForRequest } = await import("./remote-auth");
    expect(isAuthorizedForRequest(req)).toBe(false);
  });
});
