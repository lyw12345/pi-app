import { getFileName, joinFilePath, normalizeFilePathSlashes } from "@/lib/file-paths";
import {
  displayNameFromFilePath,
  extractFileRefsFromText,
  stripFileRefsForDisplay,
  type FilePathRef,
} from "@/lib/message-file-refs";

const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;
const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const FILE_LIKE_EXT_RE =
  /\.(?:avif|bmp|c|cc|cfg|conf|cpp|csv|css|doc|docx|gif|go|h|hpp|html|jpeg|jpg|js|json|jsonl|jsx|log|md|mjs|pdf|png|ppt|pptx|py|rb|rs|sh|svg|toml|ts|tsx|txt|wav|webm|webp|xls|xlsx|xml|yaml|yml)$/i;

function decodeFileHref(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function trimCandidate(value: string): string {
  return value
    .trim()
    .replace(/^["'<]+/, "")
    .replace(/[>"']+$/, "")
    .replace(/[),.;:]+$/, "");
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || WINDOWS_ABSOLUTE_RE.test(value) || value.startsWith("\\\\");
}

function isLocalFileCandidate(value: string): boolean {
  if (!value || value.includes("\n")) return false;
  if (value.startsWith("#")) return false;
  if (URL_SCHEME_RE.test(value) && !value.startsWith("file:")) return false;

  const normalized = normalizeFilePathSlashes(value);
  const name = getFileName(normalized);
  if (!name || name === "." || name === "..") return false;
  if (isAbsolutePath(normalized)) return true;
  if (normalized.startsWith("./") || normalized.startsWith("../")) return FILE_LIKE_EXT_RE.test(name);
  if (normalized.includes("/")) return FILE_LIKE_EXT_RE.test(name);
  return FILE_LIKE_EXT_RE.test(name);
}

function normalizeCandidatePath(value: string, cwd?: string): string | null {
  let candidate = trimCandidate(decodeFileHref(value));
  if (candidate.startsWith("file://")) {
    candidate = candidate.replace(/^file:\/\/+/, "/");
  }
  candidate = normalizeFilePathSlashes(candidate);
  if (!isLocalFileCandidate(candidate)) return null;
  if (isAbsolutePath(candidate)) return candidate;
  if (!cwd) return null;
  return joinFilePath(cwd, candidate.replace(/^\.\//, ""));
}

function addRef(refs: FilePathRef[], seen: Set<string>, path: string | null, label?: string): void {
  if (!path || seen.has(path)) return;
  seen.add(path);
  refs.push({
    path,
    label: label?.trim() || displayNameFromFilePath(path),
  });
}

function isStandaloneFileReferenceLine(line: string, cwd?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const inlineCode = /^`([^`\n]+)`$/.exec(trimmed);
  if (inlineCode) {
    return normalizeCandidatePath(inlineCode[1] ?? "", cwd) !== null;
  }

  const markdownLink = /^\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(trimmed);
  if (markdownLink) {
    return normalizeCandidatePath(markdownLink[2] ?? "", cwd) !== null;
  }

  return normalizeCandidatePath(trimmed, cwd) !== null;
}

export function assistantOutputDisplayText(text: string, cwd?: string): string {
  const stripped = stripFileRefsForDisplay(text).text;
  return stripped
    .split("\n")
    .filter((line) => !isStandaloneFileReferenceLine(line, cwd))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractAssistantOutputFileRefs(text: string, cwd?: string): FilePathRef[] {
  const refs: FilePathRef[] = [];
  const seen = new Set<string>();

  for (const ref of extractFileRefsFromText(text)) {
    addRef(refs, seen, normalizeCandidatePath(ref.path, cwd), ref.label);
  }

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const label = match[1] ?? "";
    const href = match[2] ?? "";
    addRef(refs, seen, normalizeCandidatePath(href, cwd), label);
  }

  for (const match of text.matchAll(INLINE_CODE_RE)) {
    const raw = match[1] ?? "";
    addRef(refs, seen, normalizeCandidatePath(raw, cwd));
  }

  return refs;
}
