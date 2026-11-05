import type { ApiErrorBody } from "../shared/api.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(
      "Inbox Tidy's background helper stopped responding. Quit the app and open it again.",
      0,
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      body?.error?.message ?? "Inbox Tidy didn't finish that. Please try again.",
      res.status,
      body?.error?.field,
    );
  }
  return (await res.json()) as T;
}
