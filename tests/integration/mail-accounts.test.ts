import { afterEach, describe, expect, test } from "bun:test";
import { waitForScan } from "../../src/core/mail/scanner.ts";
import type { AccountSummary, ApiErrorBody } from "../../src/shared/api.ts";
import { startTestApp, type TestApp } from "../unit/helpers.ts";
import {
  accountRequest,
  createUser,
  daysAgo,
  greenmailChecksPasswords,
  rejectingImapServer,
  seed,
} from "./mail-server.ts";

const checksPasswords = await greenmailChecksPasswords();

let app: TestApp | undefined;
afterEach(async () => {
  if (app) await waitForScan(app.ctx);
  app?.stop();
  app = undefined;
});

async function errorOf(res: Response): Promise<ApiErrorBody["error"]> {
  return ((await res.json()) as ApiErrorBody).error;
}

function accountCount(a: TestApp): number {
  return (a.ctx.db.query("SELECT COUNT(*) AS n FROM accounts").get() as { n: number }).n;
}

describe("connecting an account", () => {
  test("a wrong password is rejected with a plain message and nothing is saved", async () => {
    app = startTestApp();
    const server = rejectingImapServer();
    try {
      const user = await createUser("wrongpw");
      const res = await app.call("/api/accounts", {
        method: "POST",
        body: {
          ...accountRequest(user, "not-the-password"),
          imap: { host: "127.0.0.1", port: server.port, secure: false },
        },
      });
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toEqual({
        message:
          "Your email provider didn't accept that password. Check the address and password. If your provider offers app passwords, use one.",
        field: "password",
      });
      expect(accountCount(app)).toBe(0);
      expect(await app.ctx.secrets.get(user.email)).toBeNull();
    } finally {
      server.stop();
    }
  });

  test.skipIf(!checksPasswords)("GreenMail rejects a wrong password too", async () => {
    app = startTestApp();
    const user = await createUser("wrongpw-gm");
    const res = await app.call("/api/accounts", {
      method: "POST",
      body: accountRequest(user, "not-the-password"),
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).field).toBe("password");
    expect(accountCount(app)).toBe(0);
  });

  test("an unreachable server says so", async () => {
    app = startTestApp();
    const closed = rejectingImapServer();
    closed.stop();
    const user = await createUser("unreachable");
    const res = await app.call("/api/accounts", {
      method: "POST",
      body: {
        ...accountRequest(user),
        imap: { host: "127.0.0.1", port: closed.port, secure: false },
      },
    });
    expect(res.status).toBe(503);
    expect((await errorOf(res)).message).toStartWith("Couldn't reach 127.0.0.1.");
    expect(accountCount(app)).toBe(0);
  });

  test("a good login is saved, scanned, and can be removed", async () => {
    app = startTestApp();
    const user = await createUser("connect");
    await seed(user, [
      { from: "News <news@shop.example>", subject: "Hello", date: daysAgo(3) },
      { from: "Pal <pal@friends.example>", subject: "Lunch?", date: daysAgo(2), seen: true },
    ]);

    const res = await app.call("/api/accounts", { method: "POST", body: accountRequest(user) });
    expect(res.status).toBe(201);
    const summary = (await res.json()) as AccountSummary;
    expect(summary).toMatchObject({ provider: "other", email: user.email, lastScanError: null });
    expect(JSON.stringify(summary)).not.toContain(user.password);
    expect(await app.ctx.secrets.get(user.email)).toBe(user.password);

    const status = await waitForScan(app.ctx);
    expect(status.state).toBe("done");
    const list = (await (await app.call("/api/accounts")).json()) as AccountSummary[];
    expect(list).toHaveLength(1);
    expect(list[0]?.messageCount).toBe(2);
    expect(list[0]?.lastScanAt).not.toBeNull();

    const again = await app.call("/api/accounts", { method: "POST", body: accountRequest(user) });
    expect(again.status).toBe(409);

    const removed = await app.call(`/api/accounts/${summary.id}`, { method: "DELETE" });
    expect(await removed.json()).toEqual({ ok: true });
    expect(await app.ctx.secrets.get(user.email)).toBeNull();
    for (const table of ["accounts", "messages", "senders", "mailbox_state"]) {
      expect(app.ctx.db.query(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });
});
