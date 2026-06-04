import { homedir } from "node:os";

const API_KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/gi,
  /\bapi[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}/gi,
];

export function sanitizeExportHtml(html: string, homeDir: string = homedir()): string {
  let next = html;
  if (homeDir && homeDir.length > 1) {
    next = next.split(homeDir).join("~");
  }
  next = next.replace(/\/Users\/[^/"'\s<>]+/g, "~");
  next = next.replace(/auth\.json/gi, "[credentials]");
  for (const pattern of API_KEY_PATTERNS) {
    next = next.replace(pattern, "[redacted]");
  }
  return next;
}
