export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Versions 2-4 are reserved slots so parallel feature work can add schema without colliding:
// 2 = mail sync, 3 = insights, 4 = actions. An empty sql string is a valid no-op migration.
export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial",
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        provider TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        imap_host TEXT NOT NULL,
        imap_port INTEGER NOT NULL,
        imap_secure INTEGER NOT NULL,
        imap_user TEXT NOT NULL,
        smtp_host TEXT,
        smtp_port INTEGER,
        smtp_secure INTEGER,
        smtp_user TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_scan_at TEXT,
        last_scan_error TEXT
      );

      CREATE TABLE mailbox_state (
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        mailbox TEXT NOT NULL,
        uid_validity INTEGER NOT NULL,
        last_uid INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (account_id, mailbox)
      );

      CREATE TABLE senders (
        id INTEGER PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        display_name TEXT,
        domain TEXT NOT NULL,
        unsubscribe_method TEXT NOT NULL DEFAULT 'none',
        unsubscribe_target TEXT,
        unsubscribe_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        category TEXT,
        summary TEXT,
        recommendation TEXT,
        recommendation_reason TEXT,
        ai_provider TEXT,
        ai_updated_at TEXT,
        kept_at TEXT
      );

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        mailbox TEXT NOT NULL,
        uid_validity INTEGER NOT NULL,
        uid INTEGER NOT NULL,
        message_id TEXT,
        sender_id INTEGER NOT NULL REFERENCES senders(id),
        subject TEXT,
        received_at TEXT NOT NULL,
        is_read INTEGER NOT NULL,
        list_unsubscribe TEXT,
        list_unsubscribe_post TEXT,
        trashed_at TEXT,
        UNIQUE (account_id, mailbox, uid_validity, uid)
      );
      CREATE INDEX messages_sender ON messages(sender_id, received_at);
      CREATE INDEX messages_account ON messages(account_id, mailbox);

      CREATE TABLE actions (
        id INTEGER PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES senders(id),
        kind TEXT NOT NULL,
        method TEXT,
        status TEXT NOT NULL,
        detail TEXT,
        emails_per_month_before REAL,
        messages_affected INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX actions_sender ON actions(sender_id, kind);
    `,
  },
  { version: 2, name: "mail-sync", sql: "" },
  {
    version: 3,
    name: "insights",
    sql: "CREATE INDEX messages_sender_stats ON messages(sender_id, received_at, trashed_at, is_read);",
  },
  { version: 4, name: "actions", sql: "" },
];
