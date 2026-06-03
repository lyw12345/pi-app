#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "../lib/agent-dir.js";
import { runRelayHost } from "../lib/pi-relay/tunnel";
import { DEFAULT_RELAY_ENDPOINT } from "../lib/pi-relay/types";

function loadRelayFromConfig(): { serverId: string; hostPrivateKeyB64: string; hostPublicKeyB64: string; defaultEndpoint: string } {
  const path = join(getAgentDir(), "pi-web-remote.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    relay?: {
      serverId?: string;
      hostPrivateKeyB64?: string;
      hostPublicKeyB64?: string;
      defaultEndpoint?: string;
    };
  };
  if (!parsed.relay?.serverId || !parsed.relay.hostPrivateKeyB64 || !parsed.relay.hostPublicKeyB64) {
    throw new Error("No relay keys in pi-web-remote.json — generate an E2EE offer in Settings first");
  }
  return {
    serverId: parsed.relay.serverId,
    hostPrivateKeyB64: parsed.relay.hostPrivateKeyB64,
    hostPublicKeyB64: parsed.relay.hostPublicKeyB64,
    defaultEndpoint: parsed.relay.defaultEndpoint ?? DEFAULT_RELAY_ENDPOINT,
  };
}

const relay = loadRelayFromConfig();
const targetOrigin = process.env.PI_WEB_TARGET ?? "http://127.0.0.1:30141";
const relayEndpoint = process.env.PI_RELAY_ENDPOINT ?? relay.defaultEndpoint;

console.log(`pi-relay host: serverId=${relay.serverId} relay=${relayEndpoint} target=${targetOrigin}`);
void runRelayHost({
  relayEndpoint,
  serverId: relay.serverId,
  hostPrivateKeyB64: relay.hostPrivateKeyB64,
  hostPublicKeyB64: relay.hostPublicKeyB64,
  targetOrigin,
});
