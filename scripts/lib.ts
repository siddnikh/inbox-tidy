import { $ } from "bun";

export const SHELL_SOURCE = "shell/main.m";

export async function compileShell(outFile: string): Promise<void> {
  await $`mkdir -p ${outFile.split("/").slice(0, -1).join("/")}`;
  await $`clang -fobjc-arc -O2 -mmacosx-version-min=13.0 -framework Cocoa -framework WebKit ${SHELL_SOURCE} -o ${outFile}`;
}
