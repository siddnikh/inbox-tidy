import type { BunRequest } from "bun";
import type { ApiErrorBody } from "../shared/api.ts";
import type { AppContext } from "./context.ts";

export type Method = "GET" | "POST" | "PUT" | "DELETE";
export type Handler = (req: BunRequest, ctx: AppContext) => Response | Promise<Response>;
export type RouteTable = Record<string, Partial<Record<Method, Handler>>>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function apiError(status: number, message: string, field?: string): Response {
  const body: ApiErrorBody = { error: field ? { message, field } : { message } };
  return Response.json(body, { status });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Inbox Tidy sent a request it couldn't read. Please try again.");
  }
}

export function idParam(req: BunRequest): number {
  const raw = (req.params as Record<string, string>).id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "That item no longer exists.");
  return id;
}

export function notBuilt(): Response {
  return apiError(501, "This part of Inbox Tidy isn't built yet.");
}
