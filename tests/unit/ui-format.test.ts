import { describe, expect, test } from "bun:test";
import type { HomeSummary, ScanStatus } from "../../src/shared/api.ts";
import {
  approxCount,
  formatNumber,
  inboxOverview,
  methodBadge,
  monogram,
  monthlyRate,
  plural,
  providerLabel,
  readShare,
  relativeTime,
  scanFraction,
} from "../../src/ui/format.ts";

describe("numbers", () => {
  test("groups thousands", () => {
    expect(formatNumber(9412)).toBe("9,412");
    expect(formatNumber(3.6)).toBe("4");
  });

  test("approximate counts are exact under 100 and rounded above", () => {
    expect(approxCount(0)).toBe("0");
    expect(approxCount(42)).toBe("42");
    expect(approxCount(99)).toBe("99");
    expect(approxCount(612)).toBe("about 610");
    expect(approxCount(1234)).toBe("about 1,200");
    expect(approxCount(9412)).toBe("about 9,400");
    expect(approxCount(156_789)).toBe("about 160,000");
  });

  test("plural picks the right word", () => {
    expect(plural(1, "sender")).toBe("1 sender");
    expect(plural(612, "sender")).toBe("612 senders");
    expect(plural(2, "month")).toBe("2 months");
  });
});

describe("monthly rate", () => {
  test("reads like a person would say it", () => {
    expect(monthlyRate(0.3)).toBe("less than 1 a month");
    expect(monthlyRate(1)).toBe("about 1 a month");
    expect(monthlyRate(39.6)).toBe("about 40 a month");
    expect(monthlyRate(1234)).toBe("about 1,200 a month");
  });
});

describe("read share", () => {
  test("uses tens with human wording at the extremes", () => {
    expect(readShare(0)).toBe("you never open them");
    expect(readShare(3)).toBe("you rarely open them");
    expect(readShare(7)).toBe("you open 1 in 10");
    expect(readShare(34)).toBe("you open 3 in 10");
    expect(readShare(91)).toBe("you open 9 in 10");
    expect(readShare(97)).toBe("you open almost all of them");
    expect(readShare(100)).toBe("you open all of them");
  });
});

describe("relative time", () => {
  const now = new Date(2026, 10, 6, 15, 0, 0).getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  test("recent moments", () => {
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(60_000), now)).toBe("a minute ago");
    expect(relativeTime(ago(2 * 60_000), now)).toBe("2 minutes ago");
    expect(relativeTime(ago(60 * 60_000), now)).toBe("an hour ago");
    expect(relativeTime(ago(3 * 3600_000), now)).toBe("3 hours ago");
  });

  test("days and dates", () => {
    expect(relativeTime(new Date(2026, 10, 5, 22, 0).toISOString(), now)).toBe("yesterday");
    expect(relativeTime(new Date(2026, 10, 2, 9, 0).toISOString(), now)).toBe("4 days ago");
    expect(relativeTime(new Date(2026, 9, 3, 9, 0).toISOString(), now)).toBe("on 3 October");
    expect(relativeTime(new Date(2025, 0, 9, 9, 0).toISOString(), now)).toBe("on 9 January 2025");
  });

  test("clock skew and bad input stay readable", () => {
    expect(relativeTime(new Date(now + 5000).toISOString(), now)).toBe("just now");
    expect(relativeTime("not a date", now)).toBe("at an unknown time");
  });
});

describe("labels", () => {
  test("providers and methods use plain words", () => {
    expect(providerLabel("icloud")).toBe("iCloud Mail");
    expect(providerLabel("rediffmail_pro")).toBe("Rediffmail Pro");
    expect(methodBadge("one_click")).toBe("Automatic");
    expect(methodBadge("none")).toBe("No unsubscribe link");
  });

  test("monogram takes the first letter or digit", () => {
    expect(monogram("amazon.in", "store-news@amazon.in")).toBe("A");
    expect(monogram('"Ébène" Shop', "x@y.com")).toBe("É");
    expect(monogram("", "42deals@shop.com")).toBe("4");
    expect(monogram("", "")).toBe("?");
  });
});

describe("inbox overview", () => {
  const summary: HomeSummary = {
    impact: { sendersUnsubscribed: 0, emailsAvoidedPerMonth: 0, emailsTrashed: 0 },
    inbox: {
      accounts: 2,
      totalEmails: 9412,
      emailsPerMonth: 784,
      unreadPercent: 71.4,
      senders: 612,
      canUnsubscribe: 300,
      suggested: 40,
    },
    lookbackMonths: 12,
    lastScanAt: "2026-11-06T10:00:00Z",
  };

  test("matches the home screen sentence", () => {
    expect(inboxOverview(summary)).toBe(
      "In the last 12 months you got about 9,400 emails from 612 senders. You left 71% unread.",
    );
  });

  test("handles an empty or unscanned inbox", () => {
    const empty = { ...summary, inbox: { ...summary.inbox, totalEmails: 0, senders: 0 } };
    expect(inboxOverview(empty)).toBe(
      "In the last 12 months we didn't find any emails in your inbox.",
    );
    expect(inboxOverview({ ...empty, lastScanAt: null })).toContain("first scan hasn't finished");
  });
});

describe("scan fraction", () => {
  const base: ScanStatus = {
    state: "running",
    stage: "reading",
    accountEmail: "you@gmail.com",
    processed: 1200,
    total: 4000,
    message: "",
    startedAt: null,
    finishedAt: null,
    errors: [],
  };

  test("is processed over total, clamped", () => {
    expect(scanFraction(base)).toBe(0.3);
    expect(scanFraction({ ...base, processed: 5000 })).toBe(1);
    expect(scanFraction({ ...base, total: 0 })).toBeNull();
  });
});
