import { ImapFlow } from "imapflow";
import type { AddAccountRequest } from "../../src/shared/api.ts";

export const GREENMAIL = {
  imap: { host: "127.0.0.1", port: 3143, secure: false },
  smtp: { host: "127.0.0.1", port: 3025, secure: false },
  rest: "http://127.0.0.1:8080",
};

export interface MailUser {
  email: string;
  password: string;
}

export async function createUser(prefix: string): Promise<MailUser> {
  const email = `${prefix}-${crypto.randomUUID()}@inbox-tidy.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const res = await fetch(`${GREENMAIL.rest}/api/user`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, login: email, password }),
  });
  if (!res.ok) throw new Error(`GreenMail user creation failed: ${res.status} ${await res.text()}`);
  return { email, password };
}

export async function greenmailChecksPasswords(): Promise<boolean> {
  const res = await fetch(`${GREENMAIL.rest}/api/configuration`);
  const config = (await res.json()) as { authenticationDisabled?: boolean };
  return config.authenticationDisabled === false;
}

export function accountRequest(user: MailUser, password = user.password): AddAccountRequest {
  return {
    provider: "other",
    email: user.email,
    password,
    imap: GREENMAIL.imap,
    smtp: GREENMAIL.smtp,
  };
}

export interface SeedMessage {
  from?: string;
  subject: string;
  date: Date;
  seen?: boolean;
  headers?: Record<string, string>;
}

function rawMessage(to: string, m: SeedMessage): string {
  const lines = [
    ...(m.from ? [`From: ${m.from}`] : []),
    `To: ${to}`,
    `Subject: ${m.subject}`,
    `Date: ${m.date.toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@inbox-tidy.test>`,
    ...Object.entries(m.headers ?? {}).map(([k, v]) => `${k}: ${v}`),
    "Content-Type: text/plain; charset=utf-8",
  ];
  return `${lines.join("\r\n")}\r\n\r\nHello.\r\n`;
}

export async function withMailbox<T>(
  user: MailUser,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    ...GREENMAIL.imap,
    auth: { user: user.email, pass: user.password },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function seed(user: MailUser, messages: SeedMessage[]): Promise<number[]> {
  return withMailbox(user, async (client) => {
    const uids: number[] = [];
    for (const m of messages) {
      const res = await client.append(
        "INBOX",
        rawMessage(user.email, m),
        m.seen ? ["\\Seen"] : [],
        m.date,
      );
      if (!res || res.uid === undefined) throw new Error("Append failed");
      uids.push(res.uid);
    }
    return uids;
  });
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// A local IMAP server that refuses every login, the way real providers answer a wrong password.
export function rejectingImapServer(): { port: number; stop(): void } {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        socket.write("* OK [CAPABILITY IMAP4rev1] Test server ready\r\n");
      },
      data(socket, data) {
        for (const line of data.toString().split("\r\n")) {
          const [tag, command] = line.split(" ");
          if (!tag || !command) continue;
          const cmd = command.toUpperCase();
          if (cmd === "CAPABILITY") {
            socket.write(`* CAPABILITY IMAP4rev1\r\n${tag} OK Done\r\n`);
          } else if (cmd === "LOGIN" || cmd === "AUTHENTICATE") {
            socket.write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)\r\n`);
          } else if (cmd === "LOGOUT") {
            socket.write(`* BYE Logging out\r\n${tag} OK Done\r\n`);
            socket.end();
          } else {
            socket.write(`${tag} BAD Unknown command\r\n`);
          }
        }
      },
    },
  });
  return { port: server.port, stop: () => server.stop(true) };
}
