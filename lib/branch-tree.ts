import type { SessionEntry, SessionTreeNode } from "./types";

export function compressBranchNode(node: SessionTreeNode): { node: SessionTreeNode; skipped: number } {
  let current = node;
  let skipped = 0;
  while (current.children.length === 1) {
    current = current.children[0];
    skipped++;
  }
  return { node: current, skipped };
}

export function hasFork(nodes: SessionTreeNode[]): boolean {
  for (const node of nodes) {
    if (node.children.length > 1) return true;
    if (hasFork(node.children)) return true;
  }
  return false;
}

export function getFirstForkNode(tree: SessionTreeNode[]): SessionTreeNode | null {
  if (tree.length === 0) return null;
  const { node } = compressBranchNode(tree[0]);
  return node.children.length > 1 ? node : null;
}

export function getLinearLeafId(tree: SessionTreeNode[]): string | null {
  if (tree.length === 0) return null;
  let node = tree[0];
  while (node.children.length === 1) {
    node = node.children[0];
  }
  if (node.children.length === 0) return node.entry.id;
  return node.entry.id;
}

export function buildActivePath(nodes: SessionTreeNode[], targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  function search(currentNodes: SessionTreeNode[], path: string[]): string[] | null {
    for (const node of currentNodes) {
      const next = [...path, node.entry.id];
      if (node.entry.id === targetId) return next;
      const found = search(node.children, next);
      if (found) return found;
    }
    return null;
  }
  return new Set(search(nodes, []) ?? []);
}

export function findNodeById(nodes: SessionTreeNode[], targetId: string): SessionTreeNode | null {
  for (const node of nodes) {
    if (node.entry.id === targetId) return node;
    const found = findNodeById(node.children, targetId);
    if (found) return found;
  }
  return null;
}

export function getBranchEntryLabel(
  entry: SessionEntry,
  fallback: string,
): string {
  if (entry.type === "message" && "message" in entry) {
    const msg = entry.message as { role: string; content: unknown };
    const content = msg.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join(" ");
    }
    if (text.length > 40) text = `${text.slice(0, 40)}…`;
    if (text) return text;
    if (msg.role === "assistant") return fallback;
  }
  return entry.type;
}
