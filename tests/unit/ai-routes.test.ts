import { afterEach, describe, expect, test } from "bun:test";
import type { AiClient } from "../../src/core/ai/client.ts";
import { AiUnavailableError } from "../../src/core/ai/client.ts";
import { DEFAULT_OPENROUTER_MODEL, OPENROUTER_KEY_NAME } from "../../src/core/ai/openrouter.ts";
import { memoryStore } from "../../src/core/secrets.ts";
import type {
  AiCheckResponse,
  AiHelpersResponse,
  ApiErrorBody,
  AppSettings,
  OpenRouterKeyCheck,
  OpenRouterModelsResponse,
  OpenRouterStatus,
} from "../../src/shared/api.ts";
import { fakeAi, startTestApp, type TestApp } from "./helpers.ts";

const KEY = "sk-or-v1-abcdef0123456789abcdef0123456789wxyz";

let app: TestApp;
afterEach(() => app?.stop());

describe("AI helper routes", () => {
  test("helpers report each status and the helper in use, refreshing on request", async () => {
    let refreshed = false;
    const ai: AiClient = {
      ...fakeAi(),
      status: async (options) => {
        refreshed = options?.refresh === true;
        return [
          { id: "claude", label: "Claude Code", state: "signed_out" },
          { id: "codex", label: "Codex", state: "ready" },
          { id: "openrouter", label: "OpenRouter", state: "needs_key" },
        ];
      },
    };
    app = startTestApp({ ai });
    const body = (await (await app.call("/api/ai/helpers")).json()) as AiHelpersResponse;
    expect(body.choice).toBe("auto");
    expect(body.inUse).toBe("codex");
    expect(body.helpers.map((h) => h.state)).toEqual(["signed_out", "ready", "needs_key"]);
    expect(refreshed).toBe(false);
    await app.call("/api/ai/helpers?refresh=1");
    expect(refreshed).toBe(true);
  });

  test("the AI check reports the helper and model, and a plain reason when it fails", async () => {
    app = startTestApp({
      ai: {
        ...fakeAi(),
        ask: async () => ({
          provider: "openrouter",
          model: "a/b",
          text: '{"answer":"ready"}',
          durationMs: 7,
        }),
      },
    });
    const ok = (await (
      await app.call("/api/ai/check", { method: "POST" })
    ).json()) as AiCheckResponse;
    expect(ok).toEqual({
      provider: "openrouter",
      label: "OpenRouter",
      model: "a/b",
      reply: "ready",
      durationMs: 7,
    });
    app.stop();

    app = startTestApp({
      ai: {
        ...fakeAi(),
        ask: async () => {
          throw new AiUnavailableError([
            {
              provider: "openrouter",
              detail: "402 x",
              userMessage: "Add credit on openrouter.ai.",
            },
          ]);
        },
      },
    });
    const res = await app.call("/api/ai/check", { method: "POST" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as ApiErrorBody).error.message).toBe("Add credit on openrouter.ai.");
  });
});

describe("OpenRouter key routes", () => {
  test("saving, replacing, and removing a key never returns the key", async () => {
    const secrets = memoryStore();
    app = startTestApp({ secrets });
    const empty = (await (await app.call("/api/ai/openrouter")).json()) as OpenRouterStatus;
    expect(empty).toEqual({
      hasKey: false,
      keyEnding: null,
      model: DEFAULT_OPENROUTER_MODEL,
      defaultModel: DEFAULT_OPENROUTER_MODEL,
    });

    const saveRes = await app.call("/api/ai/openrouter/key", {
      method: "PUT",
      body: { key: ` ${KEY} ` },
    });
    const saveText = await saveRes.text();
    expect(saveRes.status).toBe(200);
    expect(saveText).not.toContain(KEY.slice(0, 20));
    expect(JSON.parse(saveText)).toMatchObject({ hasKey: true, keyEnding: "wxyz" });
    expect(await secrets.get(OPENROUTER_KEY_NAME)).toBe(KEY);

    const replacement = `${KEY.slice(0, -4)}9999`;
    await app.call("/api/ai/openrouter/key", { method: "PUT", body: { key: replacement } });
    expect(await secrets.get(OPENROUTER_KEY_NAME)).toBe(replacement);

    for (const path of ["/api/ai/openrouter", "/api/settings", "/api/health", "/api/ai/helpers"]) {
      expect(await (await app.call(path)).text()).not.toContain(replacement.slice(0, 20));
    }

    const removed = (await (
      await app.call("/api/ai/openrouter/key", { method: "DELETE" })
    ).json()) as OpenRouterStatus;
    expect(removed.hasKey).toBe(false);
    expect(await secrets.get(OPENROUTER_KEY_NAME)).toBeNull();
  });

  test("rejects an empty or partial key with a plain message", async () => {
    app = startTestApp();
    for (const key of ["", "sk-or-v1-short", "sk-or v1 has spaces in the middle of it", 42]) {
      const res = await app.call("/api/ai/openrouter/key", { method: "PUT", body: { key } });
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiErrorBody).error.field).toBe("key");
    }
    const nothing = await app.call("/api/ai/openrouter/key", { method: "PUT", body: null });
    expect(nothing.status).toBe(400);
  });

  test("checking the key uses the saved key and maps a rejection to a plain error", async () => {
    const seen: string[] = [];
    let accept = true;
    app = startTestApp({
      fetch: async (url, init) => {
        seen.push(`${url} ${((init?.headers ?? {}) as Record<string, string>).authorization}`);
        return accept
          ? Response.json({ data: { is_free_tier: false, limit_remaining: null } })
          : Response.json({ error: { code: 401, message: "User not found." } }, { status: 401 });
      },
    });
    const noKey = await app.call("/api/ai/openrouter/key/check", { method: "POST" });
    expect(noKey.status).toBe(400);

    await app.call("/api/ai/openrouter/key", { method: "PUT", body: { key: KEY } });
    const ok = await app.call("/api/ai/openrouter/key/check", { method: "POST" });
    expect(((await ok.json()) as OpenRouterKeyCheck).message).toBe("Your key works.");
    expect(seen).toEqual([`https://openrouter.ai/api/v1/key Bearer ${KEY}`]);

    accept = false;
    const bad = await app.call("/api/ai/openrouter/key/check", { method: "POST" });
    expect(bad.status).toBe(400);
    const text = await bad.text();
    expect(text).toContain("didn't accept your key");
    expect(text).not.toContain(KEY.slice(0, 20));
  });

  test("the model list is proxied, and offline is a plain 503", async () => {
    let online = true;
    app = startTestApp({
      fetch: async () => {
        if (!online) throw new TypeError("fetch failed");
        return Response.json({
          data: [
            {
              id: "openai/gpt-6-luna",
              name: "OpenAI: GPT-6 Luna",
              pricing: { prompt: "0.0000001", completion: "0.0000005" },
              supported_parameters: ["structured_outputs"],
            },
          ],
        });
      },
    });
    online = false;
    const offline = await app.call("/api/ai/openrouter/models");
    expect(offline.status).toBe(503);
    expect(((await offline.json()) as ApiErrorBody).error.message).toContain("internet connection");
    online = true;
    const list = (await (
      await app.call("/api/ai/openrouter/models")
    ).json()) as OpenRouterModelsResponse;
    expect(list.defaultModel).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(list.models[0]).toMatchObject({
      id: "openai/gpt-6-luna",
      recommended: true,
      promptPerMillion: 0.1,
    });
  });
});

describe("AI settings", () => {
  test("accept OpenRouter as a choice and a valid model ID, and reject bad ones", async () => {
    app = startTestApp();
    const put = (body: Partial<AppSettings> | Record<string, unknown>) =>
      app.call("/api/settings", { method: "PUT", body });
    const saved = (await (
      await put({ aiProvider: "openrouter", openRouterModel: " anthropic/claude-haiku-5.5 " })
    ).json()) as AppSettings;
    expect(saved.aiProvider).toBe("openrouter");
    expect(saved.openRouterModel).toBe("anthropic/claude-haiku-5.5");
    for (const bad of [
      { aiProvider: "gpt" },
      { openRouterModel: "" },
      { openRouterModel: "no-slash" },
      { openRouterModel: "a/b c" },
      { openRouterModel: 5 },
    ]) {
      const res = await put(bad);
      expect(res.status).toBe(400);
    }
    const ignored = (await (
      await put({ somethingElse: true } as Record<string, unknown>)
    ).json()) as AppSettings & {
      somethingElse?: boolean;
    };
    expect(ignored.somethingElse).toBeUndefined();
    expect(app.ctx.settings().openRouterModel).toBe("anthropic/claude-haiku-5.5");
  });
});
