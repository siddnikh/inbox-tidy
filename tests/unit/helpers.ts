import type { AiClient } from "../../src/core/ai/cli.ts";
import { createContext } from "../../src/core/app.ts";
import { loadConfig } from "../../src/core/config.ts";
import type { AppContext } from "../../src/core/context.ts";
import { memoryStore } from "../../src/core/secrets.ts";
import { type StartedServer, startServer } from "../../src/core/server.ts";

export function fakeAi(reply = "ready"): AiClient {
  return {
    availability: async () => [
      { id: "claude", label: "Claude", available: true, path: "/fake/claude" },
      { id: "codex", label: "Codex", available: false, path: null },
    ],
    ask: async (_prompt, _options) => ({ provider: "claude", text: reply, durationMs: 5 }),
  };
}

export function testContext(overrides: { ai?: AiClient } = {}): AppContext {
  const config = loadConfig({ INBOX_TIDY_DATA_DIR: ":memory:" });
  return createContext(config, {
    dataDir: ":memory:",
    secrets: memoryStore(),
    ai: overrides.ai ?? fakeAi(),
    openExternal: async () => {},
  });
}

export interface TestApp {
  ctx: AppContext;
  started: StartedServer;
  call(path: string, init?: { method?: string; body?: unknown }): Promise<Response>;
  stop(): void;
}

export function startTestApp(overrides: { ai?: AiClient } = {}): TestApp {
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
