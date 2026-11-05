import type { UnsubscribeMethod } from "../../shared/api.ts";
import { isLocalHost } from "./presets.ts";

export interface UnsubscribeOption {
  method: Exclude<UnsubscribeMethod, "none">;
  target: string;
}

export interface MailtoTarget {
  to: string;
  subject: string;
  body: string;
}

function webUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return url;
    if (url.protocol === "http:" && isLocalHost(url.hostname)) return url;
    return null;
  } catch {
    return null;
  }
}

// RFC 2369 List-Unsubscribe entries, best option first: one-click (RFC 8058), mailto, web page.
export function unsubscribeOptions(
  listUnsubscribe: string | null | undefined,
  listUnsubscribePost: string | null | undefined,
): UnsubscribeOption[] {
  if (!listUnsubscribe) return [];
  const entries = [...listUnsubscribe.matchAll(/<\s*([^>]+?)\s*>/g)].map((m) =>
    (m[1] ?? "").replace(/\s+/g, ""),
  );
  const oneClick = /list-unsubscribe\s*=\s*one-click/i.test(listUnsubscribePost ?? "");
  const options: UnsubscribeOption[] = [];
  const webs = entries.map(webUrl).filter((u): u is URL => u !== null);
  if (oneClick && webs[0]) options.push({ method: "one_click", target: webs[0].toString() });
  for (const entry of entries) {
    if (/^mailto:/i.test(entry) && parseMailto(entry))
      options.push({ method: "mailto", target: entry });
  }
  for (const url of webs) options.push({ method: "web", target: url.toString() });
  return options;
}

export function bestUnsubscribe(
  listUnsubscribe: string | null | undefined,
  listUnsubscribePost: string | null | undefined,
): { method: UnsubscribeMethod; target: string | null } {
  const [best] = unsubscribeOptions(listUnsubscribe, listUnsubscribePost);
  return best ? { method: best.method, target: best.target } : { method: "none", target: null };
}

export function parseMailto(raw: string): MailtoTarget | null {
  const match = raw.match(/^mailto:([^?]*)(?:\?(.*))?$/i);
  if (!match) return null;
  const to = decodeURIComponent(match[1] ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(to)) return null;
  const params = new URLSearchParams(match[2] ?? "");
  return {
    to,
    subject: params.get("subject")?.trim() || "unsubscribe",
    body: params.get("body")?.trim() || "unsubscribe",
  };
}
