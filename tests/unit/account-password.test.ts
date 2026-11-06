import { expect, test } from "bun:test";
import { createContext } from "../../src/core/app.ts";
import { loadConfig } from "../../src/core/config.ts";
import { accountPassword, getAccount } from "../../src/core/mail/connection.ts";
import type { SecretStore } from "../../src/core/secrets.ts";
import { fakeAi } from "./helpers.ts";
import { addAccount } from "./insights-fixtures.ts";

function contextWith(secrets: SecretStore) {
  return createContext(loadConfig({ INBOX_TIDY_DATA_DIR: ":memory:" }), {
    dataDir: ":memory:",
    secrets,
    ai: fakeAi(),
    openExternal: async () => {},
  });
}

const missing: SecretStore = { get: async () => null, set: async () => {}, delete: async () => {} };
const denied: SecretStore = {
  ...missing,
  get: async () => {
    throw new Error("User interaction is not allowed.");
  },
};

for (const [label, store] of [
  ["missing", missing],
  ["unreadable", denied],
] as const) {
  test(`a ${label} Keychain password explains the Keychain prompt first`, async () => {
    const ctx = contextWith(store);
    const account = getAccount(ctx, addAccount(ctx, "me@example.test"));
    const error = await accountPassword(ctx, account).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("choose Always Allow, and scan again");
  });
}
