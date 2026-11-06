import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon.tsx";

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // The web view may refuse the async clipboard; the selection-based copy still works there.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy refused");
}

// A line to paste into Terminal, with a Copy button that confirms "Copied".
export function CopyCommand({ command, label }: { command: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await writeClipboard(command);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), 2500);
  };

  return (
    <span class="copy-command">
      <span class="command-well">
        <code class="command-text">{command}</code>
        <button
          type="button"
          class={`button button-small copy-button${state === "copied" ? " is-copied" : ""}`}
          onClick={copy}
          aria-label={`Copy the line to ${label}`}
        >
          <Icon name={state === "copied" ? "check" : "copy"} size={14} />
          {state === "copied" ? "Copied" : "Copy"}
        </button>
      </span>
      <span aria-live="polite" class="caption">
        {state === "copied" && <span class="sr-only">Copied</span>}
        {state === "failed" && (
          <span class="danger copy-failed">
            <Icon name="alert" size={14} class="hint-icon" />
            Couldn't copy. Select the line and press Command and C.
          </span>
        )}
      </span>
    </span>
  );
}
