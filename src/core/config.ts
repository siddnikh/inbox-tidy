import { homedir } from "node:os";
import { join } from "node:path";
import type { AiProviderChoice } from "../shared/api.ts";

export interface Config {
  dataDir: string;
  port: number;
  token: string | null;
  aiProvider: AiProviderChoice;
  lookbackMonths: number;
  keychainService: string;
  dev: boolean;
}

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {}

function readInt(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be a whole number between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}

function readProvider(env: Env): AiProviderChoice {
  const raw = env.INBOX_TIDY_AI_PROVIDER ?? "auto";
  if (raw === "auto" || raw === "claude" || raw === "codex") return raw;
  throw new ConfigError(`INBOX_TIDY_AI_PROVIDER must be auto, claude, or codex, got "${raw}"`);
}

export function loadConfig(env: Env = process.env): Config {
  const dev = env.INBOX_TIDY_DEV === "1";
  return {
    dataDir:
      env.INBOX_TIDY_DATA_DIR ||
      join(homedir(), "Library", "Application Support", dev ? "Inbox Tidy Dev" : "Inbox Tidy"),
    port: readInt(env, "INBOX_TIDY_PORT", 0, 0, 65535),
    token: env.INBOX_TIDY_TOKEN || null,
    aiProvider: readProvider(env),
    lookbackMonths: readInt(env, "INBOX_TIDY_LOOKBACK_MONTHS", 12, 1, 120),
    keychainService: env.INBOX_TIDY_KEYCHAIN_SERVICE || (dev ? "Inbox Tidy Dev" : "Inbox Tidy"),
    dev,
  };
}
