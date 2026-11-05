import { existsSync } from "node:fs";
import { $ } from "bun";

const SOURCE = "dist/Inbox Tidy.app";
const TARGET = "/Applications/Inbox Tidy.app";
const BUNDLE_ID = "com.siddnikh.inboxtidy";

if (!existsSync(SOURCE)) {
  console.error("No build found. Run `bun run build` first.");
  process.exit(1);
}
if (existsSync(TARGET)) {
  const id = (
    await $`/usr/bin/defaults read ${`${TARGET}/Contents/Info`} CFBundleIdentifier`.nothrow().text()
  ).trim();
  if (id !== BUNDLE_ID) {
    console.error(`${TARGET} exists but is not Inbox Tidy (${id || "unknown"}); leaving it alone.`);
    process.exit(1);
  }
  await $`osascript -e 'tell application id "${BUNDLE_ID}" to quit'`.nothrow().quiet();
  await $`rm -rf ${TARGET}`;
}
await $`ditto ${SOURCE} ${TARGET}`;
console.log(`Installed ${TARGET}. Open it from Launchpad, Spotlight, or the Applications folder.`);
