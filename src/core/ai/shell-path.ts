import { homedir } from "node:os";
import { join } from "node:path";

const MARKER = "__INBOX_TIDY_PATH__";

let cached: Promise<string> | null = null;

// Apps opened from Finder inherit launchd's minimal PATH, which misses Homebrew, ~/.local/bin,
// and nvm-installed CLIs such as codex. Ask the user's interactive login shell for its PATH.
export function resolveSearchPath(): Promise<string> {
  cached ??= computeSearchPath();
  return cached;
}

// A CLI installed after launch may have added a directory to the login shell's PATH.
export function resetSearchPath(): void {
  cached = null;
}

async function computeSearchPath(): Promise<string> {
  const home = homedir();
  const parts = [
    await loginShellPath(),
    process.env.PATH ?? "",
    join(home, ".local", "bin"),
    join(home, ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const dir of parts.join(":").split(":")) {
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      dirs.push(dir);
    }
  }
  return dirs.join(":");
}

async function loginShellPath(): Promise<string> {
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const proc = Bun.spawn([shell, "-ilc", `printf '${MARKER}%s${MARKER}' "$PATH"`], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    const timer = setTimeout(() => proc.kill(), 5000);
    const out = await new Response(proc.stdout).text();
    clearTimeout(timer);
    const match = out.match(new RegExp(`${MARKER}(.*)${MARKER}`));
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}
