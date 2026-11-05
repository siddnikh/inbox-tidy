import { afterEach, describe, expect, test } from "bun:test";
import { addAccount, validateNewAccount } from "../../src/core/mail/accounts.ts";
import { classifyMailError, plainMailError } from "../../src/core/mail/errors.ts";
import { PROVIDER_PRESETS } from "../../src/core/mail/presets.ts";
import type { AccountSummary, ApiErrorBody, ScanStatus } from "../../src/shared/api.ts";
import { startTestApp, type TestApp, testContext } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(() => {
  app?.stop();
  app = undefined;
});

const local = { host: "127.0.0.1", port: 3143, secure: false };
const localSmtp = { host: "127.0.0.1", port: 3025, secure: false };

function codeError(code: string): Error {
  return Object.assign(new Error(`connect ${code}`), { code });
}

async function errorOf(res: Response): Promise<ApiErrorBody["error"]> {
  return ((await res.json()) as ApiErrorBody).error;
}

describe("account validation", () => {
  test("applies presets and provider-specific usernames", () => {
    const icloud = validateNewAccount({
      provider: "icloud",
      email: " Me@iCloud.com ",
      password: "abcd-efgh",
    });
    expect(icloud.email).toBe("me@icloud.com");
    expect(icloud.imap).toEqual({ host: "imap.mail.me.com", port: 993, secure: true });
    expect(icloud.imapUser).toBe("me");
    expect(icloud.smtpUser).toBe("me@icloud.com");

    const gmail = validateNewAccount({
      provider: "gmail",
      email: "you@gmail.com",
      password: "abcd efgh ijkl mnop",
    });
    expect(gmail.password).toBe("abcdefghijklmnop");
    expect(gmail.imapUser).toBe("you@gmail.com");
  });

  test("rejects bad input with a field to highlight", () => {
    const cases: [unknown, string][] = [
      [{ provider: "aol", email: "a@b.com", password: "x" }, "provider"],
      [{ provider: "gmail", email: "not-an-email", password: "x" }, "email"],
      [{ provider: "gmail", email: "a@gmail.com", password: "   " }, "password"],
      [{ provider: "other", email: "a@b.com", password: "x" }, "imap"],
      [{ provider: "other", email: "a@b.com", password: "x", imap: local }, "smtp"],
      [{ provider: "other", email: "a@b.com", password: "x", imap: { ...local, port: 0 } }, "imap"],
    ];
    for (const [input, field] of cases) {
      expect(() => validateNewAccount(input)).toThrow(expect.objectContaining({ field }));
    }
  });

  test("refuses plain-text connections to anything but localhost", () => {
    const base = { provider: "other", email: "a@example.com", password: "x" };
    expect(() =>
      validateNewAccount({
        ...base,
        imap: { ...local, host: "mail.example.com" },
        smtp: localSmtp,
      }),
    ).toThrow(expect.objectContaining({ field: "imap", message: expect.stringContaining("SSL") }));
    expect(() =>
      validateNewAccount({
        ...base,
        imap: local,
        smtp: { ...localSmtp, host: "mail.example.com" },
      }),
    ).toThrow(expect.objectContaining({ field: "smtp" }));
    expect(validateNewAccount({ ...base, imap: local, smtp: localSmtp }).imap).toEqual(local);
  });

  test("explains that free Rediffmail addresses can't connect", () => {
    const note = PROVIDER_PRESETS.find((p) => p.id === "rediffmail_pro")?.note;
    expect(() =>
      validateNewAccount({ provider: "rediffmail_pro", email: "me@rediffmail.com", password: "x" }),
    ).toThrow(expect.objectContaining({ message: note, field: "email" }));
  });
});

describe("mail error messages", () => {
  test("wrong passwords get a provider-specific sentence", () => {
    const auth = Object.assign(new Error("Authentication failed."), {
      authenticationFailed: true,
      serverResponseCode: "AUTHENTICATIONFAILED",
    });
    expect(plainMailError(auth, "gmail", "imap.gmail.com", "connect").message).toBe(
      "Gmail didn't accept that password. Make sure you pasted an app password, not your normal password.",
    );
    expect(plainMailError(auth, "icloud", "imap.mail.me.com", "connect").message).toContain(
      "iCloud Mail didn't accept that password",
    );
    expect(plainMailError(auth, "other", "127.0.0.1", "connect").message).toContain(
      "Your email provider didn't accept that password",
    );
    expect(plainMailError(auth, "yahoo", "x", "scan").message).toContain("saved password");
  });

  test("network failures say the provider couldn't be reached", () => {
    for (const code of ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "CONNECT_TIMEOUT"]) {
      expect(classifyMailError(codeError(code))).toBe("unreachable");
    }
    expect(
      plainMailError(codeError("ENOTFOUND"), "yahoo", "imap.mail.yahoo.com", "connect"),
    ).toEqual({
      kind: "unreachable",
      message: "Couldn't reach Yahoo Mail. Check your internet connection and try again.",
    });
    expect(
      plainMailError(codeError("ECONNREFUSED"), "other", "mail.example.com", "connect").message,
    ).toContain("Couldn't reach mail.example.com.");
  });

  test("recognises IMAP turned off and TLS failures", () => {
    const disabled = Object.assign(new Error("Command failed"), {
      responseText: "[ALERT] Your account is not enabled for IMAP use.",
    });
    expect(plainMailError(disabled, "gmail", "imap.gmail.com", "connect").message).toContain(
      "turn on IMAP",
    );
    expect(classifyMailError(codeError("CERT_HAS_EXPIRED"))).toBe("tls");
    expect(classifyMailError(new Error("weird"))).toBe("other");
  });
});

describe("adding an account", () => {
  const request = {
    provider: "other",
    email: "Me@Example.com",
    password: "secret",
    imap: local,
    smtp: localSmtp,
  };

  test("saves the password in the secret store, never in the database", async () => {
    const ctx = testContext();
    let tested = false;
    const summary = await addAccount(ctx, request, async () => {
      tested = true;
    });
    expect(tested).toBe(true);
    expect(summary).toMatchObject({ provider: "other", email: "me@example.com", messageCount: 0 });
    expect(await ctx.secrets.get("me@example.com")).toBe("secret");
    const row = ctx.db.query("SELECT * FROM accounts").get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain("secret");
    ctx.db.close();
  });

  test("a failed login saves nothing", async () => {
    const ctx = testContext();
    const failure = new Error("nope");
    await expect(
      addAccount(ctx, request, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(ctx.db.query("SELECT COUNT(*) AS n FROM accounts").get()).toEqual({ n: 0 });
    expect(await ctx.secrets.get("me@example.com")).toBeNull();
    ctx.db.close();
  });

  test("a Keychain failure is explained and nothing is saved", async () => {
    const ctx = testContext();
    ctx.secrets.set = async () => {
      throw new Error("User canceled");
    };
    await expect(addAccount(ctx, request, async () => {})).rejects.toThrow("Keychain");
    expect(ctx.db.query("SELECT COUNT(*) AS n FROM accounts").get()).toEqual({ n: 0 });
    ctx.db.close();
  });

  test("duplicates are refused before any connection", async () => {
    app = startTestApp();
    await addAccount(app.ctx, request, async () => {});
    const res = await app.call("/api/accounts", { method: "POST", body: request });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).message).toBe("That account is already connected.");
  });

  test("invalid requests are rejected by the route", async () => {
    app = startTestApp();
    const res = await app.call("/api/accounts", {
      method: "POST",
      body: { provider: "gmail", email: "nope", password: "x" },
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).field).toBe("email");
  });
});

describe("account routes", () => {
  test("providers lists the presets", async () => {
    app = startTestApp();
    const res = await app.call("/api/providers");
    expect(await res.json()).toEqual(PROVIDER_PRESETS);
  });

  test("scan status starts idle", async () => {
    app = startTestApp();
    const status = (await (await app.call("/api/scan")).json()) as ScanStatus;
    expect(status).toMatchObject({ state: "idle", stage: null, errors: [] });
  });

  test("removing an account cleans up its mail, password, and orphaned senders", async () => {
    app = startTestApp();
    const { ctx } = app;
    const a = await addAccount(
      ctx,
      { provider: "other", email: "a@example.com", password: "pa", imap: local, smtp: localSmtp },
      async () => {},
    );
    const b = await addAccount(
      ctx,
      { provider: "other", email: "b@example.com", password: "pb", imap: local, smtp: localSmtp },
      async () => {},
    );
    const sender = (address: string) =>
      (
        ctx.db
          .query<{ id: number }, [string, string]>(
            "INSERT INTO senders (address, domain) VALUES (?, ?) RETURNING id",
          )
          .get(address, address.split("@")[1] ?? "") as { id: number }
      ).id;
    const onlyA = sender("only@a.example");
    const withAction = sender("acted@a.example");
    const shared = sender("shared@both.example");
    const message = ctx.db.query(
      `INSERT INTO messages (account_id, mailbox, uid_validity, uid, sender_id, received_at, is_read,
         list_unsubscribe, list_unsubscribe_post, trashed_at)
       VALUES (?, 'INBOX', 1, ?, ?, ?, 0, ?, ?, ?)`,
    );
    message.run(a.id, 1, onlyA, "2026-10-01T00:00:00.000Z", null, null, null);
    message.run(a.id, 2, withAction, "2026-10-01T00:00:00.000Z", null, null, null);
    message.run(a.id, 3, shared, "2026-10-03T00:00:00.000Z", "<https://a.example/u>", null, null);
    message.run(b.id, 1, shared, "2026-10-02T00:00:00.000Z", "<mailto:u@both.example>", null, null);
    message.run(b.id, 2, shared, "2026-10-02T00:00:00.000Z", null, null, "2026-10-05T00:00:00Z");
    ctx.db
      .query(
        "UPDATE senders SET unsubscribe_method = 'web', unsubscribe_target = 'https://a.example/u', unsubscribe_account_id = ?, unsubscribe_at = '2026-10-03T00:00:00.000Z' WHERE id = ?",
      )
      .run(a.id, shared);
    ctx.db
      .query("INSERT INTO actions (sender_id, kind, status) VALUES (?, 'unsubscribe', 'done')")
      .run(withAction);

    const list = (await (await app.call("/api/accounts")).json()) as AccountSummary[];
    expect(list.map((s) => [s.email, s.messageCount])).toEqual([
      ["a@example.com", 3],
      ["b@example.com", 1],
    ]);

    const res = await app.call(`/api/accounts/${a.id}`, { method: "DELETE" });
    expect(await res.json()).toEqual({ ok: true });
    expect(await ctx.secrets.get("a@example.com")).toBeNull();
    expect(await ctx.secrets.get("b@example.com")).toBe("pb");
    const addresses = ctx.db
      .query<{ address: string }, []>("SELECT address FROM senders ORDER BY address")
      .all()
      .map((s) => s.address);
    expect(addresses).toEqual(["acted@a.example", "shared@both.example"]);
    expect(
      ctx.db
        .query(
          "SELECT unsubscribe_method, unsubscribe_target, unsubscribe_account_id FROM senders WHERE id = ?",
        )
        .get(shared),
    ).toEqual({
      unsubscribe_method: "mailto",
      unsubscribe_target: "mailto:u@both.example",
      unsubscribe_account_id: b.id,
    });
    expect(
      ctx.db.query("SELECT COUNT(*) AS n FROM messages WHERE account_id = ?").get(a.id),
    ).toEqual({ n: 0 });

    const missing = await app.call(`/api/accounts/${a.id}`, { method: "DELETE" });
    expect(missing.status).toBe(404);
  });
});
