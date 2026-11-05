import { existsSync } from "node:fs";
import { $ } from "bun";
import pkg from "../package.json";
import { compileShell } from "./lib.ts";

const APP = "dist/Inbox Tidy.app";
const CONTENTS = `${APP}/Contents`;

console.log("Building the background core…");
await $`rm -rf dist/build ${APP}`;
await $`bun build --compile --minify --sourcemap=none src/core/main.ts --outfile dist/build/inbox-tidy-core`;

console.log("Building the window…");
await compileShell("dist/build/shell");

console.log("Assembling Inbox Tidy.app…");
await $`mkdir -p ${CONTENTS}/MacOS ${CONTENTS}/Resources`;
await $`cp dist/build/shell ${CONTENTS}/MacOS/Inbox\ Tidy`;
await $`cp dist/build/inbox-tidy-core ${CONTENTS}/Resources/Inbox\ Tidy\ Helper`;
if (existsSync("shell/AppIcon.icns"))
  await $`cp shell/AppIcon.icns ${CONTENTS}/Resources/AppIcon.icns`;
const plist = (await Bun.file("shell/Info.plist").text()).replaceAll("__VERSION__", pkg.version);
await Bun.write(`${CONTENTS}/Info.plist`, plist);

// Apple Silicon refuses to run unsigned code; an ad-hoc signature is enough for a local build.
await $`codesign --force --deep --sign - ${APP}`;
await $`codesign --verify --deep --strict ${APP}`;

const size = (await $`du -sh ${APP}`.text()).split("\t")[0];
console.log(`Built ${APP} (${size}). Install it with: bun run install-app`);
