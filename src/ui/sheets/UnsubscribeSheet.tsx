import { useState } from "preact/hooks";
import type { ActionResult, SenderRow } from "../../shared/api.ts";
import { useApp } from "../app-state.ts";
import { Hint } from "../components/Feedback.tsx";
import { Icon, IconTile } from "../components/Icon.tsx";
import { MethodBadge, Monogram, senderName } from "../components/Sender.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { methodPlan, plural } from "../format.ts";
import { Progress, ResultList, runPerSender } from "./results.tsx";

type Phase =
  | { name: "confirm" }
  | { name: "running"; done: number }
  | { name: "results"; results: ActionResult[] };

function resultHeadline(results: ActionResult[]): string {
  const done = results.filter((r) => r.status === "done").length;
  const opened = results.filter((r) => r.status === "opened_in_browser").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const parts: string[] = [];
  if (done) parts.push(`Unsubscribed from ${plural(done, "sender")}.`);
  if (opened)
    parts.push(
      `Opened ${plural(opened, "page", "pages")} in your browser. Press the unsubscribe button there to finish.`,
    );
  if (failed) parts.push(`${plural(failed, "sender")} didn't work. Their details are below.`);
  if (!parts.length) return "Nothing was unsubscribed.";
  return parts.join(" ");
}

export function UnsubscribeSheet({
  senders,
  onClose,
  onFinished,
}: {
  senders: SenderRow[];
  onClose: () => void;
  onFinished?: () => void;
}) {
  const app = useApp();
  const [alsoTrash, setAlsoTrash] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "confirm" });
  const actionable = senders.filter((s) => s.unsubscribeMethod !== "none");
  const skipped = senders.filter((s) => s.unsubscribeMethod === "none");
  const busy = phase.name === "running";

  const run = async () => {
    setPhase({ name: "running", done: 0 });
    const results = await runPerSender(
      actionable,
      "/api/actions/unsubscribe",
      (s) => ({ senderIds: [s.id], alsoTrash }),
      (done) => setPhase({ name: "running", done }),
    );
    const skippedResults: ActionResult[] = skipped.map((s) => ({
      senderId: s.id,
      senderName: senderName(s),
      status: "not_available",
      message: "This sender has no unsubscribe option.",
      trashed: 0,
    }));
    setPhase({ name: "results", results: [...results, ...skippedResults] });
    app.refresh();
    onFinished?.();
  };

  if (phase.name === "results") {
    return (
      <Sheet
        key="results"
        title="Unsubscribe results"
        onClose={onClose}
        wide
        footer={
          <button type="button" class="button button-primary" onClick={onClose} data-autofocus>
            Done
          </button>
        }
      >
        <p class="body" aria-live="polite">
          {resultHeadline(phase.results)}
        </p>
        <ResultList results={phase.results} />
      </Sheet>
    );
  }

  const title =
    senders.length === 1
      ? `Unsubscribe from ${senderName(senders[0] as SenderRow)}?`
      : `Unsubscribe from ${plural(senders.length, "sender")}?`;

  return (
    <Sheet
      key="confirm"
      title={title}
      onClose={onClose}
      busy={busy}
      wide
      footer={
        <>
          <button type="button" class="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            class="button button-primary"
            onClick={run}
            disabled={busy || actionable.length === 0}
          >
            {busy ? "Unsubscribing…" : "Unsubscribe"}
          </button>
        </>
      }
    >
      <p class="body secondary">Here's what will happen for each sender.</p>
      <ul class="list plan-list">
        {senders.map((s) => (
          <li key={s.id} class={`list-row ${s.unsubscribeMethod === "none" ? "is-muted" : ""}`}>
            <Monogram sender={s} />
            <span class="row-text">
              <span class="row-title">{senderName(s)}</span>
              <span class="row-subtitle">{methodPlan(s.unsubscribeMethod)}</span>
            </span>
            <MethodBadge method={s.unsubscribeMethod} />
          </li>
        ))}
      </ul>
      {actionable.length === 0 && (
        <Hint icon="skip">
          None of these senders offer a way to unsubscribe. You can still move their emails to Trash
          from the Senders tab.
        </Hint>
      )}
      <label class="check-option check-card">
        <input
          type="checkbox"
          checked={alsoTrash}
          disabled={busy || actionable.length === 0}
          onChange={(e) => setAlsoTrash(e.currentTarget.checked)}
        />
        <IconTile name="trash" size="sm" tone="neutral" />
        <span>
          Also move their emails to Trash
          <span class="caption secondary option-detail recoverable">
            <Icon name="restore" size={12} /> You can recover them from Trash
          </span>
        </span>
      </label>
      {phase.name === "running" && (
        <Progress done={phase.done} total={actionable.length} label="Unsubscribing" />
      )}
    </Sheet>
  );
}
