import { $ } from "bun";

export const SHELL_SOURCE = "shell/main.m";

export type Arch = "arm64" | "x64";

export function hostArch(): Arch {
  return process.arch === "x64" ? "x64" : "arm64";
}

export async function compileShell(outFile: string, arch: Arch = hostArch()): Promise<void> {
  const clangArch = arch === "x64" ? "x86_64" : "arm64";
  await $`mkdir -p ${outFile.split("/").slice(0, -1).join("/")}`;
  await $`clang -arch ${clangArch} -fobjc-arc -O2 -mmacosx-version-min=13.0 -framework Cocoa -framework WebKit ${SHELL_SOURCE} -o ${outFile}`;
}
