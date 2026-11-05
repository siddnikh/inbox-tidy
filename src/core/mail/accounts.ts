import type {
  AccountSummary,
  AddAccountRequest,
  MailProviderId,
  ServerSettings,
} from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { HttpError } from "../http.ts";
import { type AccountRow, assertSafeTransport, getAccount, imapClient } from "./connection.ts";
import { describeError, plainMailError } from "./errors.ts";
import { presetFor } from "./presets.ts";
import { bestUnsubscribe } from "./unsubscribe-header.ts";

export interface NewAccount {
  provider: MailProviderId;
  email: string;
  password: string;
  imap: ServerSettings;
  imapUser: string;
  smtp: ServerSettings;
  smtpUser: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serverSettings(value: unknown, field: "imap" | "smtp"): ServerSettings {
  const label = field === "imap" ? "incoming (IMAP)" : "outgoing (SMTP)";
  const v = (value ?? {}) as Partial<ServerSettings>;
  const host = typeof v.host === "string" ? v.host.trim() : "";
  if (!host || /\s/.test(host)) {
    throw new HttpError(400, `Enter the ${label} server name from your provider.`, field);
  }
  if (!Number.isInteger(v.port) || (v.port as number) < 1 || (v.port as number) > 65535) {
    throw new HttpError(
      400,
      `Enter the ${label} port from your provider, a number like 993 or 465.`,
      field,
    );
  }
  if (typeof v.secure !== "boolean") {
    throw new HttpError(400, `Choose whether the ${label} server uses SSL/TLS.`, field);
  }
  return { host, port: v.port as number, secure: v.secure };
}

function assertSafe(settings: ServerSettings, field: "imap" | "smtp"): void {
  try {
    assertSafeTransport(
      settings.host,
      settings.secure,
      field === "smtp" ? settings.port : undefined,
    );
  } catch (error) {
    if (error instanceof HttpError) throw new HttpError(error.status, error.message, field);
    throw error;
  }
}

export function validateNewAccount(input: unknown): NewAccount {
  const body = (input && typeof input === "object" ? input : {}) as Partial<AddAccountRequest>;
  const preset = typeof body.provider === "string" ? presetFor(body.provider) : undefined;
  if (!preset) throw new HttpError(400, "Choose your email provider.", "provider");

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_SHAPE.test(email)) {
    throw new HttpError(400, "Enter your full email address, like you@gmail.com.", "email");
  }
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domain === "rediffmail.com") {
    const note = presetFor("rediffmail_pro")?.note ?? "Only Rediffmail Pro works.";
    throw new HttpError(400, note, "email");
  }

  const rawPassword = typeof body.password === "string" ? body.password : "";
  // Google shows app passwords in groups of four; the spaces aren't part of the password.
  const password = preset.id === "gmail" ? rawPassword.replace(/\s+/g, "") : rawPassword;
  if (!password.trim()) throw new HttpError(400, "Paste the app password.", "password");

  const imap = preset.imap ?? serverSettings(body.imap, "imap");
  const smtp = preset.smtp ?? serverSettings(body.smtp, "smtp");
  assertSafe(imap, "imap");
  assertSafe(smtp, "smtp");

  const localPart = email.slice(0, email.lastIndexOf("@"));
  return {
    provider: preset.id,
    email,
    password,
    imap,
    imapUser: preset.id === "icloud" ? localPart : email,
    smtp,
    smtpUser: email,
  };
}

export async function testLogin(account: NewAccount): Promise<void> {
  const client = imapClient({ ...account.imap, user: account.imapUser, pass: account.password });
  try {
    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true });
    await client.logout();
  } catch (error) {
    client.close();
    console.error(
      `Connection test for ${account.email} (${account.imap.host}:${account.imap.port}) failed:`,
      describeError(error),
    );
    const { kind, message } = plainMailError(error, account.provider, account.imap.host, "connect");
    if (kind === "auth") throw new HttpError(400, message, "password");
    if (kind === "unreachable" || kind === "tls") throw new HttpError(503, message);
    throw new HttpError(502, message);
  }
}

export function accountSummaries(ctx: AppContext, id?: number): AccountSummary[] {
  const rows = ctx.db
    .query<AccountRow & { message_count: number }, [number | null, number | null]>(
      `SELECT a.*, (
         SELECT COUNT(*) FROM messages m WHERE m.account_id = a.id AND m.trashed_at IS NULL
       ) AS message_count
       FROM accounts a WHERE (? IS NULL OR a.id = ?) ORDER BY a.id`,
    )
    .all(id ?? null, id ?? null);
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    email: row.email,
    messageCount: row.message_count,
    lastScanAt: row.last_scan_at,
    lastScanError: row.last_scan_error,
  }));
}

function emailTaken(ctx: AppContext, email: string): boolean {
  return (
    ctx.db
      .query<{ id: number }, [string]>("SELECT id FROM accounts WHERE lower(email) = ?")
      .get(email) !== null
  );
}

const DUPLICATE = "That account is already connected.";

export async function addAccount(
  ctx: AppContext,
  input: unknown,
  login: (account: NewAccount) => Promise<void> = testLogin,
): Promise<AccountSummary> {
  const account = validateNewAccount(input);
  if (emailTaken(ctx, account.email)) throw new HttpError(409, DUPLICATE, "email");

  await login(account);

  try {
    await ctx.secrets.set(account.email, account.password);
  } catch (error) {
    console.error(`Saving the Keychain item for ${account.email} failed:`, describeError(error));
    throw new HttpError(
      500,
      "Inbox Tidy couldn't save the password in your Mac's Keychain. If macOS asked for permission, choose Allow, then try again.",
    );
  }

  let id: number;
  try {
    const row = ctx.db
      .query<
        { id: number },
        [string, string, string, number, number, string, string, number, number, string]
      >(
        `INSERT INTO accounts
           (provider, email, imap_host, imap_port, imap_secure, imap_user,
            smtp_host, smtp_port, smtp_secure, smtp_user)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        account.provider,
        account.email,
        account.imap.host,
        account.imap.port,
        account.imap.secure ? 1 : 0,
        account.imapUser,
        account.smtp.host,
        account.smtp.port,
        account.smtp.secure ? 1 : 0,
        account.smtpUser,
      );
    if (!row) throw new Error("Account insert returned no row");
    id = row.id;
  } catch (error) {
    // A concurrent add of the same address already owns the Keychain item; leave it alone.
    if (emailTaken(ctx, account.email)) throw new HttpError(409, DUPLICATE, "email");
    await ctx.secrets.delete(account.email).catch(() => {});
    throw error;
  }

  const [summary] = accountSummaries(ctx, id);
  if (!summary) throw new Error("Saved account disappeared");
  return summary;
}

export async function removeAccount(ctx: AppContext, id: number): Promise<void> {
  const account = getAccount(ctx, id);
  try {
    await ctx.secrets.delete(account.email);
  } catch (error) {
    console.error(`Deleting the Keychain item for ${account.email} failed:`, describeError(error));
  }

  ctx.db.transaction(() => {
    const orphaned = ctx.db
      .query<{ id: number }, [number]>("SELECT id FROM senders WHERE unsubscribe_account_id = ?")
      .all(id)
      .map((s) => s.id);

    ctx.db.query("DELETE FROM accounts WHERE id = ?").run(id);
    // Senders with action history stay: the home screen's impact numbers are built from them.
    ctx.db.run(
      `DELETE FROM senders
       WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.sender_id = senders.id)
         AND NOT EXISTS (SELECT 1 FROM actions a WHERE a.sender_id = senders.id)`,
    );

    const newest = ctx.db.query<
      {
        account_id: number;
        received_at: string;
        list_unsubscribe: string;
        list_unsubscribe_post: string | null;
      },
      [number]
    >(
      `SELECT account_id, received_at, list_unsubscribe, list_unsubscribe_post FROM messages
       WHERE sender_id = ? AND list_unsubscribe IS NOT NULL
       ORDER BY received_at DESC LIMIT 1`,
    );
    const update = ctx.db.query(
      `UPDATE senders SET unsubscribe_method = ?, unsubscribe_target = ?,
         unsubscribe_account_id = ?, unsubscribe_at = ? WHERE id = ?`,
    );
    for (const senderId of orphaned) {
      const message = newest.get(senderId);
      if (!message) continue;
      const best = bestUnsubscribe(message.list_unsubscribe, message.list_unsubscribe_post);
      update.run(best.method, best.target, message.account_id, message.received_at, senderId);
    }
  })();
}
