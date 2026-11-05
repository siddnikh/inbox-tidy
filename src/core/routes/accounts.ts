import { idParam, json, type RouteTable, readJson } from "../http.ts";
import { accountSummaries, addAccount, removeAccount } from "../mail/accounts.ts";
import { PROVIDER_PRESETS } from "../mail/presets.ts";
import { scanStatus, startScan } from "../mail/scanner.ts";

export const accountRoutes: RouteTable = {
  "/api/providers": { GET: () => json(PROVIDER_PRESETS) },
  "/api/accounts": {
    GET: (_req, ctx) => json(accountSummaries(ctx)),
    POST: async (req, ctx) => {
      const summary = await addAccount(ctx, await readJson<unknown>(req));
      startScan(ctx);
      return json(summary, 201);
    },
  },
  "/api/accounts/:id": {
    DELETE: async (req, ctx) => {
      await removeAccount(ctx, idParam(req));
      return json({ ok: true });
    },
  },
  "/api/scan": {
    GET: (_req, ctx) => json(scanStatus(ctx)),
    POST: (_req, ctx) => json(startScan(ctx)),
  },
};
