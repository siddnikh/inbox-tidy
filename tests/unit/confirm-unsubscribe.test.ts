import { afterEach, describe, expect, test } from "bun:test";
import type { HomeSummary, SenderRow } from "../../src/shared/api.ts";
import { startTestApp, type TestApp } from "./helpers.ts";
import { addAccount, addAction, addMessages, addSender } from "./insights-fixtures.ts";

describe("finishing a web unsubscribe", () => {
  let app: TestApp;
  afterEach(() => app?.stop());

  test("an opened page waits for the user, and only their tick counts it", async () => {
    app = startTestApp();
    const account = addAccount(app.ctx);
    const sender = addSender(app.ctx, { address: "promo@web.example", method: "web" });
    addMessages(app.ctx, account, sender, [{ daysAgo: 2 }, { daysAgo: 9 }]);
    addAction(app.ctx, {
      senderId: sender,
      kind: "unsubscribe",
      status: "opened_in_browser",
      emailsPerMonthBefore: 6,
    });

    const waiting = (await (
      await app.call("/api/senders?filter=finish_on_web")
    ).json()) as SenderRow[];
    expect(waiting.map((s) => [s.id, s.status])).toEqual([[sender, "finish_on_web"]]);
    let summary = (await (await app.call("/api/summary")).json()) as HomeSummary;
    expect(summary.impact.sendersUnsubscribed).toBe(0);

    const res = await app.call(`/api/senders/${sender}/confirm-unsubscribe`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as SenderRow).status).toBe("unsubscribed");
    summary = (await (await app.call("/api/summary")).json()) as HomeSummary;
    expect(summary.impact).toMatchObject({ sendersUnsubscribed: 1, emailsAvoidedPerMonth: 6 });

    const again = await app.call(`/api/senders/${sender}/confirm-unsubscribe`, { method: "POST" });
    expect(again.status).toBe(409);
    expect(
      (await app.call("/api/senders/999/confirm-unsubscribe", { method: "POST" })).status,
    ).toBe(404);
  });
});
