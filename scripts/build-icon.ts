import { $ } from "bun";

const RENDERER = "dist/build/render-svg";
const ICONSET = "dist/build/AppIcon.iconset";
const FULL = "shell/icon/AppIcon.svg";
const SMALL = "shell/icon/AppIcon-small.svg";

// The 16 and 32 px slots use a simplified drawing, because the full icon blurs at those sizes.
const slots: [name: string, px: number, source: string][] = [
  ["icon_16x16", 16, SMALL],
  ["icon_16x16@2x", 32, SMALL],
  ["icon_32x32", 32, SMALL],
  ["icon_32x32@2x", 64, FULL],
  ["icon_128x128", 128, FULL],
  ["icon_128x128@2x", 256, FULL],
  ["icon_256x256", 256, FULL],
  ["icon_256x256@2x", 512, FULL],
  ["icon_512x512", 512, FULL],
  ["icon_512x512@2x", 1024, FULL],
];

console.log("Building the icon renderer…");
await $`mkdir -p dist/build`;
await $`clang -fobjc-arc -O2 -framework Cocoa scripts/render-svg.m -o ${RENDERER}`;

console.log("Rendering icon sizes…");
await $`rm -rf ${ICONSET} && mkdir -p ${ICONSET}`;
for (const [name, px, source] of slots) {
  await $`${RENDERER} ${source} ${ICONSET}/${name}.png ${px}`;
}

await $`iconutil -c icns ${ICONSET} -o shell/AppIcon.icns`;
console.log("Wrote shell/AppIcon.icns");
