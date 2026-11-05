import { describe, expect, test } from "bun:test";
import {
  bestUnsubscribe,
  parseMailto,
  unsubscribeOptions,
} from "../../src/core/mail/unsubscribe-header.ts";

describe("unsubscribe headers", () => {
  test("prefers one-click when the POST header is present", () => {
    const best = bestUnsubscribe(
      "<mailto:leave@news.example?subject=stop>, <https://news.example/u/123>",
      "List-Unsubscribe=One-Click",
    );
    expect(best).toEqual({ method: "one_click", target: "https://news.example/u/123" });
  });

  test("falls back to mailto, then web", () => {
    const options = unsubscribeOptions(
      "<https://shop.example/unsub>, <mailto:u@shop.example>",
      null,
    );
    expect(options.map((o) => o.method)).toEqual(["mailto", "web"]);
  });

  test("rejects plain http on the internet but allows localhost", () => {
    expect(bestUnsubscribe("<http://evil.example/u>", "List-Unsubscribe=One-Click").method).toBe(
      "none",
    );
    expect(bestUnsubscribe("<http://127.0.0.1:9999/u>", "List-Unsubscribe=One-Click").method).toBe(
      "one_click",
    );
  });

  test("handles folded headers and missing values", () => {
    expect(bestUnsubscribe("<https://a.example/\r\n x>", null)).toEqual({
      method: "web",
      target: "https://a.example/x",
    });
    expect(bestUnsubscribe(null, null)).toEqual({ method: "none", target: null });
  });

  test("parses mailto subject and body with defaults", () => {
    expect(parseMailto("mailto:list@x.example?subject=Remove%20me")).toEqual({
      to: "list@x.example",
      subject: "Remove me",
      body: "unsubscribe",
    });
    expect(parseMailto("mailto:not-an-address")).toBeNull();
  });
});
