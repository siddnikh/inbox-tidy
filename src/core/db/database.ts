import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { migrations as defaultMigrations, type Migration } from "./migrations.ts";

export function openDatabase(dataDir: string | ":memory:"): Database {
  let path = ":memory:";
  if (dataDir !== ":memory:") {
    mkdirSync(dataDir, { recursive: true });
    path = join(dataDir, "inbox-tidy.sqlite");
  }
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function schemaVersion(db: Database): number {
  const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
  return row?.user_version ?? 0;
}

export function migrate(db: Database, migrations: Migration[] = defaultMigrations): void {
  const current = schemaVersion(db);
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      if (migration.sql.trim()) db.run(migration.sql);
      db.run(`PRAGMA user_version = ${migration.version}`);
    })();
  }
}
