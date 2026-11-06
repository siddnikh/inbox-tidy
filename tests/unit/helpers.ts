import type { AiClient } from "../../src/core/ai/client.ts";
import type { FetchLike } from "../../src/core/ai/openrouter.ts";
import { createContext } from "../../src/core/app.ts";
import { loadConfig } from "../../src/core/config.ts";
import type { AppContext } from "../../src/core/context.ts";
import { memoryStore, type SecretStore } from "../../src/core/secrets.ts";
import { type StartedServer, startServer } from "../../src/core/server.ts";

export function fakeAi(reply = "ready"): AiClient {
  return {
    status: async () => [
      { id: "claude", label: "Claude Code", state: "ready" },
      { id: "codex", label: "Codex", state: "not_installed" },
      { id: "openrouter", label: "OpenRouter", state: "needs_key" },
    ],
    ask: async (_prompt, _options) => ({ provider: "claude", text: reply, durationMs: 5 }),
  };
}

// The default for every test context, so nothing can reach the real OpenRouter.
export const offlineFetch: FetchLike = async (url) => {
  throw new TypeError(`network disabled in tests: ${url}`);
};

export interface TestOverrides {
  ai?: AiClient;
  fetch?: FetchLike;
  secrets?: SecretStore;
}

export function testContext(overrides: TestOverrides = {}): AppContext {
  const config = loadConfig({ INBOX_TIDY_DATA_DIR: ":memory:" });
  return createContext(config, {
    dataDir: ":memory:",
    secrets: overrides.secrets ?? memoryStore(),
    ai: overrides.ai ?? fakeAi(),
    fetch: overrides.fetch ?? offlineFetch,
    openExternal: async () => {},
  });
}

export interface TestApp {
  ctx: AppContext;
  started: StartedServer;
  call(path: string, init?: { method?: string; body?: unknown }): Promise<Response>;
  stop(): void;
}

export function startTestApp(overrides: TestOverrides = {}): TestApp {
  const ctx = testContext(overrides);
  const started = startServer(ctx);
  const cookie = `inbox_tidy_session=${started.token}`;
  return {
    ctx,
    started,
    call: (path, init = {}) =>
      fetch(`${started.url}${path}`, {
        method: init.method ?? "GET",
        headers: {
          cookie,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    stop: () => {
      started.server.stop(true);
      ctx.db.close();
    },
  };
}
