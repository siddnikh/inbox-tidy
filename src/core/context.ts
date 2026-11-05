import type { Database } from "bun:sqlite";
import type { AppSettings } from "../shared/api.ts";
import type { AiClient } from "./ai/cli.ts";
import type { Config } from "./config.ts";
import type { SecretStore } from "./secrets.ts";

export interface AppContext {
  config: Config;
  db: Database;
  secrets: SecretStore;
  ai: AiClient;
  version: string;
  settings(): AppSettings;
  updateSettings(patch: Partial<AppSettings>): AppSettings;
  // Opens a web page in the user's default browser.
  openExternal(url: string): Promise<void>;
}
