import { useState } from "preact/hooks";
import type { ActionResult, SenderRow } from "../../shared/api.ts";
import { useApp } from "../app-state.ts";
import { senderName } from "../components/Sender.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { plural } from "../format.ts";
import { Progress, ResultList, runPerSender } from "./results.tsx";

type Phase =
  | { name: "confirm" }
  | { name: "running"; done: number }
  | { name: "results"; results: ActionResult[] };

export function TrashSheet({
  senders,
  onClose,
  onFinished,
}: {
  senders: SenderRow[];
  onClose: () => void;
  onFinished?: () => void;
}) {
  const app = useApp();
  const [olderOnly, setOlderOnly] = useState(false);
  const [onlyRead, setOnlyRead] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "confirm" });
  const busy = phase.name === "running";

  const count = senders.reduce(
    (sum, s) => sum + (onlyRead ? Math.max(0, s.emailsTotal - s.unreadCount) : s.emailsTotal),
    0,
  );
  const nothingToMove = count === 0;
  const who =
    senders.length === 1 ? senderName(senders[0] as SenderRow) : plural(senders.length, "sender");

  const run = async () => {
    setPhase({ name: "running", done: 0 });
    const results = await runPerSender(
      senders,
      "/api/actions/trash",
      (s) => ({ senderIds: [s.id], olderThanDays: olderOnly ? 30 : 0, onlyRead }),
      (done) => setPhase({ name: "running", done }),
    );
    setPhase({ name: "results", results });
    app.refresh();
    onFinished?.();
  };

  if (phase.name === "results") {
    const moved = phase.results.reduce((sum, r) => sum + r.trashed, 0);
    const done = () => {
      if (moved > 0) app.toast(`Moved ${plural(moved, "email")} to Trash.`, "success");
      onClose();
    };
    return (
      <Sheet
        key="results"
        title={moved > 0 ? "Moved to Trash" : "Nothing was moved"}
        onClose={done}
        wide
        footer={
          <button type="button" class="button button-primary" onClick={done} data-autofocus>
            Done
          </button>
        }
      >
        <p class="body">
          {moved > 0
            ? `Moved ${plural(moved, "email")} to Trash. You can recover them from your email's Trash folder.`
            : "No emails were moved."}
        </p>
        <ResultList results={phase.results} showTrashed={false} />
      </Sheet>
    );
  }

  const estimate = olderOnly
    ? `Up to ${plural(count, "email")} from ${who} will move to Trash.`
    : `${plural(count, "email")} from ${who} will move to Trash.`;

  return (
    <Sheet
      key="confirm"
      title={`Move emails from ${who} to Trash?`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" class="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            class="button button-danger"
            onClick={run}
            disabled={busy || nothingToMove}
          >
            {busy ? "Moving to Trash…" : "Move to Trash"}
          </button>
        </>
      }
    >
      <fieldset class="options" disabled={busy}>
        <legend class="sr-only">Which emails</legend>
        <label class="check-option">
          <input
            type="radio"
            name="trash-age"
            checked={!olderOnly}
            onChange={() => setOlderOnly(false)}
          />
          <span>All of their emails</span>
        </label>
        <label class="check-option">
          <input
            type="radio"
            name="trash-age"
            checked={olderOnly}
            onChange={() => setOlderOnly(true)}
          />
          <span>Only emails older than 30 days</span>
        </label>
        <label class="switch-option">
          <span>Only emails I've already read</span>
          <input
            type="checkbox"
            role="switch"
            class="switch"
            aria-checked={onlyRead}
            checked={onlyRead}
            onChange={(e) => setOnlyRead(e.currentTarget.checked)}
          />
        </label>
      </fieldset>
      <p class="body">
        {nothingToMove ? "None of their emails match, so nothing would move." : estimate}
      </p>
      <p class="callout secondary">
        They go to your email provider's Trash folder, so you can recover them from there. Nothing
        is deleted for good.
      </p>
      {phase.name === "running" && (
        <Progress done={phase.done} total={senders.length} label="Moving emails from sender" />
      )}
    </Sheet>
  );
}
