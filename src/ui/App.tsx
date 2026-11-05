import { useEffect, useState } from "preact/hooks";
import type { AiCheckResponse, HealthResponse } from "../shared/api.ts";
import { type ApiError, api } from "./api.ts";

type Load<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error"; message: string };

export function App() {
  const [health, setHealth] = useState<Load<HealthResponse>>({ state: "loading" });
  const [check, setCheck] = useState<Load<AiCheckResponse> | null>(null);

  const loadHealth = () => {
    setHealth({ state: "loading" });
    api<HealthResponse>("/api/health")
      .then((data) => setHealth({ state: "ready", data }))
      .catch((e: ApiError) => setHealth({ state: "error", message: e.message }));
  };
  useEffect(loadHealth, []);

  const runCheck = () => {
    setCheck({ state: "loading" });
    api<AiCheckResponse>("/api/ai/check", { method: "POST" })
      .then((data) => setCheck({ state: "ready", data }))
      .catch((e: ApiError) => setCheck({ state: "error", message: e.message }));
  };

  return (
    <main class="page">
      <header class="page-header">
        <h1 class="large-title">Inbox Tidy</h1>
        <p class="secondary">See who fills your inbox, and quietly make it stop.</p>
      </header>
      <section class="card" aria-live="polite">
        <h2 class="title">AI helper</h2>
        {health.state === "loading" && (
          <div class="skeleton-line" role="status" aria-label="Checking…" />
        )}
        {health.state === "error" && (
          <div class="inline-error">
            <p>{health.message}</p>
            <button type="button" class="button" onClick={loadHealth}>
              Try again
            </button>
          </div>
        )}
        {health.state === "ready" && (
          <>
            <ul class="plain-list">
              {health.data.ai.providers.map((p) => (
                <li key={p.id}>
                  {p.label}: {p.available ? "installed" : "not found on this Mac"}
                </li>
              ))}
            </ul>
            <button
              type="button"
              class="button button-primary"
              disabled={check?.state === "loading"}
              onClick={runCheck}
            >
              {check?.state === "loading" ? "Checking…" : "Test the AI helper"}
            </button>
            {check?.state === "ready" && (
              <p class="success">
                {check.data.label} answered in {(check.data.durationMs / 1000).toFixed(1)} seconds.
              </p>
            )}
            {check?.state === "error" && <p class="danger">{check.message}</p>}
          </>
        )}
      </section>
    </main>
  );
}
