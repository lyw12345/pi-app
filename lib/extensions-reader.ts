import { basename } from "node:path";
import {
  DefaultPackageManager,
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@/lib/agent-dir";
import { loadPiWebPreferences } from "@/lib/pi-web-preferences";

export interface ExtensionListItem {
  path: string;
  resolvedPath: string;
  displayName: string;
  enabled: boolean;
  source: string;
  scope?: string;
  commands: Array<{ name: string; description?: string }>;
  loadError?: string;
}

export interface ExtensionsSnapshot {
  cwd: string;
  agentDir: string;
  extensions: ExtensionListItem[];
  errors: Array<{ path: string; error: string }>;
}

const CACHE_TTL_MS = 30_000;

declare global {
  var __piExtensionsCache: Map<string, { at: number; data: ExtensionsSnapshot }> | undefined;
}

function getCache(): Map<string, { at: number; data: ExtensionsSnapshot }> {
  if (!globalThis.__piExtensionsCache) {
    globalThis.__piExtensionsCache = new Map();
  }
  return globalThis.__piExtensionsCache;
}

export function resolveExtensionsCwd(queryCwd?: string | null): string {
  const trimmed = queryCwd?.trim();
  if (trimmed) return trimmed;
  return loadPiWebPreferences().defaultWorkspaceCwd ?? process.cwd();
}

export async function listExtensions(cwd: string): Promise<ExtensionsSnapshot> {
  const agentDir = getAgentDir();
  const cacheKey = `${cwd}|${agentDir}`;
  const cached = getCache().get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const settingsManager = SettingsManager.create(cwd, agentDir);
  const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
  });
  await loader.reload();
  const resolved = await packageManager.resolve();
  const loadResult = loader.getExtensions();

  const loadedByPath = new Map<string, (typeof loadResult.extensions)[number]>();
  for (const extension of loadResult.extensions) {
    loadedByPath.set(extension.path, extension);
    loadedByPath.set(extension.resolvedPath, extension);
  }

  const errorByPath = new Map(loadResult.errors.map((entry) => [entry.path, entry.error]));

  const extensions: ExtensionListItem[] = resolved.extensions.map((resource) => {
    const loaded = loadedByPath.get(resource.path);
    const loadError = resource.enabled
      ? errorByPath.get(resource.path) ?? (loaded ? errorByPath.get(loaded.resolvedPath) : undefined)
      : undefined;
    const commands = loaded
      ? [...loaded.commands.values()].map((command) => ({
          name: command.name,
          description: command.description,
        }))
      : [];

    return {
      path: resource.path,
      resolvedPath: loaded?.resolvedPath ?? resource.path,
      displayName: basename(resource.path),
      enabled: resource.enabled,
      source: resource.metadata.source,
      scope: resource.metadata.scope,
      commands,
      loadError,
    };
  });

  const snapshot: ExtensionsSnapshot = {
    cwd,
    agentDir,
    extensions,
    errors: loadResult.errors.map((entry) => ({ ...entry })),
  };

  getCache().set(cacheKey, { at: Date.now(), data: snapshot });
  return snapshot;
}
