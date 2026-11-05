import { createContext } from "./app.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { startServer } from "./server.ts";

// The native shell reads this exact stdout line to know where to point its window.
export const READY_PREFIX = "INBOX_TIDY_READY ";

async function exitWhenParentCloses(): Promise<void> {
  const reader = Bun.stdin.stream().getReader();
  while (!(await reader.read()).done) {}
  process.exit(0);
}

function main(): void {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Inbox Tidy configuration problem: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
  const ctx = createContext(config);
  const started = startServer(ctx);
  console.log(`${READY_PREFIX}${started.sessionUrl}`);
  console.error(
    `Inbox Tidy core ${ctx.version} listening on ${started.url} (data: ${config.dataDir})`,
  );

  const shutdown = () => {
    started.server.stop(true);
    ctx.db.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  // The shell holds our stdin open; if it crashes, stdin closes and the core must not linger.
  if (process.argv.includes("--parent-watch")) void exitWhenParentCloses();
}

main();
