import { expect, test } from "bun:test";
import { monthsSpanned } from "../../src/core/insights/rate.ts";

test("months spanned is clamped between one month and the lookback", () => {
  const now = Date.parse("2026-11-06T00:00:00Z");
  expect(monthsSpanned("2026-11-01T00:00:00Z", 12, now)).toBe(1);
  expect(monthsSpanned("2020-01-01T00:00:00Z", 12, now)).toBe(12);
  expect(monthsSpanned("2026-05-06T00:00:00Z", 12, now)).toBeCloseTo(6.01, 1);
});
