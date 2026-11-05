import type { ActionsResponse } from "../../shared/api.ts";
import { mapLimit, parseBoolean, parseOlderThanDays, parseSenderIds } from "../actions/shared.ts";
import { trashSenderEmails } from "../actions/trash.ts";
import { UNSUBSCRIBE_CONCURRENCY, unsubscribeSenders } from "../actions/unsubscribe.ts";
import { json, type RouteTable, readJson } from "../http.ts";

export const actionRoutes: RouteTable = {
  "/api/actions/unsubscribe": {
    POST: async (req, ctx) => {
      const body = await readJson<unknown>(req);
      const senderIds = parseSenderIds(body);
      const alsoTrash = parseBoolean(body, "alsoTrash");
      const response: ActionsResponse = {
        results: await unsubscribeSenders(ctx, senderIds, alsoTrash),
      };
      return json(response);
    },
  },
  "/api/actions/trash": {
    POST: async (req, ctx) => {
      const body = await readJson<unknown>(req);
      const senderIds = parseSenderIds(body);
      const olderThanDays = parseOlderThanDays(body);
      const onlyRead = parseBoolean(body, "onlyRead");
      const response: ActionsResponse = {
        results: await mapLimit(senderIds, UNSUBSCRIBE_CONCURRENCY, (id) =>
          trashSenderEmails(ctx, id, { olderThanDays, onlyRead }),
        ),
      };
      return json(response);
    },
  },
};
