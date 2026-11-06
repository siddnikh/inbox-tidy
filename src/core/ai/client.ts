import type {
  AiHelperStatus,
  AiProviderChoice,
  AiProviderId,
  AppSettings,
} from "../../shared/api.ts";
import type { SecretStore } from "../secrets.ts";
import { CLI_IDS, type CliId, type CliRunner } from "./cli.ts";
import { OPENROUTER_KEY_NAME, type OpenRouterClient, OpenRouterError } from "./openrouter.ts";

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  openrouter: "OpenRouter",
};

export interface AiReply {
  provider: AiProviderId;
  // The OpenRouter model that answered.
  model?: string;
  text: string;
  durationMs: number;
}

export interface AskOptions {
  timeoutMs?: number;
  // JSON Schema the reply must satisfy. When given, text is the JSON string.
  jsonSchema?: object;
  // Name sent with the schema to OpenRouter.
  schemaName?: string;
}

export interface AiClient {
  status(options?: { refresh?: boolean }): Promise<AiHelperStatus[]>;
  ask(prompt: string, options?: AskOptions): Promise<AiReply>;
}

export interface AiFailure {
  provider: AiProviderId;
  // Technical detail for the log.
  detail: string;
  // A sentence safe to show the user, when the failure has a specific fix.
  userMessage: string | null;
}

export class AiUnavailableError extends Error {
  constructor(readonly failures: AiFailure[]) {
    super(
      failures.map((f) => `${PROVIDER_LABELS[f.provider]}: ${f.detail}`).join("; ") ||
        "no AI helper was tried",
    );
  }
}

// Automatic tries the subscriptions first, and OpenRouter only once a key is saved, because it
// bills the user per request.
export function providerOrder(choice: AiProviderChoice, hasOpenRouterKey: boolean): AiProviderId[] {
  if (choice === "auto") {
    return hasOpenRouterKey ? ["claude", "codex", "openrouter"] : ["claude", "codex"];
  }
  return [choice];
}

export function helperInUse(
  choice: AiProviderChoice,
  helpers: AiHelperStatus[],
): AiProviderId | null {
  const hasKey = helpers.some((h) => h.id === "openrouter" && h.state === "ready");
  for (const id of providerOrder(choice, hasKey)) {
    const state = helpers.find((h) => h.id === id)?.state;
    if (state === "ready" || state === "unknown") return id;
  }
  return null;
}

export async function readOpenRouterKey(secrets: SecretStore): Promise<string | null> {
  try {
    const key = await secrets.get(OPENROUTER_KEY_NAME);
    return key?.trim() ? key.trim() : null;
  } catch (error) {
    console.error(
      `Reading the OpenRouter key from the Keychain failed: ${(error as Error).message}`,
    );
    return null;
  }
}

export function createAiClient(deps: {
  settings: () => AppSettings;
  secrets: SecretStore;
  cli: CliRunner;
  openRouter: OpenRouterClient;
}): AiClient {
  async function status(options: { refresh?: boolean } = {}): Promise<AiHelperStatus[]> {
    const [cli, key] = await Promise.all([
      deps.cli.status(options),
      readOpenRouterKey(deps.secrets),
    ]);
    return [
      ...CLI_IDS.map((id) => ({
        id,
        label: PROVIDER_LABELS[id],
        state: cli.find((c) => c.id === id)?.state ?? "not_installed",
      })),
      { id: "openrouter", label: PROVIDER_LABELS.openrouter, state: key ? "ready" : "needs_key" },
    ];
  }

  async function ask(prompt: string, options: AskOptions = {}): Promise<AiReply> {
    const settings = deps.settings();
    const key = await readOpenRouterKey(deps.secrets);
    const failures: AiFailure[] = [];
    for (const id of providerOrder(settings.aiProvider, key !== null)) {
      const started = performance.now();
      const elapsed = () => Math.round(performance.now() - started);
      if (id === "openrouter") {
        if (!key) {
          failures.push({
            provider: id,
            detail: "no key saved",
            userMessage: "Add your OpenRouter key in Settings, then try again.",
          });
          continue;
        }
        const model = settings.openRouterModel;
        try {
          const text = await deps.openRouter.ask(key, model, prompt, options);
          return { provider: id, model, text, durationMs: elapsed() };
        } catch (error) {
          failures.push({
            provider: id,
            detail: (error as Error).message,
            userMessage: error instanceof OpenRouterError ? error.userMessage : null,
          });
        }
        continue;
      }
      const cliId: CliId = id;
      const bin = await deps.cli.locate(cliId);
      if (!bin) {
        failures.push({ provider: id, detail: "not installed", userMessage: null });
        continue;
      }
      try {
        const text = await deps.cli.ask(cliId, bin, prompt, options);
        return { provider: id, text, durationMs: elapsed() };
      } catch (error) {
        failures.push({ provider: id, detail: (error as Error).message, userMessage: null });
      }
    }
    throw new AiUnavailableError(failures);
  }

  return { status, ask };
}
