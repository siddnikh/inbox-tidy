import { notBuilt, type RouteTable } from "../http.ts";

export const insightRoutes: RouteTable = {
  "/api/summary": { GET: notBuilt },
  "/api/senders": { GET: notBuilt },
  "/api/senders/:id/keep": { POST: notBuilt, DELETE: notBuilt },
};
