import { getActionsForScene, getSceneById } from "./scenes";

export type AutomationTrigger = "manual";

export interface AutomationEntry {
  id: string;
  name: string;
  description: string;
  sceneId: string;
  trigger: AutomationTrigger;
  cadenceLabel: string;
  enabled: boolean;
  defaultInput: string;
  expectedOutput: string;
  actionIds: string[];
}

export interface AutomationRunInput {
  input?: string;
  requestedBy?: string;
}

const AUTOMATIONS: AutomationEntry[] = [
  {
    id: "weekly-report-digest",
    name: "Weekly report digest",
    description: "Turn weekly notes and metrics into an executive-ready business digest.",
    sceneId: "report-generation",
    trigger: "manual",
    cadenceLabel: "Manual weekly run",
    enabled: true,
    defaultInput: "Collect this week's notes, metrics, risks, and decisions into a digest.",
    expectedOutput: "Executive summary, metric highlights, risks, decisions, and next steps.",
    actionIds: ["export-result", "refine-output"],
  },
  {
    id: "customer-follow-up-draft",
    name: "Customer follow-up draft",
    description: "Create a polished follow-up from account notes or a customer thread.",
    sceneId: "customer-communication",
    trigger: "manual",
    cadenceLabel: "Manual account review",
    enabled: true,
    defaultInput: "Draft a follow-up using the provided customer context and desired outcome.",
    expectedOutput: "Customer-ready message, tone notes, risks, and follow-up checklist.",
    actionIds: ["draft-reply", "copy-result"],
  },
  {
    id: "process-review-checklist",
    name: "Process review checklist",
    description: "Convert an operating process into reviewable steps and blockers.",
    sceneId: "process-execution",
    trigger: "manual",
    cadenceLabel: "Manual process run",
    enabled: true,
    defaultInput: "Review this process and produce an execution checklist with blockers.",
    expectedOutput: "Checklist, owners or missing inputs, blockers, and acceptance criteria.",
    actionIds: ["next-step-plan", "export-result"],
  },
];

export function getAutomationEntries(): AutomationEntry[] {
  return AUTOMATIONS.map((entry) => ({ ...entry, actionIds: [...entry.actionIds] }));
}

export function getAutomationById(id: string): AutomationEntry | null {
  const entry = AUTOMATIONS.find((item) => item.id === id);
  return entry ? { ...entry, actionIds: [...entry.actionIds] } : null;
}

export function buildAutomationRunPrompt(entry: AutomationEntry, run: AutomationRunInput = {}): string {
  const scene = getSceneById(entry.sceneId);
  const sceneName = scene?.name ?? entry.sceneId;
  const actions = scene
    ? getActionsForScene(scene)
        .filter((action) => entry.actionIds.includes(action.id))
        .map((action) => `- ${action.label}: ${action.description}`)
        .join("\n")
    : "";
  const input = run.input?.trim() || entry.defaultInput;

  return [
    `Automation: ${entry.name}`,
    `Scene: ${sceneName}`,
    "Trigger: Manual",
    `Cadence: ${entry.cadenceLabel}`,
    `Requested by: ${run.requestedBy?.trim() || "current user"}`,
    "",
    "Automation goal:",
    entry.description,
    "",
    "Expected output:",
    entry.expectedOutput,
    "",
    "Available actions:",
    actions || "- Continue in chat",
    "",
    "Run input:",
    input,
  ].join("\n");
}
