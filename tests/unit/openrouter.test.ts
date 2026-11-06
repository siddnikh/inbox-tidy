import { describe, expect, test } from "bun:test";
import {
  DEFAULT_OPENROUTER_MODEL,
  type FetchLike,
  OpenRouterError,
  openRouterClient,
  openRouterError,
  RECOMMENDED_MODELS,
  toModelList,
} from "../../src/core/ai/openrouter.ts";
import { SORT_SCHEMA } from "../../src/core/insights/sort.ts";

const KEY = "sk-or-v1-0000000000000000000000000000secret";

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return respond(url);
  };
  return { fn, calls };
}

const completion = (content: unknown, extra: Record<string, unknown> = {}) =>
  Response.json({ choices: [{ finish_reason: "stop", message: { content }, ...extra }] });

describe("OpenRouter ask", () => {
  test("sends the model, prompt, strict schema, and require_parameters", async () => {
    const reply = { senders: [] };
    const fetcher = fakeFetch(() => completion(JSON.stringify(reply)));
    const client = openRouterClient(fetcher.fn);
    const text = await client.ask(KEY, "openai/gpt-6-luna", "sort these", {
      jsonSchema: SORT_SCHEMA,
      schemaName: "senders",
    });
    expect(JSON.parse(text)).toEqual(reply);
    const [call] = fetcher.calls;
    expect(call?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(call?.init?.method).toBe("POST");
    const headers = call?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(call?.init?.body as string);
    expect(body).toEqual({
      model: "openai/gpt-6-luna",
      messages: [{ role: "user", content: "sort these" }],
      stream: false,
      provider: { require_parameters: true },
      response_format: {
        type: "json_schema",
        json_schema: { name: "senders", strict: true, schema: SORT_SCHEMA },
      },
    });
    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("leaves out response_format when no schema is given", async () => {
    const fetcher = fakeFetch(() => completion("ready"));
    const text = await openRouterClient(fetcher.fn).ask(KEY, "a/b", "hi");
    expect(text).toBe("ready");
    const body = JSON.parse(fetcher.calls[0]?.init?.body as string);
    expect(body.response_format).toBeUndefined();
    expect(body.provider).toEqual({ require_parameters: true });
  });

  test("unwraps fenced JSON and content parts, and rejects non-JSON for a schema", async () => {
    const fenced = openRouterClient(fakeFetch(() => completion('```json\n{"a":1}\n```')).fn);
    expect(await fenced.ask(KEY, "a/b", "x", { jsonSchema: {} })).toBe('{"a":1}');
    const parts = openRouterClient(
      fakeFetch(() =>
        completion([
          { type: "text", text: '{"b":' },
          { type: "text", text: "2}" },
        ]),
      ).fn,
    );
    expect(await parts.ask(KEY, "a/b", "x", { jsonSchema: {} })).toBe('{"b":2}');
    const prose = openRouterClient(fakeFetch(() => completion("Sure! Here you go")).fn);
    const error = await prose.ask(KEY, "a/b", "x", { jsonSchema: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(OpenRouterError);
    expect((error as OpenRouterError).kind).toBe("bad_reply");
  });

  test("maps HTTP errors to plain messages that never contain the key", async () => {
    const cases: [number, string, string][] = [
      [401, "No auth credentials found", "bad_key"],
      [402, "Insufficient credits", "no_credit"],
      [404, "No endpoints found that can handle the requested parameters.", "unsupported_model"],
      [400, "openai/nope is not a valid model ID", "unknown_model"],
      [400, "response_format json_schema is not supported", "unsupported_model"],
      [429, "Rate limit exceeded", "rate_limited"],
      [502, "Provider returned error", "unavailable"],
      [
        503,
        "No available model provider that meets your routing requirements",
        "unsupported_model",
      ],
      [408, "Request timed out", "timeout"],
    ];
    for (const [status, message, kind] of cases) {
      const client = openRouterClient(
        fakeFetch(() => Response.json({ error: { code: status, message } }, { status })).fn,
      );
      const error = (await client.ask(KEY, "openai/nope", "x").catch((e) => e)) as OpenRouterError;
      expect(error).toBeInstanceOf(OpenRouterError);
      expect(error.kind).toBe(kind as OpenRouterError["kind"]);
      expect(error.userMessage).not.toContain(KEY);
      expect(error.message).not.toContain(KEY);
      expect(error.userMessage).not.toMatch(/\b\d{3}\b/);
    }
  });

  test("treats an error inside a 200 response as a failure", async () => {
    const inBody = openRouterClient(
      fakeFetch(() => Response.json({ error: { code: 402, message: "Insufficient credits" } })).fn,
    );
    expect(((await inBody.ask(KEY, "a/b", "x").catch((e) => e)) as OpenRouterError).kind).toBe(
      "no_credit",
    );
    const inChoice = openRouterClient(
      fakeFetch(() =>
        Response.json({
          choices: [{ finish_reason: "error", error: { code: 502, message: "upstream" } }],
        }),
      ).fn,
    );
    expect(((await inChoice.ask(KEY, "a/b", "x").catch((e) => e)) as OpenRouterError).kind).toBe(
      "unavailable",
    );
  });

  test("reports timeouts and lost connections plainly", async () => {
    const slow = openRouterClient(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    expect(((await slow.ask(KEY, "a/b", "x").catch((e) => e)) as OpenRouterError).kind).toBe(
      "timeout",
    );
    const offline = openRouterClient(async () => {
      throw new TypeError("fetch failed");
    });
    const error = (await offline.ask(KEY, "a/b", "x").catch((e) => e)) as OpenRouterError;
    expect(error.kind).toBe("offline");
    expect(error.userMessage).toContain("internet connection");
  });

  test("openRouterError names the model", () => {
    expect(openRouterError(404, "model not found", "x/y").userMessage).toContain("“x/y”");
  });
});

describe("OpenRouter key check", () => {
  test("calls the key endpoint and explains credit", async () => {
    const fetcher = fakeFetch(() =>
      Response.json({ data: { label: "k", is_free_tier: false, limit_remaining: 4.5, usage: 1 } }),
    );
    const result = await openRouterClient(fetcher.fn).checkKey(KEY);
    expect(fetcher.calls[0]?.url).toBe("https://openrouter.ai/api/v1/key");
    expect(((fetcher.calls[0]?.init?.headers ?? {}) as Record<string, string>).authorization).toBe(
      `Bearer ${KEY}`,
    );
    expect(result).toEqual({
      message: "Your key works. It can spend $4.50 more before it reaches its limit.",
      hasCredit: true,
      limitRemaining: 4.5,
    });
    const free = await openRouterClient(
      fakeFetch(() => Response.json({ data: { is_free_tier: true, limit_remaining: null } })).fn,
    ).checkKey(KEY);
    expect(free.hasCredit).toBe(false);
    expect(free.message).toContain("no credit yet");
  });

  test("a rejected key is a bad_key error", async () => {
    const client = openRouterClient(
      fakeFetch(() =>
        Response.json({ error: { code: 401, message: "User not found." } }, { status: 401 }),
      ).fn,
    );
    expect(((await client.checkKey(KEY).catch((e) => e)) as OpenRouterError).kind).toBe("bad_key");
  });
});

const rawModels = {
  data: [
    {
      id: "zeta/plain",
      name: "Zeta: Plain",
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_parameters: ["structured_outputs", "max_tokens"],
      architecture: { output_modalities: ["text"] },
      endpoints: ["/api/v1/chat/completions"],
    },
    {
      id: DEFAULT_OPENROUTER_MODEL,
      name: "OpenAI: GPT-6 Luna",
      pricing: { prompt: "0.0000001", completion: "0.0000005" },
      supported_parameters: ["structured_outputs"],
      endpoints: ["/api/v1/chat/completions"],
    },
    {
      id: "alpha/no-schema",
      name: "Alpha",
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["response_format"],
    },
    {
      id: "openai/gpt-6-luna:batch",
      name: "Batch",
      supported_parameters: ["structured_outputs"],
      endpoints: ["/api/v1/batches"],
    },
    {
      id: "beta/video",
      name: "Beta video",
      supported_parameters: ["structured_outputs"],
      architecture: { output_modalities: ["video"] },
    },
    {
      id: "openrouter/auto",
      name: "Auto",
      pricing: { prompt: "-1", completion: "-1" },
      supported_parameters: ["structured_outputs"],
    },
  ],
};

describe("OpenRouter models", () => {
  test("keeps chat models with structured outputs, recommended first, prices per million", () => {
    const list = toModelList(rawModels);
    expect(list.map((m) => m.id)).toEqual([
      DEFAULT_OPENROUTER_MODEL,
      "openrouter/auto",
      "zeta/plain",
    ]);
    const [luna, auto, zeta] = list;
    expect(luna).toEqual({
      id: DEFAULT_OPENROUTER_MODEL,
      name: "OpenAI: GPT-6 Luna",
      promptPerMillion: 0.1,
      completionPerMillion: 0.5,
      recommended: true,
      note: RECOMMENDED_MODELS[0]?.note ?? null,
    });
    expect(auto?.promptPerMillion).toBeNull();
    expect(zeta?.completionPerMillion).toBe(2);
    expect(zeta?.recommended).toBe(false);
  });

  test("asks for structured-output models, caches for an hour, and serves stale data offline", async () => {
    let now = 1_000_000;
    let online = true;
    const fetcher = fakeFetch(() => {
      if (!online) throw new TypeError("fetch failed");
      return Response.json(rawModels);
    });
    const client = openRouterClient(fetcher.fn, () => now);
    await client.models();
    await client.models();
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]?.url).toBe(
      "https://openrouter.ai/api/v1/models?supported_parameters=structured_outputs",
    );
    expect(
      ((fetcher.calls[0]?.init?.headers ?? {}) as Record<string, string>).authorization,
    ).toBeUndefined();
    now += 61 * 60_000;
    online = false;
    expect((await client.models()).length).toBe(3);
    expect(fetcher.calls).toHaveLength(2);
  });

  test("offline with nothing cached is a plain error", async () => {
    const client = openRouterClient(async () => {
      throw new TypeError("fetch failed");
    });
    const error = (await client.models().catch((e) => e)) as OpenRouterError;
    expect(error.kind).toBe("offline");
    expect(error.userMessage).toContain("You can still type a model ID");
  });
});
