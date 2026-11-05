import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiProviderChoice, AiProviderId } from "../../shared/api.ts";
import { resolveSearchPath } from "./shell-path.ts";

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  claude: "Claude",
  codex: "Codex",
};

export interface ProviderAvailability {
  id: AiProviderId;
  label: string;
  available: boolean;
  path: string | null;
}

export interface AiReply {
  provider: AiProviderId;
  text: string;
  durationMs: number;
}

export interface AskOptions {
  timeoutMs?: number;
  // JSON Schema the reply must satisfy. When given, text is the JSON string.
  jsonSchema?: object;
}

export interface AiClient {
  availability(): Promise<ProviderAvailability[]>;
  ask(prompt: string, options?: AskOptions): Promise<AiReply>;
}

export class AiUnavailableError extends Error {}

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

export function providerOrder(choice: AiProviderChoice): AiProviderId[] {
  if (choice === "claude") return ["claude"];
  if (choice === "codex") return ["codex"];
  return ["claude", "codex"];
}

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
  input: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: await childEnv(),
    stdin: new Blob([input]),
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

export function cliAiClient(getChoice: () => AiProviderChoice): AiClient {
  async function availability(): Promise<ProviderAvailability[]> {
    const PATH = await resolveSearchPath();
    return (["claude", "codex"] as const).map((id) => {
      const path = Bun.which(id, { PATH });
      return { id, label: PROVIDER_LABELS[id], available: path !== null, path };
    });
  }

  async function ask(prompt: string, options: AskOptions = {}): Promise<AiReply> {
    const found = await availability();
    const order = providerOrder(getChoice());
    const failures: string[] = [];
    for (const id of order) {
      const provider = found.find((p) => p.id === id);
      if (!provider?.path) {
        failures.push(`${PROVIDER_LABELS[id]} is not installed`);
        continue;
      }
      // A scratch working directory keeps the CLIs away from any project instructions.
      const cwd = mkdtempSync(join(tmpdir(), "inbox-tidy-ai-"));
      const started = performance.now();
      try {
        const text =
          id === "claude"
            ? await askClaude(provider.path, prompt, options, cwd)
            : await askCodex(provider.path, prompt, options, cwd);
        return { provider: id, text, durationMs: Math.round(performance.now() - started) };
      } catch (error) {
        failures.push(`${PROVIDER_LABELS[id]}: ${(error as Error).message}`);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
    throw new AiUnavailableError(failures.join("; "));
  }

  return { availability, ask };
}
