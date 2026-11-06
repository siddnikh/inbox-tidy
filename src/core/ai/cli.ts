import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiHelperState } from "../../shared/api.ts";
import type { AskOptions } from "./client.ts";
import { resetSearchPath, resolveSearchPath } from "./shell-path.ts";

export type CliId = "claude" | "codex";
export const CLI_IDS: CliId[] = ["claude", "codex"];

export interface CliStatus {
  id: CliId;
  state: AiHelperState;
  path: string | null;
}

export interface CliRunner {
  status(options?: { refresh?: boolean }): Promise<CliStatus[]>;
  // Finds the CLI on the search path without checking sign-in; null when it isn't installed.
  locate(id: CliId): Promise<string | null>;
  ask(id: CliId, bin: string, prompt: string, options: AskOptions): Promise<string>;
}

// Variables a parent Claude Code session sets; inheriting them makes a child `claude -p`
// behave as a nested session. ANTHROPIC_API_KEY is dropped so the user's subscription login is used.
const STRIPPED_ENV = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_PID",
  "ANTHROPIC_API_KEY",
];

const STATUS_TIMEOUT_MS = 10_000;
const STATUS_CACHE_MS = 30_000;

async function childEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !STRIPPED_ENV.includes(key)) env[key] = value;
  }
  env.PATH = await resolveSearchPath();
  return env;
}

async function run(
  cmd: string[],
  input: string | null,
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: await childEnv(),
    stdin: input === null ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  if (timedOut) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} seconds`);
  return { code, stdout, stderr };
}

// `claude auth status` prints JSON with `loggedIn` and exits 1 when signed out.
export function parseClaudeAuthStatus(code: number, stdout: string): AiHelperState {
  try {
    const parsed = JSON.parse(stdout) as { loggedIn?: unknown };
    if (parsed.loggedIn === true) return "ready";
    if (parsed.loggedIn === false) return "signed_out";
  } catch {
    // Older versions may not have the subcommand; fall through.
  }
  return code === 0 ? "unknown" : "signed_out";
}

// `codex login status` prints "Logged in using ChatGPT" (or "... an API key") to stderr and
// exits 0, or prints "Not logged in" and exits 1.
export function parseCodexLoginStatus(code: number, output: string): AiHelperState {
  if (/not logged in/i.test(output)) return "signed_out";
  if (code === 0 && /logged in/i.test(output)) return "ready";
  return code === 0 ? "unknown" : "signed_out";
}

async function signInState(id: CliId, bin: string): Promise<AiHelperState> {
  const cmd = id === "claude" ? [bin, "auth", "status"] : [bin, "login", "status"];
  try {
    const { code, stdout, stderr } = await run(cmd, null, tmpdir(), STATUS_TIMEOUT_MS);
    return id === "claude"
      ? parseClaudeAuthStatus(code, stdout)
      : parseCodexLoginStatus(code, `${stdout}\n${stderr}`);
  } catch (error) {
    console.error(`Checking ${id} sign-in failed: ${(error as Error).message}`);
    return "unknown";
  }
}

async function askClaude(bin: string, prompt: string, options: AskOptions, cwd: string) {
  const args = [
    bin,
    "-p",
    "--output-format",
    "json",
    "--tools",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--setting-sources",
    "",
    "--model",
    "sonnet",
  ];
  if (options.jsonSchema) args.push("--json-schema", JSON.stringify(options.jsonSchema));
  const { code, stdout, stderr } = await run(args, prompt, cwd, options.timeoutMs ?? 180_000);
  let parsed: { is_error?: boolean; result?: string; structured_output?: unknown } | null = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = null;
  }
  if (code !== 0 || !parsed || parsed.is_error) {
    throw new Error(
      (parsed?.result || stderr || stdout || `exit code ${code}`).trim().slice(0, 500),
    );
  }
  if (options.jsonSchema && parsed.structured_output !== undefined) {
    return JSON.stringify(parsed.structured_output);
  }
  return (parsed.result ?? "").trim();
}

async function askCodex(bin: string, prompt: string, options: AskOptions, cwd: string) {
  const outFile = join(cwd, "last-message.txt");
  const args = [
    bin,
    "exec",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color",
    "never",
    "-o",
    outFile,
  ];
  if (options.jsonSchema) {
    const schemaFile = join(cwd, "schema.json");
    await Bun.write(schemaFile, JSON.stringify(options.jsonSchema));
    args.push("--output-schema", schemaFile);
  }
  args.push("-");
  const { code, stderr, stdout } = await run(args, prompt, cwd, options.timeoutMs ?? 240_000);
  let text = "";
  try {
    text = readFileSync(outFile, "utf8").trim();
  } catch {
    text = "";
  }
  if (code !== 0 || !text) {
    throw new Error((stderr || stdout || `exit code ${code}`).trim().slice(-500));
  }
  return text;
}

export function cliRunner(): CliRunner {
  let cached: { at: number; value: Promise<CliStatus[]> } | null = null;

  async function locate(id: CliId): Promise<string | null> {
    return Bun.which(id, { PATH: await resolveSearchPath() });
  }

  async function compute(): Promise<CliStatus[]> {
    return Promise.all(
      CLI_IDS.map(async (id): Promise<CliStatus> => {
        const path = await locate(id);
        if (!path) return { id, state: "not_installed", path: null };
        return { id, state: await signInState(id, path), path };
      }),
    );
  }

  return {
    locate,
    status({ refresh = false } = {}) {
      if (refresh) resetSearchPath();
      if (refresh || !cached || Date.now() - cached.at > STATUS_CACHE_MS) {
        const value = compute();
        cached = { at: Date.now(), value };
        value.catch(() => {
          if (cached?.value === value) cached = null;
        });
      }
      return cached.value;
    },
    async ask(id, bin, prompt, options) {
      // A scratch working directory keeps the CLIs away from any project instructions.
      const cwd = mkdtempSync(join(tmpdir(), "inbox-tidy-ai-"));
      try {
        return id === "claude"
          ? await askClaude(bin, prompt, options, cwd)
          : await askCodex(bin, prompt, options, cwd);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  };
}
