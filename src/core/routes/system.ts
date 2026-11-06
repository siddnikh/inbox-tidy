import type { AppSettings, HealthResponse } from "../../shared/api.ts";
import { schemaVersion } from "../db/database.ts";
import { json, type RouteTable, readJson } from "../http.ts";
import { aiHelpers } from "./ai.ts";

export const systemRoutes: RouteTable = {
  "/api/health": {
    GET: async (_req, ctx) => {
      const body: HealthResponse = {
        ok: true,
        version: ctx.version,
        database: { ok: true, schemaVersion: schemaVersion(ctx.db) },
        ai: await aiHelpers(ctx),
      };
      return json(body);
    },
  },
  "/api/settings": {
    GET: (_req, ctx) => json(ctx.settings()),
    PUT: async (req, ctx) => json(ctx.updateSettings(await readJson<Partial<AppSettings>>(req))),
  },
};
