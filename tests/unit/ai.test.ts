import { describe, expect, test } from "bun:test";
import {
  type CliId,
  type CliRunner,
  type CliStatus,
  parseClaudeAuthStatus,
  parseCodexLoginStatus,
} from "../../src/core/ai/cli.ts";
import {
  AiUnavailableError,
  createAiClient,
  helperInUse,
  providerOrder,
} from "../../src/core/ai/client.ts";
import {
  OPENROUTER_KEY_NAME,
  type OpenRouterClient,
  OpenRouterError,
} from "../../src/core/ai/openrouter.ts";
import { memoryStore } from "../../src/core/secrets.ts";
import type { AiHelperStatus, AiProviderChoice } from "../../src/shared/api.ts";

describe("providerOrder", () => {
  test("automatic tries Claude, then Codex, then OpenRouter only with a key", () => {
    expect(providerOrder("auto", false)).toEqual(["claude", "codex"]);
    expect(providerOrder("auto", true)).toEqual(["claude", "codex", "openrouter"]);
  });

  test("a single choice uses only that helper", () => {
    expect(providerOrder("codex", true)).toEqual(["codex"]);
    expect(providerOrder("openrouter", false)).toEqual(["openrouter"]);
  });
});

describe("helperInUse", () => {
  const helpers = (claude: string, codex: string, openrouter: string): AiHelperStatus[] =>
    [
      { id: "claude", label: "Claude Code", state: claude },
      { id: "codex", label: "Codex", state: codex },
      { id: "openrouter", label: "OpenRouter", state: openrouter },
    ] as AiHelperStatus[];

  test("picks the first ready helper in the chosen order", () => {
    expect(helperInUse("auto", helpers("ready", "ready", "ready"))).toBe("claude");
    expect(helperInUse("auto", helpers("signed_out", "ready", "ready"))).toBe("codex");
    expect(helperInUse("auto", helpers("not_installed", "signed_out", "ready"))).toBe("openrouter");
    expect(helperInUse("auto", helpers("not_installed", "signed_out", "needs_key"))).toBeNull();
    expect(helperInUse("codex", helpers("ready", "signed_out", "ready"))).toBeNull();
    expect(helperInUse("claude", helpers("unknown", "ready", "ready"))).toBe("claude");
  });
});

describe("sign-in status parsing", () => {
  test("claude auth status", () => {
    expect(parseClaudeAuthStatus(0, '{"loggedIn": true, "authMethod": "claude.ai"}')).toBe("ready");
    expect(parseClaudeAuthStatus(1, '{"loggedIn": false, "authMethod": "none"}')).toBe(
      "signed_out",
    );
    expect(parseClaudeAuthStatus(1, "error: unknown command 'auth'")).toBe("signed_out");
    expect(parseClaudeAuthStatus(0, "something else")).toBe("unknown");
  });

  test("codex login status", () => {
    expect(parseCodexLoginStatus(0, "\nLogged in using ChatGPT")).toBe("ready");
    expect(parseCodexLoginStatus(0, "Logged in using an API key - sk-***")).toBe("ready");
    expect(parseCodexLoginStatus(1, "Not logged in\n")).toBe("signed_out");
    expect(parseCodexLoginStatus(0, "")).toBe("unknown");
    expect(parseCodexLoginStatus(2, "error: unrecognized subcommand")).toBe("signed_out");
  });
});

function fakeCli(installed: Partial<Record<CliId, "ready" | "signed_out">>, fail = false) {
  const asked: CliId[] = [];
  const runner: CliRunner = {
    status: async () =>
      (["claude", "codex"] as CliId[]).map(
        (id): CliStatus => ({
          id,
          state: installed[id] ?? "not_installed",
          path: installed[id] ? `/fake/${id}` : null,
        }),
      ),
    locate: async (id) => (installed[id] ? `/fake/${id}` : null),
    ask: async (id) => {
      asked.push(id);
      if (fail) throw new Error(`${id} exploded`);
      return `${id} says ready`;
    },
  };
  return { runner, asked };
}

function fakeOpenRouter(result: string | OpenRouterError) {
  const calls: { key: string; model: string }[] = [];
  const client: OpenRouterClient = {
    ask: async (key, model) => {
      calls.push({ key, model });
      if (result instanceof OpenRouterError) throw result;
      return result;
    },
    checkKey: async () => ({ message: "ok", hasCredit: true, limitRemaining: null }),
    models: async () => [],
  };
  return { client, calls };
}

async function clientWith(opts: {
  choice: AiProviderChoice;
  cli: ReturnType<typeof fakeCli>;
  openRouter: ReturnType<typeof fakeOpenRouter>;
  key?: string;
}) {
  const secrets = memoryStore();
  if (opts.key) await secrets.set(OPENROUTER_KEY_NAME, opts.key);
  return createAiClient({
    settings: () => ({ aiProvider: opts.choice, lookbackMonths: 12, openRouterModel: "a/b" }),
    secrets,
    cli: opts.cli.runner,
    openRouter: opts.openRouter.client,
  });
}

describe("createAiClient", () => {
  test("status reports each helper, with OpenRouter ready only when a key is saved", async () => {
    const cli = fakeCli({ claude: "ready", codex: "signed_out" });
    const without = await clientWith({ choice: "auto", cli, openRouter: fakeOpenRouter("x") });
    expect((await without.status()).map((h) => [h.id, h.state])).toEqual([
      ["claude", "ready"],
      ["codex", "signed_out"],
      ["openrouter", "needs_key"],
    ]);
    const withKey = await clientWith({
      choice: "auto",
      cli,
      openRouter: fakeOpenRouter("x"),
      key: "sk-or-v1-abcdefghijklmnopqrstuvwxyz",
    });
    expect((await withKey.status()).find((h) => h.id === "openrouter")?.state).toBe("ready");
  });

  test("automatic falls back to OpenRouter only after both CLIs fail, and only with a key", async () => {
    const cli = fakeCli({ claude: "ready", codex: "ready" }, true);
    const openRouter = fakeOpenRouter('{"answer":"ready"}');
    const ai = await clientWith({
      choice: "auto",
      cli,
      openRouter,
      key: "sk-or-v1-abcdefghijklmnopqrstuvwxyz",
    });
    const reply = await ai.ask("hi");
    expect(cli.asked).toEqual(["claude", "codex"]);
    expect(reply.provider).toBe("openrouter");
    expect(reply.model).toBe("a/b");
    expect(openRouter.calls).toEqual([
      { key: "sk-or-v1-abcdefghijklmnopqrstuvwxyz", model: "a/b" },
    ]);

    const noKeyRouter = fakeOpenRouter("never");
    const noKey = await clientWith({
      choice: "auto",
      cli: fakeCli({}, true),
      openRouter: noKeyRouter,
    });
    await expect(noKey.ask("hi")).rejects.toBeInstanceOf(AiUnavailableError);
    expect(noKeyRouter.calls).toHaveLength(0);
  });

  test("choosing OpenRouter uses only OpenRouter and keeps its plain message", async () => {
    const cli = fakeCli({ claude: "ready" });
    const openRouter = fakeOpenRouter(new OpenRouterError("no_credit", "Add credit.", "402"));
    const ai = await clientWith({
      choice: "openrouter",
      cli,
      openRouter,
      key: "sk-or-v1-0123456789abcdefghij",
    });
    const error = (await ai.ask("hi").catch((e) => e)) as AiUnavailableError;
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect(cli.asked).toEqual([]);
    expect(error.failures).toEqual([
      { provider: "openrouter", detail: "402", userMessage: "Add credit." },
    ]);
  });

  test("choosing OpenRouter without a key says to add one", async () => {
    const ai = await clientWith({
      choice: "openrouter",
      cli: fakeCli({ claude: "ready" }),
      openRouter: fakeOpenRouter("x"),
    });
    const error = (await ai.ask("hi").catch((e) => e)) as AiUnavailableError;
    expect(error.failures[0]?.userMessage).toContain("Add your OpenRouter key");
  });
});
