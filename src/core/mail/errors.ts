import type { MailProviderId } from "../../shared/api.ts";
import { HttpError } from "../http.ts";
import { presetFor } from "./presets.ts";

export type MailErrorKind = "auth" | "imap_disabled" | "unreachable" | "tls" | "inbox" | "other";

interface ErrorLike {
  code?: unknown;
  authenticationFailed?: unknown;
  serverResponseCode?: unknown;
  responseText?: unknown;
  tlsFailed?: unknown;
  mailboxMissing?: unknown;
  message?: unknown;
  _err?: unknown;
}

const UNREACHABLE_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "EPIPE",
  "CONNECT_TIMEOUT",
  "GREETING_TIMEOUT",
  "UPGRADE_TIMEOUT",
  "ETIMEOUT",
  "NoConnection",
  "EConnectionClosed",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function classifyMailError(error: unknown): MailErrorKind {
  if (!error || typeof error !== "object") return "other";
  const err = error as ErrorLike;
  const inner = (err._err && typeof err._err === "object" ? err._err : {}) as ErrorLike;
  const code = text(err.code) || text(inner.code);
  const response = `${text(err.responseText)} ${text(err.message)}`;
  if (/not enabled for IMAP|IMAP (access )?(is )?disabled/i.test(response)) return "imap_disabled";
  if (
    err.authenticationFailed === true ||
    /AUTHENTICATIONFAILED|AUTHORIZATIONFAILED/i.test(text(err.serverResponseCode)) ||
    /invalid credentials|application-specific password|authentication failed|login failed/i.test(
      response,
    )
  ) {
    return "auth";
  }
  if (
    err.tlsFailed === true ||
    /^(CERT_|ERR_SSL|ERR_TLS|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_VERIFY)/.test(code) ||
    code === "ClosedAfterConnectTLS"
  ) {
    return "tls";
  }
  if (UNREACHABLE_CODES.has(code)) return "unreachable";
  if (err.mailboxMissing === true) return "inbox";
  return "other";
}

const AUTH_HINTS: Record<MailProviderId, string> = {
  gmail: "Make sure you pasted an app password, not your normal password.",
  icloud: "Make sure you pasted an app-specific password, not your Apple Account password.",
  yahoo: "Make sure you pasted an app password, not your normal password.",
  rediffmail_pro:
    "Check the address and password, and ask your administrator to make sure IMAP access is turned on.",
  other: "Check the address and password. If your provider offers app passwords, use one.",
};

export type MailErrorStage = "connect" | "scan";

// Turns an IMAP failure into a sentence for a non-technical person.
export function plainMailError(
  error: unknown,
  provider: MailProviderId,
  host: string,
  stage: MailErrorStage,
): { kind: MailErrorKind; message: string } {
  const kind = classifyMailError(error);
  const label = provider === "other" ? null : (presetFor(provider)?.label ?? null);
  const who = label ?? "Your email provider";
  const where = label ?? host;
  switch (kind) {
    case "auth":
      return {
        kind,
        message:
          stage === "connect"
            ? `${who} didn't accept that password. ${AUTH_HINTS[provider]}`
            : `${who} didn't accept the saved password. Remove this account and add it again with a new app password.`,
      };
    case "imap_disabled":
      return {
        kind,
        message:
          provider === "gmail"
            ? "IMAP is turned off for this Gmail account. In Gmail settings, open Forwarding and POP/IMAP, turn on IMAP, then try again."
            : `${who} has IMAP turned off for this account. Turn on IMAP access in its settings, then try again.`,
      };
    case "unreachable":
      return {
        kind,
        message:
          provider === "other"
            ? `Couldn't reach ${host}. Check the server name and port, and your internet connection, then try again.`
            : `Couldn't reach ${where}. Check your internet connection and try again.`,
      };
    case "tls":
      return {
        kind,
        message: `Couldn't make a secure connection to ${where}. Check the server settings and try again.`,
      };
    case "inbox":
      return { kind, message: `Inbox Tidy couldn't open the inbox at ${where}.` };
    default:
      if (error instanceof HttpError) return { kind, message: error.message };
      return {
        kind,
        message: `Something went wrong while talking to ${where}. Please try again in a few minutes.`,
      };
  }
}

// Only the fields that help diagnose a failure; never the auth options, which hold the password.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const e = error as Error & Record<string, unknown>;
  const parts = [`${e.name}: ${e.message}`];
  for (const key of ["code", "serverResponseCode", "responseText", "responseStatus", "command"]) {
    if (typeof e[key] === "string" && e[key]) parts.push(`${key}=${e[key]}`);
  }
  return parts.join(" ");
}
