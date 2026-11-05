import type { ActionResult, ActionsResponse, SenderRow } from "../../shared/api.ts";
import { ApiError, api } from "../api.ts";
import { Icon, type IconName } from "../components/Icon.tsx";
import { senderName } from "../components/Sender.tsx";
import { actionStatusLabel, plural } from "../format.ts";

const STATUS_ICONS: Record<ActionResult["status"], IconName> = {
  done: "check",
  opened_in_browser: "external",
  failed: "alert",
  not_available: "skip",
};

// One request per sender, in order, so progress is real and one failure doesn't hide the rest.
export async function runPerSender(
  senders: SenderRow[],
  path: string,
  body: (sender: SenderRow) => unknown,
  onProgress: (done: number) => void,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const [index, sender] of senders.entries()) {
    try {
      const res = await api<ActionsResponse>(path, { method: "POST", body: body(sender) });
      results.push(...res.results);
    } catch (e) {
      results.push({
        senderId: sender.id,
        senderName: senderName(sender),
        status: "failed",
        message:
          e instanceof ApiError
            ? e.message
            : "Inbox Tidy didn't finish this one. Please try again.",
        trashed: 0,
      });
    }
    onProgress(index + 1);
  }
  return results;
}

export function ResultList({
  results,
  showTrashed = true,
}: {
  results: ActionResult[];
  showTrashed?: boolean;
}) {
  return (
    <ul class="list result-list">
      {results.map((r, i) => (
        <li key={`${r.senderId}-${i}`} class="list-row result-row">
          <span class={`result-icon result-${r.status}`}>
            <Icon name={STATUS_ICONS[r.status]} />
          </span>
          <span class="row-text">
            <span class="row-title">{r.senderName}</span>
            <span class="row-subtitle">
              <strong class={`result-label result-${r.status}`}>
                {actionStatusLabel(r.status)}.
              </strong>{" "}
              {r.message}
              {showTrashed && r.trashed > 0 && ` ${plural(r.trashed, "email")} moved to Trash.`}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <div class="sheet-progress">
      <p class="callout">
        {label} {Math.min(done + 1, total)} of {total}…
      </p>
      <div
        class="progress"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div class="progress-fill" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
      </div>
    </div>
  );
}
