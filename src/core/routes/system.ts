import type { AiCheckResponse, AppSettings, HealthResponse } from "../../shared/api.ts";
import { AiUnavailableError, PROVIDER_LABELS } from "../ai/cli.ts";
import { schemaVersion } from "../db/database.ts";
import { apiError, json, type RouteTable, readJson } from "../http.ts";

export const systemRoutes: RouteTable = {
  "/api/health": {
    GET: async (_req, ctx) => {
      const providers = await ctx.ai.availability();
      const body: HealthResponse = {
        ok: true,
        version: ctx.version,
        database: { ok: true, schemaVersion: schemaVersion(ctx.db) },
        ai: {
          choice: ctx.settings().aiProvider,
          providers: providers.map(({ id, label, available }) => ({ id, label, available })),
        },
      };
      return json(body);
    },
  },
  "/api/ai/check": {
    POST: async (_req, ctx) => {
      try {
        const reply = await ctx.ai.ask("Reply with exactly the word: ready", { timeoutMs: 90_000 });
        const body: AiCheckResponse = {
          provider: reply.provider,
          label: PROVIDER_LABELS[reply.provider],
          reply: reply.text,
          durationMs: reply.durationMs,
        };
        return json(body);
      } catch (error) {
        if (error instanceof AiUnavailableError) {
          console.error("AI check failed:", error.message);
          return apiError(
            503,
            "Couldn't reach the AI helper. Open Terminal, run `claude` once to sign in, then try again.",
          );
        }
        throw error;
      }
    },
  },
  "/api/settings": {
    GET: (_req, ctx) => json(ctx.settings()),
    PUT: async (req, ctx) => json(ctx.updateSettings(await readJson<Partial<AppSettings>>(req))),
  },
};
