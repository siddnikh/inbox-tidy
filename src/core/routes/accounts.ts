import { notBuilt, type RouteTable } from "../http.ts";

export const accountRoutes: RouteTable = {
  "/api/providers": { GET: notBuilt },
  "/api/accounts": { GET: notBuilt, POST: notBuilt },
  "/api/accounts/:id": { DELETE: notBuilt },
  "/api/scan": { GET: notBuilt, POST: notBuilt },
};
