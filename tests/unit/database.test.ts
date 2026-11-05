import { expect, test } from "bun:test";
import { migrate, openDatabase, schemaVersion } from "../../src/core/db/database.ts";
import { migrations } from "../../src/core/db/migrations.ts";

test("migrations run once and reach the latest version", () => {
  const db = openDatabase(":memory:");
  const latest = Math.max(...migrations.map((m) => m.version));
  expect(schemaVersion(db)).toBe(latest);
  migrate(db);
  expect(schemaVersion(db)).toBe(latest);
  const tables = db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((t) => t.name);
  expect(tables).toEqual(
    expect.arrayContaining(["accounts", "messages", "senders", "actions", "settings"]),
  );
  db.close();
});
