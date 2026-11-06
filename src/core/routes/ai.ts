import type {
  AiCheckResponse,
  AiHelpersResponse,
  OpenRouterModelsResponse,
  OpenRouterStatus,
  SaveOpenRouterKeyRequest,
} from "../../shared/api.ts";
import {
  AiUnavailableError,
  helperInUse,
  PROVIDER_LABELS,
  readOpenRouterKey,
} from "../ai/client.ts";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_KEY_NAME,
  OpenRouterError,
} from "../ai/openrouter.ts";
import type { AppContext } from "../context.ts";
import { apiError, HttpError, json, type RouteTable, readJson } from "../http.ts";

const CHECK_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
} as const;

export async function aiHelpers(ctx: AppContext, refresh = false): Promise<AiHelpersResponse> {
  const helpers = await ctx.ai.status({ refresh });
  const choice = ctx.settings().aiProvider;
  return { choice, inUse: helperInUse(choice, helpers), helpers };
}

async function openRouterStatus(ctx: AppContext): Promise<OpenRouterStatus> {
  const key = await readOpenRouterKey(ctx.secrets);
  return {
    hasKey: key !== null,
    keyEnding: key ? key.slice(-4) : null,
    model: ctx.settings().openRouterModel,
    defaultModel: DEFAULT_OPENROUTER_MODEL,
  };
}

function cleanKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim().replace(/^["']|["']$/g, "") : "";
  if (!key) throw new HttpError(400, "Paste your OpenRouter key first.", "key");
  if (key.length < 20 || key.length > 400 || /\s/.test(key)) {
    throw new HttpError(
      400,
      "That doesn't look like a whole OpenRouter key. Copy it again from openrouter.ai. It starts with sk-or-.",
      "key",
    );
  }
  return key;
}

export const aiRoutes: RouteTable = {
  "/api/ai/helpers": {
    GET: async (req, ctx) => {
      const refresh = new URL(req.url).searchParams.get("refresh") === "1";
      return json(await aiHelpers(ctx, refresh));
    },
  },
  "/api/ai/check": {
    POST: async (_req, ctx) => {
      try {
        const reply = await ctx.ai.ask(
          'Answer with JSON whose "answer" field is exactly the word: ready',
          { jsonSchema: CHECK_SCHEMA, schemaName: "check", timeoutMs: 90_000 },
        );
        let text = reply.text;
        try {
          const answer = (JSON.parse(text) as { answer?: unknown }).answer;
          if (typeof answer === "string") text = answer;
        } catch {
          // A plain-text answer still proves the helper works.
        }
        const body: AiCheckResponse = {
          provider: reply.provider,
          label: PROVIDER_LABELS[reply.provider],
          model: reply.model ?? null,
          reply: text,
          durationMs: reply.durationMs,
        };
        return json(body);
      } catch (error) {
        if (error instanceof AiUnavailableError) {
          console.error("AI check failed:", error.message);
          const only = error.failures.length === 1 ? error.failures[0] : undefined;
          return apiError(
            503,
            only?.userMessage ??
              "Follow the steps for one of the helpers below, then press Test the AI helper again.",
          );
        }
        throw error;
      }
    },
  },
  "/api/ai/openrouter": {
    GET: async (_req, ctx) => json(await openRouterStatus(ctx)),
  },
  "/api/ai/openrouter/key": {
    PUT: async (req, ctx) => {
      const body = await readJson<Partial<SaveOpenRouterKeyRequest> | null>(req);
      const clean = cleanKey(body && typeof body === "object" ? body.key : undefined);
      try {
        await ctx.secrets.set(OPENROUTER_KEY_NAME, clean);
      } catch (error) {
        console.error(`Saving the OpenRouter key failed: ${(error as Error).message}`);
        return apiError(
          500,
          "Couldn't save your key in your Mac's Keychain. If macOS asks for permission, choose Always Allow, then try again.",
        );
      }
      return json(await openRouterStatus(ctx));
    },
    DELETE: async (_req, ctx) => {
      try {
        await ctx.secrets.delete(OPENROUTER_KEY_NAME);
      } catch (error) {
        console.error(`Removing the OpenRouter key failed: ${(error as Error).message}`);
        return apiError(
          500,
          "Couldn't remove your key from your Mac's Keychain. If macOS asks for permission, choose Allow, then try again.",
        );
      }
      return json(await openRouterStatus(ctx));
    },
  },
  "/api/ai/openrouter/key/check": {
    POST: async (_req, ctx) => {
      const key = await readOpenRouterKey(ctx.secrets);
      if (!key) return apiError(400, "Add your OpenRouter key first.", "key");
      try {
        return json(await ctx.openRouter.checkKey(key));
      } catch (error) {
        if (!(error instanceof OpenRouterError)) throw error;
        console.error("OpenRouter key check failed:", error.message);
        return apiError(error.kind === "bad_key" ? 400 : 502, error.userMessage, "key");
      }
    },
  },
  "/api/ai/openrouter/models": {
    GET: async (_req, ctx) => {
      try {
        const body: OpenRouterModelsResponse = {
          models: await ctx.openRouter.models(),
          defaultModel: DEFAULT_OPENROUTER_MODEL,
        };
        return json(body);
      } catch (error) {
        if (!(error instanceof OpenRouterError)) throw error;
        return apiError(503, error.userMessage);
      }
    },
  },
};
