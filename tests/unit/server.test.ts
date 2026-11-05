import { afterEach, describe, expect, test } from "bun:test";
import type { AiCheckResponse, AppSettings, HealthResponse } from "../../src/shared/api.ts";
import { startTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
afterEach(() => app?.stop());

describe("server", () => {
  test("health reports database and AI availability", async () => {
    app = startTestApp();
    const res = await app.call("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body.ok).toBe(true);
    expect(body.database.schemaVersion).toBeGreaterThan(0);
    expect(body.ai.providers.find((p) => p.id === "claude")?.available).toBe(true);
  });

  test("API rejects requests without the session cookie", async () => {
    app = startTestApp();
    const res = await fetch(`${app.started.url}/api/health`);
    expect(res.status).toBe(401);
  });

  test("API rejects foreign Host headers", async () => {
    app = startTestApp();
    const res = await fetch(`${app.started.url}/api/health`, {
      headers: { host: "evil.example:80", cookie: `inbox_tidy_session=${app.started.token}` },
    });
    expect(res.status).toBe(403);
  });

  test("session link sets the cookie and redirects home", async () => {
    app = startTestApp();
    const res = await fetch(app.started.sessionUrl, { redirect: "manual" });
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    const bad = await fetch(`${app.started.url}/session?t=wrong`, { redirect: "manual" });
    expect(bad.status).toBe(401);
  });

  test("AI check returns the answering provider", async () => {
    app = startTestApp();
    const res = await app.call("/api/ai/check", { method: "POST" });
    const body = (await res.json()) as AiCheckResponse;
    expect(body.label).toBe("Claude");
  });

  test("settings persist and validate", async () => {
    app = startTestApp();
    const res = await app.call("/api/settings", { method: "PUT", body: { aiProvider: "codex" } });
    expect(((await res.json()) as AppSettings).aiProvider).toBe("codex");
    const bad = await app.call("/api/settings", { method: "PUT", body: { lookbackMonths: 0 } });
    expect(bad.status).toBe(400);
  });
});
