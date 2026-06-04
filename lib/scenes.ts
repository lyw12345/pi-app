export interface Scene {
  id: string;
  title: string;
  description: string;
  defaultPrompt: string;
  outputStyle: string;
  suggestedStarters: string[];
}

export interface SceneOverrides {
  defaultPrompt?: string | null;
  outputStyle?: string | null;
  suggestedStarters?: string[] | null;
}

const STATIC_SCENES: Scene[] = [
  {
    id: "enterprise-knowledge",
    title: "Enterprise knowledge",
    description: "Answer from internal docs and policies.",
    defaultPrompt: "Use internal knowledge sources when available. Cite paths or document names.",
    outputStyle: "Concise answers with bullet points when listing facts.",
    suggestedStarters: ["What does our refund policy say?", "Summarize the onboarding checklist"],
  },
  {
    id: "report-generation",
    title: "Report generation",
    description: "Draft structured reports from notes and data.",
    defaultPrompt: "Turn source notes into a polished report with clear sections.",
    outputStyle: "Markdown with H2/H3 headings and a one-line TL;DR at the top.",
    suggestedStarters: ["Compile this week's report", "Summarize last week's call notes"],
  },
  {
    id: "customer-communication",
    title: "Customer communication",
    description: "Draft customer-facing messages and replies.",
    defaultPrompt: "Write professional, empathetic customer communications.",
    outputStyle: "Plain language, short paragraphs, no jargon.",
    suggestedStarters: ["Draft a reply to a shipping delay inquiry", "Write a follow-up email"],
  },
  {
    id: "process-execution",
    title: "Process execution",
    description: "Run repeatable operational checklists.",
    defaultPrompt: "Follow the requested process step by step and confirm each checkpoint.",
    outputStyle: "Numbered steps with status markers.",
    suggestedStarters: ["Run the monthly close checklist", "Prepare the handoff summary"],
  },
];

export function getScenes(): Scene[] {
  return STATIC_SCENES.map((scene) => mergeSceneWithOverride(scene, null));
}

export function getSceneById(sceneId: string): Scene | null {
  const scene = STATIC_SCENES.find((entry) => entry.id === sceneId);
  if (!scene) return null;
  return mergeSceneWithOverride(scene, null);
}

export function isKnownSceneId(sceneId: string): boolean {
  return STATIC_SCENES.some((entry) => entry.id === sceneId);
}

export function mergeSceneWithOverride(scene: Scene, override: SceneOverrides | null | undefined): Scene {
  if (!override) {
    return {
      ...scene,
      suggestedStarters: [...scene.suggestedStarters],
    };
  }

  return {
    ...scene,
    defaultPrompt:
      override.defaultPrompt === null
        ? ""
        : override.defaultPrompt !== undefined
          ? override.defaultPrompt
          : scene.defaultPrompt,
    outputStyle:
      override.outputStyle === null
        ? ""
        : override.outputStyle !== undefined
          ? override.outputStyle
          : scene.outputStyle,
    suggestedStarters:
      override.suggestedStarters === null
        ? []
        : override.suggestedStarters !== undefined
          ? [...override.suggestedStarters]
          : [...scene.suggestedStarters],
  };
}

export function getSceneByIdWithOverride(sceneId: string, override: SceneOverrides | null | undefined): Scene | null {
  const scene = STATIC_SCENES.find((entry) => entry.id === sceneId);
  if (!scene) return null;
  return mergeSceneWithOverride(scene, override);
}
