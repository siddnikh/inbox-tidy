// Starts a built app's background core with throwaway data and checks that it answers.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";

const app = Bun.argv[2] ?? "dist/Inbox Tidy.app";
const helper = join(app, "Contents/Resources/Inbox Tidy Helper");
const dataDir = mkdtempSync(join(tmpdir(), "inbox-tidy-smoke-"));

const proc = Bun.spawn([helper], {
  env: {
    ...process.env,
    INBOX_TIDY_DATA_DIR: dataDir,
    INBOX_TIDY_KEYCHAIN_SERVICE: "Inbox Tidy Smoke Test",
  },
  stdout: "pipe",
  stderr: "inherit",
});

async function readyUrl(): Promise<string> {
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
    const line = text.split("\n").find((l) => l.startsWith("INBOX_TIDY_READY "));
    if (line) return line.slice("INBOX_TIDY_READY ".length).trim();
  }
  throw new Error(`The core never said it was ready (exit code ${proc.exitCode}).`);
}

try {
  const sessionUrl = await readyUrl();
  const session = await fetch(sessionUrl, { redirect: "manual" });
  const cookie = session.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`No session cookie (status ${session.status}).`);
  const origin = new URL(sessionUrl).origin;
  const health = (await (await fetch(`${origin}/api/health`, { headers: { cookie } })).json()) as {
    ok: boolean;
    version: string;
  };
  if (!health.ok || health.version !== pkg.version) {
    throw new Error(`Unexpected health answer: ${JSON.stringify(health)}`);
  }
  const page = await fetch(`${origin}/`, { headers: { cookie } });
  if (!page.ok || !(await page.text()).includes("<div"))
    throw new Error("The UI page didn't load.");
  console.log(`Smoke test passed: ${app} answers as version ${health.version} (${process.arch}).`);
} finally {
  proc.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
