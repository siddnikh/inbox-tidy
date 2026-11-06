import { Database } from "bun:sqlite";
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

test("a database marked version 4 while 2 and 3 were placeholders is repaired", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(
    db,
    migrations.filter((m) => m.version === 1),
  );
  db.run("PRAGMA user_version = 4");

  migrate(db);

  const columns = db
    .query<{ name: string }, []>("SELECT name FROM pragma_table_info('senders')")
    .all()
    .map((c) => c.name);
  expect(columns).toEqual(expect.arrayContaining(["display_name_at", "unsubscribe_at"]));
  const index = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'messages_sender_stats'",
    )
    .get();
  expect(index?.name).toBe("messages_sender_stats");
  db.close();
});
