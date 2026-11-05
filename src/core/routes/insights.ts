import type { BunRequest } from "bun";
import type { SenderFilter, SenderSort } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { HttpError, idParam, json, type RouteTable } from "../http.ts";
import {
  getSender,
  listSenders,
  SENDER_FILTERS,
  SENDER_SORTS,
  setKept,
} from "../insights/senders.ts";
import { homeSummary } from "../insights/summary.ts";

function keep(kept: boolean) {
  return (req: BunRequest, ctx: AppContext) => {
    const id = idParam(req);
    if (!setKept(ctx, id, kept)) throw new HttpError(404, "That sender is no longer in your list.");
    return json(getSender(ctx, id));
  };
}

export const insightRoutes: RouteTable = {
  "/api/summary": { GET: (_req, ctx) => json(homeSummary(ctx)) },
  "/api/senders": {
    GET: (req, ctx) => {
      const params = new URL(req.url).searchParams;
      const filter = params.get("filter") || "all";
      const sort = params.get("sort") || "most";
      if (!SENDER_FILTERS.includes(filter as SenderFilter)) {
        throw new HttpError(400, "Inbox Tidy asked for a list it doesn't know. Please try again.");
      }
      if (!SENDER_SORTS.includes(sort as SenderSort)) {
        throw new HttpError(
          400,
          "Inbox Tidy asked for an order it doesn't know. Please try again.",
        );
      }
      return json(
        listSenders(ctx, {
          filter: filter as SenderFilter,
          sort: sort as SenderSort,
          q: params.get("q") ?? "",
        }),
      );
    },
  },
  "/api/senders/:id/keep": { POST: keep(true), DELETE: keep(false) },
};
