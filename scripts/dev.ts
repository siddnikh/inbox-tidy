import { compileShell } from "./lib.ts";

const PORT = process.env.INBOX_TIDY_PORT || "4477";
const token = crypto.randomUUID();
const env = {
  ...process.env,
  INBOX_TIDY_DEV: "1",
  INBOX_TIDY_PORT: PORT,
  INBOX_TIDY_TOKEN: token,
  INBOX_TIDY_DATA_DIR: process.env.INBOX_TIDY_DATA_DIR || ".local/dev-data",
};

await compileShell("dist/dev/shell");

const core = Bun.spawn(["bun", "--watch", "src/core/main.ts"], {
  env,
  stdout: "inherit",
  stderr: "inherit",
});
const sessionUrl = `http://127.0.0.1:${PORT}/session?t=${token}`;

for (let attempt = 0; attempt < 50; attempt++) {
  const ok = await fetch(`http://127.0.0.1:${PORT}/`).then(
    (r) => r.ok,
    () => false,
  );
  if (ok) break;
  await Bun.sleep(200);
}

const shell = Bun.spawn(["dist/dev/shell"], {
  env: { ...env, INBOX_TIDY_DEV_URL: sessionUrl },
  stdout: "inherit",
  stderr: "inherit",
});
console.log(`Inbox Tidy dev window open. Browser URL (same session): ${sessionUrl}`);

const stop = () => {
  shell.kill();
  core.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await shell.exited;
core.kill();
