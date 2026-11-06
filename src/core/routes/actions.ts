import type { ActionsResponse } from "../../shared/api.ts";
import { mapLimit, parseBoolean, parseOlderThanDays, parseSenderIds } from "../actions/shared.ts";
import { trashSenderEmails } from "../actions/trash.ts";
import {
  confirmWebUnsubscribe,
  UNSUBSCRIBE_CONCURRENCY,
  unsubscribeSenders,
} from "../actions/unsubscribe.ts";
import { HttpError, idParam, json, type RouteTable, readJson } from "../http.ts";
import { getSender } from "../insights/senders.ts";

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
  "/api/senders/:id/confirm-unsubscribe": {
    POST: (req, ctx) => {
      const id = idParam(req);
      if (!getSender(ctx, id)) throw new HttpError(404, "That sender is no longer in your list.");
      confirmWebUnsubscribe(ctx, id);
      return json(getSender(ctx, id));
    },
  },
};
