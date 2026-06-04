export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? null;
}

export function downloadHtmlBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function fetchSessionHtmlExport(sessionId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/export.html`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const filename = parseContentDispositionFilename(res.headers.get("Content-Disposition")) ?? "session.html";
  return { blob, filename };
}
