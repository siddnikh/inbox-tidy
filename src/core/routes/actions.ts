import { notBuilt, type RouteTable } from "../http.ts";

export const actionRoutes: RouteTable = {
  "/api/actions/unsubscribe": { POST: notBuilt },
  "/api/actions/trash": { POST: notBuilt },
};
