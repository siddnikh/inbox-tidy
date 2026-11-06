import { $ } from "bun";
import pkg from "../package.json";
import { type Arch, hostArch } from "./lib.ts";

const ARCHES: { arch: Arch; label: string }[] = [
  { arch: "arm64", label: "Apple-Silicon" },
  { arch: "x64", label: "Intel" },
];
const RELEASE = "dist/release";

await $`rm -rf ${RELEASE}`;
await $`mkdir -p ${RELEASE}`;
const files: string[] = [];
for (const { arch, label } of ARCHES) {
  const out = `${RELEASE}/${arch}`;
  await $`bun scripts/build-app.ts --arch ${arch} --out ${out}`;
  const binaryArch = (
    await $`lipo -archs ${out}/Inbox\ Tidy.app/Contents/Resources/Inbox\ Tidy\ Helper`.text()
  ).trim();
  const expected = arch === "x64" ? "x86_64" : "arm64";
  if (binaryArch !== expected)
    throw new Error(`The ${arch} helper is ${binaryArch}, not ${expected}.`);
  // Rosetta on macOS 14 can't run Bun's x64 runtime, so other-chip builds are checked in CI.
  if (arch === hostArch()) await $`bun scripts/smoke-test-app.ts ${out}/Inbox\ Tidy.app`;
  const zip = `${RELEASE}/Inbox-Tidy-${pkg.version}-macOS-${label}.zip`;
  await $`ditto -c -k --sequesterRsrc --keepParent ${out}/Inbox\ Tidy.app ${zip}`;
  files.push(zip);
}

const sums = await $`shasum -a 256 ${files}`.cwd(".").text();
await Bun.write(`${RELEASE}/SHA256SUMS.txt`, sums.replaceAll(`${RELEASE}/`, ""));
for (const f of [...files, `${RELEASE}/SHA256SUMS.txt`]) {
  const size = (await $`du -h ${f}`.text()).split("\t")[0];
  console.log(`${f} (${size})`);
}
console.log(
  `Publish with: gh release create v${pkg.version} ${files.join(" ")} ${RELEASE}/SHA256SUMS.txt`,
);
