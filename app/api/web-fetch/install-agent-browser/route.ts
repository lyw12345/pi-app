import { requireApiAuth } from "@/lib/api-auth";
import { spawn } from "node:child_process";

export const dynamic = "force-dynamic";
// Allow up to 5 minutes for the install (downloads Chrome)
export const maxDuration = 300;

/**
 * POST /api/web-fetch/install-agent-browser
 *
 * Triggers `npm install -g agent-browser` followed by `agent-browser install`
 * (which downloads Chrome). Streams progress as Server-Sent Events.
 *
 * Event format: `data: { "type": "stdout" | "stderr" | "done" | "error", "line": "..." }\n\n`
 */
export async function POST(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  // Kill running installs if client disconnects
  const procs: import("node:child_process").ChildProcess[] = [];
  req.signal.addEventListener("abort", () => {
    for (const p of procs) {
      try { p.kill("SIGKILL"); } catch { /* already dead */ }
    }
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may be closed if client disconnected
        }
      };

      const runStep = (cmd: string, args: string[], label: string): Promise<number> => {
        return new Promise((resolve) => {
          send({ type: "step", label, command: [cmd, ...args].join(" ") });
          const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
          procs.push(proc);
          proc.stdout?.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            for (const line of text.split("\n")) {
              if (line.trim()) send({ type: "stdout", line });
            }
          });
          proc.stderr?.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            for (const line of text.split("\n")) {
              if (line.trim()) send({ type: "stderr", line });
            }
          });
          proc.on("error", (err) => {
            send({ type: "error", line: `${label} failed to start: ${err.message}` });
            // Remove from procs list on completion
            const idx = procs.indexOf(proc);
            if (idx !== -1) procs.splice(idx, 1);
            resolve(1);
          });
          proc.on("close", (code) => {
            send({ type: "step-done", label, exitCode: code });
            const idx = procs.indexOf(proc);
            if (idx !== -1) procs.splice(idx, 1);
            resolve(code ?? 1);
          });
        });
      };

      try {
        // Step 1: npm install -g agent-browser
        const npmCode = await runStep("npm", ["install", "-g", "agent-browser"], "npm install");
        if (npmCode !== 0) {
          send({
            type: "error",
            line:
              "npm install failed. On macOS/Linux, you may need sudo. Try: sudo npm install -g agent-browser",
          });
          send({ type: "done", success: false });
          controller.close();
          return;
        }

        // Step 2: agent-browser install (downloads Chrome)
        const abCode = await runStep("agent-browser", ["install"], "agent-browser install");
        if (abCode !== 0) {
          send({ type: "error", line: "agent-browser install failed. See stderr above." });
          send({ type: "done", success: false });
          controller.close();
          return;
        }

        send({ type: "done", success: true });
        controller.close();
      } catch (e) {
        send({ type: "error", line: String(e) });
        send({ type: "done", success: false });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
