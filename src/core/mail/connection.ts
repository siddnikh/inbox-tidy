import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { MailProviderId } from "../../shared/api.ts";
import type { AppContext } from "../context.ts";
import { HttpError } from "../http.ts";
import { isLocalHost } from "./presets.ts";

export interface AccountRow {
  id: number;
  provider: MailProviderId;
  email: string;
  imap_host: string;
  imap_port: number;
  imap_secure: number;
  imap_user: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: number | null;
  smtp_user: string | null;
  created_at: string;
  last_scan_at: string | null;
  last_scan_error: string | null;
}

export interface ImapLogin {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export function assertSafeTransport(host: string, secure: boolean, port?: number): void {
  // Port 587 upgrades with STARTTLS, which nodemailer requires when requireTLS is set.
  if (!secure && port !== 587 && !isLocalHost(host)) {
    throw new HttpError(
      400,
      "Inbox Tidy only connects to email servers over a secure connection. Turn on SSL/TLS.",
      "imap",
    );
  }
}

export function getAccount(ctx: AppContext, id: number): AccountRow {
  const row = ctx.db.query<AccountRow, [number]>("SELECT * FROM accounts WHERE id = ?").get(id);
  if (!row) throw new HttpError(404, "That email account isn't connected anymore.");
  return row;
}

export function listAccounts(ctx: AppContext): AccountRow[] {
  return ctx.db.query<AccountRow, []>("SELECT * FROM accounts ORDER BY id").all();
}

export async function accountPassword(ctx: AppContext, account: AccountRow): Promise<string> {
  // A denied or dismissed Keychain prompt looks the same as a missing item, so the message
  // covers both, the prompt first because it is far more common after an app update.
  let pass: string | null = null;
  try {
    pass = await ctx.secrets.get(account.email);
  } catch (error) {
    console.error(`Reading the Keychain item for ${account.email} failed:`, error);
  }
  if (!pass) {
    throw new HttpError(
      409,
      `Inbox Tidy couldn't read the saved password for ${account.email}. If your Mac asks to let Inbox Tidy use your Keychain, type your Mac password, choose Always Allow, and scan again. If it keeps happening, remove the account and add it again.`,
    );
  }
  return pass;
}

export function imapClient(login: ImapLogin): ImapFlow {
  assertSafeTransport(login.host, login.secure);
  return new ImapFlow({
    host: login.host,
    port: login.port,
    secure: login.secure,
    auth: { user: login.user, pass: login.pass },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
  });
}

export async function openImap(ctx: AppContext, account: AccountRow): Promise<ImapFlow> {
  const client = imapClient({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure === 1,
    user: account.imap_user,
    pass: await accountPassword(ctx, account),
  });
  await client.connect();
  return client;
}

// Finds the provider's Trash by special-use flag first (names differ: "[Gmail]/Trash",
// "Deleted Messages", "Trash"), then by name, creating "Trash" as a last resort.
export async function findTrashMailbox(client: ImapFlow): Promise<string> {
  const boxes = await client.list();
  const special = boxes.find((b) => b.specialUse === "\\Trash");
  if (special) return special.path;
  const named = boxes.find((b) =>
    ["trash", "deleted messages", "deleted items"].includes(b.path.toLowerCase()),
  );
  if (named) return named.path;
  await client.mailboxCreate("Trash");
  return "Trash";
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(
  ctx: AppContext,
  account: AccountRow,
  mail: OutgoingMail,
): Promise<void> {
  if (!account.smtp_host || !account.smtp_port) {
    throw new HttpError(400, `Inbox Tidy doesn't know how to send email from ${account.email}.`);
  }
  const secure = account.smtp_secure === 1;
  assertSafeTransport(account.smtp_host, secure, account.smtp_port);
  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure,
    requireTLS: !secure && !isLocalHost(account.smtp_host),
    auth: { user: account.smtp_user ?? account.email, pass: await accountPassword(ctx, account) },
    connectionTimeout: 20_000,
  });
  try {
    await transport.sendMail({ from: account.email, ...mail });
  } finally {
    transport.close();
  }
}
