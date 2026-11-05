import pkg from "../../package.json";
import type { AppSettings } from "../shared/api.ts";
import { type AiClient, cliAiClient } from "./ai/cli.ts";
import type { Config } from "./config.ts";
import type { AppContext } from "./context.ts";
import { openDatabase } from "./db/database.ts";
import { keychainStore, type SecretStore } from "./secrets.ts";
import { readSettings, writeSettings } from "./settings.ts";

export interface ContextOverrides {
  secrets?: SecretStore;
  ai?: AiClient;
  openExternal?: (url: string) => Promise<void>;
  dataDir?: string | ":memory:";
}

async function openInBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Refusing to open a non-web link: ${parsed.protocol}`);
  }
  const proc = Bun.spawn(["/usr/bin/open", parsed.toString()], {
    stdout: "ignore",
    stderr: "pipe",
  });
  if ((await proc.exited) !== 0) throw new Error("macOS could not open the browser");
}

export function createContext(config: Config, overrides: ContextOverrides = {}): AppContext {
  const db = openDatabase(overrides.dataDir ?? config.dataDir);
  let current: AppSettings = readSettings(db, config);
  return {
    config,
    db,
    secrets: overrides.secrets ?? keychainStore(config.keychainService),
    ai: overrides.ai ?? cliAiClient(() => current.aiProvider),
    version: pkg.version,
    settings: () => current,
    updateSettings(patch) {
      current = writeSettings(db, config, patch);
      return current;
    },
    openExternal: overrides.openExternal ?? openInBrowser,
  };
}
