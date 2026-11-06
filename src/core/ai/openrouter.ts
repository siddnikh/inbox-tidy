import type { OpenRouterKeyCheck, OpenRouterModel } from "../../shared/api.ts";
import type { AskOptions } from "./client.ts";

export const OPENROUTER_KEY_NAME = "openrouter-api-key";
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-6-luna";

// Checked against OpenRouter's live list: each supports structured outputs through chat
// completions and costs well under a cent to sort 100 senders.
export const RECOMMENDED_MODELS: { id: string; note: string }[] = [
  { id: "openai/gpt-6-luna", note: "Fast and inexpensive. The default." },
  { id: "anthropic/claude-haiku-5.5", note: "Fast and inexpensive, from the makers of Claude." },
  { id: "deepseek/deepseek-v4.1-flash", note: "Usually the cheapest of these." },
  { id: "google/gemini-3.8-flash", note: "Google's quick model. Costs a little more." },
];

export const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*\/[A-Za-z0-9._~:-]+$/;

const API = "https://openrouter.ai/api/v1";
const MODELS_CACHE_MS = 60 * 60_000;
const MODELS_TIMEOUT_MS = 15_000;
const KEY_TIMEOUT_MS = 15_000;
const ASK_TIMEOUT_MS = 180_000;
const APP_HEADERS = {
  "HTTP-Referer": "https://github.com/siddnikh/inbox-tidy",
  "X-OpenRouter-Title": "Inbox Tidy",
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OpenRouterErrorKind =
  | "no_key"
  | "bad_key"
  | "no_credit"
  | "refused"
  | "unknown_model"
  | "unsupported_model"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "offline"
  | "bad_reply"
  | "failed";

// `message` is technical detail for the log; `userMessage` is safe to show. Neither ever
// contains the key.
export class OpenRouterError extends Error {
  constructor(
    readonly kind: OpenRouterErrorKind,
    readonly userMessage: string,
    detail: string,
  ) {
    super(detail);
  }
}

export interface OpenRouterClient {
  ask(key: string, model: string, prompt: string, options?: AskOptions): Promise<string>;
  checkKey(key: string): Promise<OpenRouterKeyCheck>;
  models(): Promise<OpenRouterModel[]>;
}

const PICK_ANOTHER = "Pick a suggested model in Settings.";
const PICK_ANOTHER_LOWER = "pick a suggested model in Settings.";

export function openRouterError(
  status: number,
  serverMessage: string,
  model: string | null,
): OpenRouterError {
  const detail = `OpenRouter ${status}: ${serverMessage}`.slice(0, 400);
  const named = model ? `“${model}”` : "The model you chose";
  const make = (kind: OpenRouterErrorKind, text: string) => new OpenRouterError(kind, text, detail);
  const unsupported = () =>
    make(
      "unsupported_model",
      `${model ? `The model ${named}` : named} can't answer in the format Inbox Tidy needs. ${PICK_ANOTHER}`,
    );
  const unknownModel = () =>
    make("unknown_model", `OpenRouter has no model called ${named}. ${PICK_ANOTHER}`);
  const formatProblem = /response_format|json_schema|structured|require_parameters|parameter/i;

  if (status === 401) {
    return make(
      "bad_key",
      "OpenRouter didn't accept your key. Create a new key on openrouter.ai and save it in Settings.",
    );
  }
  if (status === 402) {
    return make(
      "no_credit",
      "Your OpenRouter account is out of credit. Add credit on openrouter.ai, then try again.",
    );
  }
  if (status === 403) {
    return make("refused", `OpenRouter turned this request down. ${PICK_ANOTHER}`);
  }
  if (status === 404) {
    return /endpoint|provider|support/i.test(serverMessage) || formatProblem.test(serverMessage)
      ? unsupported()
      : unknownModel();
  }
  if (status === 400) {
    if (formatProblem.test(serverMessage)) return unsupported();
    if (/model/i.test(serverMessage) && /valid|exist|found|unknown/i.test(serverMessage)) {
      return unknownModel();
    }
  }
  if (status === 429) {
    return make(
      "rate_limited",
      "OpenRouter is busy, or you've reached your limit. Wait a minute, then try again.",
    );
  }
  if (status === 408 || status === 504) {
    return make("timeout", "OpenRouter took too long to answer. Try again in a minute.");
  }
  if (status === 503 && /routing|requirement|parameter|structured/i.test(serverMessage)) {
    return unsupported();
  }
  if (status >= 500) {
    return make(
      "unavailable",
      "The model you chose isn't working right now. Try again later, or pick another model in Settings.",
    );
  }
  return make("failed", `OpenRouter couldn't answer. Try again, or ${PICK_ANOTHER_LOWER}`);
}

function transportError(error: unknown): OpenRouterError {
  if (error instanceof OpenRouterError) return error;
  const name = (error as Error)?.name;
  const detail = `OpenRouter request failed: ${(error as Error)?.message ?? String(error)}`;
  if (name === "TimeoutError" || name === "AbortError") {
    return new OpenRouterError(
      "timeout",
      "OpenRouter took too long to answer. Try again in a minute.",
      detail,
    );
  }
  return new OpenRouterError(
    "offline",
    "Couldn't reach OpenRouter. Check your internet connection, then try again.",
    detail,
  );
}

interface ErrorBody {
  error?: { code?: number | string; message?: string };
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 200) } };
  }
}

function errorStatus(body: ErrorBody, fallback: number): number {
  const code = Number(body.error?.code);
  return Number.isInteger(code) && code >= 400 ? code : fallback;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

// Some models wrap JSON in a Markdown fence even when asked for a schema.
function unfence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match?.[1] ?? text).trim();
}

function perMillion(raw: unknown): number | null {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 1e6 * 10_000) / 10_000;
}

interface RawModel {
  id?: unknown;
  name?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  supported_parameters?: unknown;
  architecture?: { output_modalities?: unknown };
  endpoints?: unknown;
}

export function toModelList(raw: unknown): OpenRouterModel[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("OpenRouter's model list had no data array");
  const notes = new Map(RECOMMENDED_MODELS.map((m, i) => [m.id, { note: m.note, rank: i }]));
  const models: (OpenRouterModel & { rank: number })[] = [];
  const seen = new Set<string>();
  for (const item of data as RawModel[]) {
    if (typeof item?.id !== "string" || !MODEL_ID_PATTERN.test(item.id) || seen.has(item.id)) {
      continue;
    }
    const params = Array.isArray(item.supported_parameters) ? item.supported_parameters : [];
    if (!params.includes("structured_outputs")) continue;
    const outputs = item.architecture?.output_modalities;
    if (Array.isArray(outputs) && !outputs.includes("text")) continue;
    if (Array.isArray(item.endpoints) && !item.endpoints.includes("/api/v1/chat/completions")) {
      continue;
    }
    seen.add(item.id);
    const recommended = notes.get(item.id);
    models.push({
      id: item.id,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : item.id,
      promptPerMillion: perMillion(item.pricing?.prompt),
      completionPerMillion: perMillion(item.pricing?.completion),
      recommended: recommended !== undefined,
      note: recommended?.note ?? null,
      rank: recommended?.rank ?? Number.POSITIVE_INFINITY,
    });
  }
  models.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return models.map(({ rank: _rank, ...model }) => model);
}

export function openRouterClient(
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now,
): OpenRouterClient {
  let cache: { at: number; models: OpenRouterModel[] } | null = null;

  async function ask(key: string, model: string, prompt: string, options: AskOptions = {}) {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      // Without this, OpenRouter may route to an endpoint that silently ignores the schema.
      provider: { require_parameters: true },
    };
    if (options.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: options.schemaName ?? "inbox_tidy_reply",
          strict: true,
          schema: options.jsonSchema,
        },
      };
    }
    let parsed: unknown;
    let status: number;
    try {
      const res = await fetchImpl(`${API}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          ...APP_HEADERS,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? ASK_TIMEOUT_MS),
      });
      status = res.status;
      parsed = await readBody(res);
    } catch (error) {
      throw transportError(error);
    }
    const reply = parsed as ErrorBody & {
      choices?: {
        finish_reason?: string;
        error?: { code?: number; message?: string };
        message?: { content?: unknown; refusal?: unknown };
      }[];
    };
    if (status >= 400 || reply?.error) {
      throw openRouterError(
        errorStatus(reply ?? {}, status >= 400 ? status : 502),
        reply?.error?.message ?? "",
        model,
      );
    }
    const choice = reply?.choices?.[0];
    if (choice?.error || choice?.finish_reason === "error") {
      throw openRouterError(
        errorStatus({ error: choice.error }, 502),
        choice.error?.message ?? "",
        model,
      );
    }
    if (typeof choice?.message?.refusal === "string" && choice.message.refusal) {
      throw new OpenRouterError(
        "refused",
        `The model declined to answer. ${PICK_ANOTHER}`,
        `OpenRouter model refused: ${choice.message.refusal.slice(0, 200)}`,
      );
    }
    const text = messageText(choice?.message?.content).trim();
    const badReply = (why: string) =>
      new OpenRouterError(
        "bad_reply",
        `OpenRouter's answer wasn't in the format Inbox Tidy needs. Try again, or ${PICK_ANOTHER_LOWER}`,
        `OpenRouter reply unusable (${why}, finish_reason ${choice?.finish_reason ?? "none"})`,
      );
    if (!text) throw badReply("empty");
    if (!options.jsonSchema) return text;
    const json = unfence(text);
    try {
      JSON.parse(json);
    } catch {
      throw badReply("not JSON");
    }
    return json;
  }

  async function checkKey(key: string): Promise<OpenRouterKeyCheck> {
    let parsed: unknown;
    let status: number;
    try {
      const res = await fetchImpl(`${API}/key`, {
        headers: { authorization: `Bearer ${key}`, ...APP_HEADERS },
        signal: AbortSignal.timeout(KEY_TIMEOUT_MS),
      });
      status = res.status;
      parsed = await readBody(res);
    } catch (error) {
      throw transportError(error);
    }
    if (status >= 400) {
      throw openRouterError(status, (parsed as ErrorBody)?.error?.message ?? "", null);
    }
    const data = (parsed as { data?: Record<string, unknown> })?.data ?? {};
    const hasCredit = data.is_free_tier !== true;
    const remaining = typeof data.limit_remaining === "number" ? data.limit_remaining : null;
    let message = "Your key works.";
    if (!hasCredit) {
      message =
        "Your key works, but your OpenRouter account has no credit yet. Add credit on openrouter.ai so Inbox Tidy can use the suggested models.";
    } else if (remaining !== null && remaining <= 0) {
      message =
        "Your key works, but it has reached its spending limit. Raise the limit for this key on openrouter.ai.";
    } else if (remaining !== null) {
      message = `Your key works. It can spend $${remaining.toFixed(2)} more before it reaches its limit.`;
    }
    return { message, hasCredit, limitRemaining: remaining };
  }

  async function models(): Promise<OpenRouterModel[]> {
    if (cache && now() - cache.at < MODELS_CACHE_MS) return cache.models;
    try {
      const res = await fetchImpl(`${API}/models?supported_parameters=structured_outputs`, {
        headers: APP_HEADERS,
        signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
      const list = toModelList(await res.json());
      cache = { at: now(), models: list };
      return list;
    } catch (error) {
      console.error(`Loading OpenRouter's model list failed: ${(error as Error).message}`);
      if (cache) return cache.models;
      throw new OpenRouterError(
        "offline",
        "Check your internet connection, then try again. You can still type a model ID below.",
        (error as Error).message,
      );
    }
  }

  return { ask, checkKey, models };
}
