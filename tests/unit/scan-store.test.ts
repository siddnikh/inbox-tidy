import { describe, expect, test } from "bun:test";
import type { FetchMessageObject } from "imapflow";
import { decodeEncodedWords, parseHeaderBlock } from "../../src/core/mail/headers.ts";
import {
  lookbackStart,
  type ScannedMessage,
  storeMessages,
  toScannedMessage,
  uidRanges,
} from "../../src/core/mail/scanner.ts";
import { testContext } from "./helpers.ts";

describe("header parsing", () => {
  test("unfolds continuation lines and lowercases names", () => {
    const headers = parseHeaderBlock(
      Buffer.from(
        "List-Unsubscribe: <https://shop.example/u?x=1>,\r\n <mailto:u@shop.example>\r\nLIST-UNSUBSCRIBE-POST: List-Unsubscribe=One-Click\r\n\r\n",
      ),
    );
    expect(headers.get("list-unsubscribe")).toBe(
      "<https://shop.example/u?x=1>, <mailto:u@shop.example>",
    );
    expect(headers.get("list-unsubscribe-post")).toBe("List-Unsubscribe=One-Click");
    expect(parseHeaderBlock(undefined).size).toBe(0);
    expect(parseHeaderBlock(Buffer.from("")).size).toBe(0);
  });

  test("decodes RFC 2047 encoded words", () => {
    expect(decodeEncodedWords("=?UTF-8?B?w4lsaXNl?=")).toBe("Élise");
    expect(decodeEncodedWords("=?utf-8?Q?Caf=C3=A9_sale?= today")).toBe("Café sale today");
    expect(decodeEncodedWords("=?UTF-8?Q?a?= =?UTF-8?Q?b?=")).toBe("ab");
    expect(decodeEncodedWords("=?ISO-8859-1?Q?M=FCller?=")).toBe("Müller");
    expect(decodeEncodedWords("=?x-unknown?Q?abc?=")).toBe("=?x-unknown?Q?abc?=");
    expect(decodeEncodedWords("plain text")).toBe("plain text");
  });
});

describe("scan helpers", () => {
  test("uidRanges compacts runs", () => {
    expect(uidRanges([9, 1, 2, 3, 7, 10])).toBe("1:3,7,9:10");
    expect(uidRanges([5])).toBe("5");
    expect(uidRanges([])).toBe("");
  });

  test("lookbackStart goes back whole months", () => {
    expect(lookbackStart(12, new Date("2026-11-06T12:00:00Z")).toISOString()).toBe(
      "2025-11-06T12:00:00.000Z",
    );
  });

  test("toScannedMessage skips messages without a sender and prefers the internal date", () => {
    const base: FetchMessageObject = {
      seq: 1,
      uid: 4,
      flags: new Set(["\\Seen"]),
      internalDate: new Date("2026-10-02T08:00:00Z"),
      envelope: {
        date: new Date("2026-10-01T08:00:00Z"),
        subject: "  Big   sale ",
        messageId: "<m1@shop.example>",
        from: [{ name: "=?UTF-8?B?w4lsaXNl?=", address: "News@Shop.Example" }],
      },
      headers: Buffer.from("List-Unsubscribe: <https://shop.example/u>\r\n"),
    };
    expect(toScannedMessage(base)).toEqual({
      uid: 4,
      messageId: "<m1@shop.example>",
      fromAddress: "news@shop.example",
      fromName: "Élise",
      subject: "Big sale",
      receivedAt: "2026-10-02T08:00:00.000Z",
      isRead: true,
      listUnsubscribe: "<https://shop.example/u>",
      listUnsubscribePost: null,
    });
    const noDate = toScannedMessage({ ...base, internalDate: undefined, flags: new Set() });
    expect(noDate?.receivedAt).toBe("2026-10-01T08:00:00.000Z");
    expect(noDate?.isRead).toBe(false);
    expect(toScannedMessage({ ...base, envelope: { subject: "no sender" } })).toBeNull();
    expect(toScannedMessage({ ...base, envelope: { from: [{ name: "Ghost" }] } })).toBeNull();
  });
});

describe("storeMessages", () => {
  function message(uid: number, overrides: Partial<ScannedMessage> = {}): ScannedMessage {
    return {
      uid,
      messageId: `<${uid}@shop.example>`,
      fromAddress: "news@shop.example",
      fromName: "Shop",
      subject: `Deal ${uid}`,
      receivedAt: `2026-10-${String(uid).padStart(2, "0")}T00:00:00.000Z`,
      isRead: false,
      listUnsubscribe: null,
      listUnsubscribePost: null,
      ...overrides,
    };
  }

  test("the newest message decides the sender's name and unsubscribe option", () => {
    const ctx = testContext();
    const account = ctx.db
      .query<{ id: number }, []>(
        "INSERT INTO accounts (provider, email, imap_host, imap_port, imap_secure, imap_user) VALUES ('other', 'me@example.com', '127.0.0.1', 3143, 0, 'me@example.com') RETURNING id",
      )
      .get() as { id: number };

    storeMessages(ctx.db, account.id, "INBOX", 7, [
      message(20, {
        fromName: "Shop Weekly",
        listUnsubscribe: "<https://shop.example/u>",
        listUnsubscribePost: "List-Unsubscribe=One-Click",
      }),
    ]);
    // An older batch arriving later must not overwrite newer data.
    const inserted = storeMessages(ctx.db, account.id, "INBOX", 7, [
      message(3, { fromName: "Old Shop", listUnsubscribe: "<mailto:u@shop.example>" }),
      message(25, { fromName: null }),
      message(20),
    ]);
    expect(inserted).toBe(2);

    const sender = ctx.db.query("SELECT * FROM senders").get() as Record<string, unknown>;
    expect(sender).toMatchObject({
      address: "news@shop.example",
      domain: "shop.example",
      display_name: "Shop Weekly",
      unsubscribe_method: "one_click",
      unsubscribe_target: "https://shop.example/u",
      unsubscribe_account_id: account.id,
    });

    storeMessages(ctx.db, account.id, "INBOX", 7, [
      message(28, {
        fromName: "Shop Daily",
        listUnsubscribe: "<mailto:u@shop.example?subject=stop>",
      }),
    ]);
    expect(
      ctx.db
        .query("SELECT display_name, unsubscribe_method, unsubscribe_target FROM senders")
        .get(),
    ).toEqual({
      display_name: "Shop Daily",
      unsubscribe_method: "mailto",
      unsubscribe_target: "mailto:u@shop.example?subject=stop",
    });
    const rows = ctx.db
      .query<{ uid: number; list_unsubscribe: string | null }, []>(
        "SELECT uid, list_unsubscribe FROM messages ORDER BY uid",
      )
      .all();
    expect(rows.map((r) => r.uid)).toEqual([3, 20, 25, 28]);
    expect(rows[0]?.list_unsubscribe).toBe("<mailto:u@shop.example>");
    ctx.db.close();
  });
});
