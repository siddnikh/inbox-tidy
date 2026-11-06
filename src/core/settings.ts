import type { Database } from "bun:sqlite";
import type { AiProviderChoice, AppSettings } from "../shared/api.ts";
import { DEFAULT_OPENROUTER_MODEL, MODEL_ID_PATTERN } from "./ai/openrouter.ts";
import type { Config } from "./config.ts";
import { HttpError } from "./http.ts";

export const AI_CHOICES: AiProviderChoice[] = ["auto", "claude", "codex", "openrouter"];

export function readSettings(db: Database, config: Config): AppSettings {
  const rows = db
    .query<{ key: string; value: string }, []>("SELECT key, value FROM settings")
    .all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return {
    aiProvider: stored.aiProvider ?? config.aiProvider,
    lookbackMonths: stored.lookbackMonths ?? config.lookbackMonths,
    openRouterModel: stored.openRouterModel ?? DEFAULT_OPENROUTER_MODEL,
  };
}

export function writeSettings(
  db: Database,
  config: Config,
  patch: Partial<AppSettings>,
): AppSettings {
  const clean: Partial<AppSettings> = {};
  if (patch.aiProvider !== undefined) {
    if (!AI_CHOICES.includes(patch.aiProvider)) {
      throw new HttpError(
        400,
        "Choose Automatic, Claude Code, Codex, or OpenRouter.",
        "aiProvider",
      );
    }
    clean.aiProvider = patch.aiProvider;
  }
  if (patch.lookbackMonths !== undefined) {
    if (
      !Number.isInteger(patch.lookbackMonths) ||
      patch.lookbackMonths < 1 ||
      patch.lookbackMonths > 120
    ) {
      throw new HttpError(400, "Choose between 1 and 120 months.", "lookbackMonths");
    }
    clean.lookbackMonths = patch.lookbackMonths;
  }
  if (patch.openRouterModel !== undefined) {
    const model = typeof patch.openRouterModel === "string" ? patch.openRouterModel.trim() : "";
    if (model.length > 200 || !MODEL_ID_PATTERN.test(model)) {
      throw new HttpError(
        400,
        "Enter the model ID the way OpenRouter shows it, like openai/gpt-6-luna.",
        "openRouterModel",
      );
    }
    clean.openRouterModel = model;
  }
  const upsert = db.query(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(clean)) upsert.run(key, JSON.stringify(value));
  })();
  return readSettings(db, config);
}
