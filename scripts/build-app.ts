import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { $ } from "bun";
import pkg from "../package.json";
import { type Arch, compileShell, hostArch } from "./lib.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { arch: { type: "string" }, out: { type: "string" } },
});
const arch = (values.arch ?? hostArch()) as Arch;
if (arch !== "arm64" && arch !== "x64")
  throw new Error(`Unknown --arch ${arch}; use arm64 or x64.`);
const outDir = values.out ?? "dist";
const build = `${outDir}/build`;
const APP = `${outDir}/Inbox Tidy.app`;
const CONTENTS = `${APP}/Contents`;

console.log(`Building the background core (${arch})…`);
await $`rm -rf ${build} ${APP}`;
// The baseline x64 build avoids AVX2, which older Intel Macs and Rosetta on macOS 14 lack.
const target = arch === "x64" ? "bun-darwin-x64-baseline" : "bun-darwin-arm64";
await $`bun build --compile --target=${target} --minify --sourcemap=none src/core/main.ts --outfile ${build}/inbox-tidy-core`;

console.log(`Building the window (${arch})…`);
await compileShell(`${build}/shell`, arch);

console.log("Assembling Inbox Tidy.app…");
await $`mkdir -p ${CONTENTS}/MacOS ${CONTENTS}/Resources`;
await $`cp ${build}/shell ${CONTENTS}/MacOS/Inbox\ Tidy`;
await $`cp ${build}/inbox-tidy-core ${CONTENTS}/Resources/Inbox\ Tidy\ Helper`;
if (existsSync("shell/AppIcon.icns"))
  await $`cp shell/AppIcon.icns ${CONTENTS}/Resources/AppIcon.icns`;
const plist = (await Bun.file("shell/Info.plist").text()).replaceAll("__VERSION__", pkg.version);
await Bun.write(`${CONTENTS}/Info.plist`, plist);

// Apple Silicon refuses to run unsigned code; an ad-hoc signature is enough without a
// Developer ID, though downloaded copies then need the one-time "Open Anyway" step.
await $`codesign --force --deep --sign - ${APP}`;
await $`codesign --verify --deep --strict ${APP}`;

const size = (await $`du -sh ${APP}`.text()).split("\t")[0];
console.log(`Built ${APP} (${arch}, ${size}). Install it with: bun run install-app`);
