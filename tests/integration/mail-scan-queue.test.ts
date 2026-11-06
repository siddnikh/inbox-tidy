import { afterAll, expect, test } from "bun:test";
import { waitForScan } from "../../src/core/mail/scanner.ts";
import type { AccountSummary, HomeSummary } from "../../src/shared/api.ts";
import { startTestApp, type TestApp } from "../unit/helpers.ts";
import { accountRequest, createUser, daysAgo, seed } from "./mail-server.ts";

let app: TestApp;
afterAll(async () => {
  await waitForScan(app.ctx);
  app.stop();
});

test("an account added while a scan runs is scanned too, and Home can show each one", async () => {
  app = startTestApp();
  const first = await createUser("queue-first");
  const second = await createUser("queue-second");
  await seed(first, [{ from: "Shop <news@shop.example>", subject: "Sale", date: daysAgo(3) }]);
  await seed(second, [
    { from: "Club <hi@club.example>", subject: "Hello", date: daysAgo(2) },
    { from: "Club <hi@club.example>", subject: "Again", date: daysAgo(1) },
  ]);

  const a = (await (
    await app.call("/api/accounts", { method: "POST", body: accountRequest(first) })
  ).json()) as AccountSummary;
  const b = (await (
    await app.call("/api/accounts", { method: "POST", body: accountRequest(second) })
  ).json()) as AccountSummary;

  const status = await waitForScan(app.ctx);
  expect(status.state).toBe("done");
  const list = (await (await app.call("/api/accounts")).json()) as AccountSummary[];
  expect(list.map((x) => [x.email, x.messageCount, x.lastScanAt !== null])).toEqual([
    [first.email, 1, true],
    [second.email, 2, true],
  ]);

  const forA = (await (await app.call(`/api/summary?account=${a.id}`)).json()) as HomeSummary;
  const forB = (await (await app.call(`/api/summary?account=${b.id}`)).json()) as HomeSummary;
  const all = (await (await app.call("/api/summary")).json()) as HomeSummary;
  expect([forA.inbox.totalEmails, forB.inbox.totalEmails, all.inbox.totalEmails]).toEqual([
    1, 2, 3,
  ]);
});
