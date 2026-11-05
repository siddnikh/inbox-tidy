import type { Database } from "bun:sqlite";
import type { AppSettings } from "../shared/api.ts";
import type { Config } from "./config.ts";
import { HttpError } from "./http.ts";

export function readSettings(db: Database, config: Config): AppSettings {
  const rows = db
    .query<{ key: string; value: string }, []>("SELECT key, value FROM settings")
    .all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return {
    aiProvider: stored.aiProvider ?? config.aiProvider,
    lookbackMonths: stored.lookbackMonths ?? config.lookbackMonths,
  };
}

export function writeSettings(
  db: Database,
  config: Config,
  patch: Partial<AppSettings>,
): AppSettings {
  if (patch.aiProvider !== undefined && !["auto", "claude", "codex"].includes(patch.aiProvider)) {
    throw new HttpError(400, "Choose Automatic, Claude, or Codex.", "aiProvider");
  }
  if (
    patch.lookbackMonths !== undefined &&
    (!Number.isInteger(patch.lookbackMonths) ||
      patch.lookbackMonths < 1 ||
      patch.lookbackMonths > 120)
  ) {
    throw new HttpError(400, "Choose between 1 and 120 months.", "lookbackMonths");
  }
  const upsert = db.query(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) upsert.run(key, JSON.stringify(value));
    }
  })();
  return readSettings(db, config);
}
