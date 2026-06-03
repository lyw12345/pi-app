import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { loadPiWebPreferences } from "@/lib/pi-web-preferences";

export interface OnboardingStatus {
  completed: boolean;
  needsWorkspace: boolean;
  needsAccount: boolean;
  hasModels: boolean;
}

export function getOnboardingStatus(): OnboardingStatus {
  const prefs = loadPiWebPreferences();
  const completed = Boolean(prefs.onboardingCompletedAt);
  const needsWorkspace = !prefs.defaultWorkspaceCwd;

  let hasModels = false;
  let needsAccount = true;
  try {
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);
    const available = registry.getAvailable();
    hasModels = available.length > 0;
    needsAccount = !hasModels;
  } catch {
    hasModels = false;
    needsAccount = true;
  }

  return {
    completed,
    needsWorkspace,
    needsAccount,
    hasModels,
  };
}
