import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig } from "../../src/core/config.ts";

describe("loadConfig", () => {
  test("uses safe defaults", () => {
    const config = loadConfig({});
    expect(config.port).toBe(0);
    expect(config.aiProvider).toBe("auto");
    expect(config.lookbackMonths).toBe(12);
    expect(config.dataDir).toEndWith("Library/Application Support/Inbox Tidy");
    expect(config.keychainService).toBe("Inbox Tidy");
  });

  test("dev mode keeps data and secrets apart from the installed app", () => {
    const config = loadConfig({ INBOX_TIDY_DEV: "1" });
    expect(config.dataDir).toEndWith("Inbox Tidy Dev");
    expect(config.keychainService).toBe("Inbox Tidy Dev");
  });

  test("rejects invalid values with a readable message", () => {
    expect(() => loadConfig({ INBOX_TIDY_PORT: "abc" })).toThrow(ConfigError);
    expect(() => loadConfig({ INBOX_TIDY_AI_PROVIDER: "gpt" })).toThrow(/auto, claude, or codex/);
    expect(() => loadConfig({ INBOX_TIDY_LOOKBACK_MONTHS: "0" })).toThrow(ConfigError);
  });
});
