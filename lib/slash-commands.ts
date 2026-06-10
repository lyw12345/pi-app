export type SlashCommandKind = "extension" | "prompt" | "skill";

export interface SlashCommandEntry {
  name: string;
  description?: string;
  source: SlashCommandKind;
}

export interface SlashCommandListSource {
  extensionRunner: {
    getRegisteredCommands(): Array<{
      invocationName: string;
      description?: string;
    }>;
  };
  promptTemplates: ReadonlyArray<{ name: string; description?: string }>;
  resourceLoader: {
    getSkills(): { skills: Array<{ name: string; description?: string }> };
  };
}

export function collectSlashCommands(session: SlashCommandListSource): SlashCommandEntry[] {
  const extensionCommands: SlashCommandEntry[] = session.extensionRunner.getRegisteredCommands().map((command) => ({
    name: command.invocationName,
    description: command.description,
    source: "extension",
  }));

  const templates: SlashCommandEntry[] = session.promptTemplates.map((template) => ({
    name: template.name,
    description: template.description,
    source: "prompt",
  }));

  const skills: SlashCommandEntry[] = session.resourceLoader.getSkills().skills.map((skill) => ({
    name: `skill:${skill.name}`,
    description: skill.description,
    source: "skill",
  }));

  return [...extensionCommands, ...templates, ...skills];
}

export function filterSlashCommands(commands: SlashCommandEntry[], query: string): SlashCommandEntry[] {
  const q = query.toLowerCase();
  if (!q) return commands.slice(0, 50);
  return commands
    .filter((c) => c.name.toLowerCase().includes(q) || (c.description?.toLowerCase().includes(q) ?? false))
    .slice(0, 50);
}

/** Returns slash query at cursor, or null if not in a slash-completion context. */
export function getSlashCompletionAtCursor(text: string, cursor: number): { query: string; replaceStart: number } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(?:^|\s)\/([\w:.-]*)$/);
  if (!match) return null;
  const query = match[1] ?? "";
  const replaceStart = before.length - match[0].length + (match[0].startsWith("/") ? 1 : match[0].indexOf("/") + 1);
  return { query, replaceStart };
}

/** Replace the partial `/query` at the cursor with a full command; does not send. */
export function insertSlashCommandAtCursor(
  text: string,
  cursor: number,
  name: string,
): { text: string; cursor: number } | null {
  const completion = getSlashCompletionAtCursor(text, cursor);
  if (!completion) return null;
  const slashIdx = completion.replaceStart - 1;
  const insertion = `/${name} `;
  return {
    text: text.slice(0, slashIdx) + insertion + text.slice(cursor),
    cursor: slashIdx + insertion.length,
  };
}
