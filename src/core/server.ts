import type { BunRequest, Server } from "bun";
import homepage from "../ui/index.html";
import type { AppContext } from "./context.ts";
import { apiError, type Handler, HttpError, type Method, type RouteTable } from "./http.ts";
import { accountRoutes } from "./routes/accounts.ts";
import { actionRoutes } from "./routes/actions.ts";
import { aiRoutes } from "./routes/ai.ts";
import { insightRoutes } from "./routes/insights.ts";
import { systemRoutes } from "./routes/system.ts";

export const SESSION_COOKIE = "inbox_tidy_session";

const apiTables: RouteTable[] = [
  systemRoutes,
  aiRoutes,
  accountRoutes,
  insightRoutes,
  actionRoutes,
];

export interface StartedServer {
  server: Server<undefined>;
  url: string;
  sessionUrl: string;
  token: string;
}

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function startServer(ctx: AppContext): StartedServer {
  const token = ctx.config.token ?? crypto.randomUUID();
  let allowedHosts = new Set<string>();

  // Only the app's own window may call the API: it must target our exact host (blocks DNS
  // rebinding from web pages), carry the session cookie, and writes must be same-origin.
  function guard(handler: Handler): (req: BunRequest) => Promise<Response> {
    return async (req) => {
      if (!allowedHosts.has(req.headers.get("host") ?? "")) {
        return apiError(403, "Inbox Tidy only accepts requests from its own window.");
      }
      if (cookieValue(req, SESSION_COOKIE) !== token) {
        return apiError(401, "Your Inbox Tidy session ended. Close the app and open it again.");
      }
      const origin = req.headers.get("origin");
      if (req.method !== "GET" && origin && !allowedHosts.has(origin.replace(/^https?:\/\//, ""))) {
        return apiError(403, "Inbox Tidy only accepts requests from its own window.");
      }
      try {
        return await handler(req, ctx);
      } catch (error) {
        if (error instanceof HttpError) return apiError(error.status, error.message, error.field);
        console.error(`${req.method} ${new URL(req.url).pathname} failed:`, error);
        return apiError(
          500,
          "Inbox Tidy ran into an unexpected problem and didn't finish that. Please try again.",
        );
      }
    };
  }

  const routes: Bun.Serve.Routes<undefined, string> = {
    "/": homepage,
    "/session": (req: Request) => {
      const url = new URL(req.url);
      if (url.searchParams.get("t") !== token) {
        return new Response("This link has expired. Open Inbox Tidy again.", { status: 401 });
      }
      return new Response(null, {
        status: 303,
        headers: {
          location: "/",
          "set-cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict`,
        },
      });
    },
  };
  for (const table of apiTables) {
    for (const [path, methods] of Object.entries(table)) {
      const wrapped: Partial<Record<Method, (req: BunRequest) => Promise<Response>>> = {};
      for (const [method, handler] of Object.entries(methods)) {
        if (handler) wrapped[method as Method] = guard(handler);
      }
      routes[path] = wrapped;
    }
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: ctx.config.port,
    development: ctx.config.dev ? { hmr: true, console: true } : false,
    // Scans and AI batches can keep a request open for a while.
    idleTimeout: 255,
    routes,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path.startsWith("/api/")) return apiError(404, "Inbox Tidy doesn't know that request.");
      return new Response("Not found", { status: 404 });
    },
  });

  const port = server.port;
  allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const url = `http://127.0.0.1:${port}`;
  return { server, url, sessionUrl: `${url}/session?t=${token}`, token };
}
