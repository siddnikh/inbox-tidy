import type { SenderRow, UnsubscribeMethod } from "../../shared/api.ts";
import {
  categoryLabel,
  methodBadge,
  methodIcon,
  monogram,
  monthlyRate,
  readShare,
  recommendationLabel,
} from "../format.ts";
import { Hint } from "./Feedback.tsx";
import { Icon } from "./Icon.tsx";

export function isSuggested(s: SenderRow): boolean {
  return (
    s.recommendation === "unsubscribe" && s.status === "active" && s.unsubscribeMethod !== "none"
  );
}

export function senderName(s: SenderRow): string {
  return s.displayName.trim() || s.address;
}

export function Monogram({ sender }: { sender: SenderRow }) {
  return (
    <span class="monogram" aria-hidden="true">
      {monogram(sender.displayName, sender.address)}
    </span>
  );
}

export function SenderSubtitle({ sender }: { sender: SenderRow }) {
  const category = categoryLabel(sender.category);
  return (
    <span class="row-subtitle">{category ? `${category} · ${sender.domain}` : sender.domain}</span>
  );
}

export function MethodBadge({ method }: { method: UnsubscribeMethod }) {
  return (
    <span class={`badge badge-quiet badge-method method-${method}`}>
      <Icon name={methodIcon(method)} size={12} />
      {methodBadge(method)}
    </span>
  );
}

export function SenderBadges({ sender }: { sender: SenderRow }) {
  return (
    <span class="badges">
      {isSuggested(sender) && <span class="badge badge-accent">Suggested</span>}
      {sender.status === "finish_on_web" && (
        <span class="badge badge-accent">
          <Icon name="globe" size={12} />
          Finish on their web page
        </span>
      )}
      {sender.status === "unsubscribed" && <span class="badge">Unsubscribed</span>}
      {sender.status === "kept" && <span class="badge">Kept</span>}
      <MethodBadge method={sender.unsubscribeMethod} />
    </span>
  );
}

export function SenderListRow({
  sender,
  selected,
  expanded,
  keepPending,
  confirmPending,
  onSelect,
  onExpand,
  onUnsubscribe,
  onToggleKeep,
  onTrash,
  onConfirm,
}: {
  sender: SenderRow;
  selected: boolean;
  expanded: boolean;
  keepPending: boolean;
  confirmPending: boolean;
  onSelect: (selected: boolean) => void;
  onExpand: () => void;
  onUnsubscribe: () => void;
  onToggleKeep: () => void;
  onTrash: () => void;
  onConfirm: () => void;
}) {
  const name = senderName(sender);
  const detailsId = `sender-details-${sender.id}`;
  const finishing = sender.status === "finish_on_web";
  const canUnsubscribe =
    sender.unsubscribeMethod !== "none" && sender.status !== "unsubscribed" && !finishing;
  return (
    <li class={`list-row sender-row ${selected ? "is-selected" : ""}`}>
      <div class="sender-head">
        <label class="row-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.currentTarget.checked)}
            aria-label={`Select ${name}`}
          />
        </label>
        <button
          type="button"
          class="sender-main"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onExpand}
        >
          <Monogram sender={sender} />
          <span class="row-text">
            <span class="row-title">{name}</span>
            <SenderSubtitle sender={sender} />
            <SenderBadges sender={sender} />
          </span>
          <span class="row-trailing">
            <span class="row-rate">{monthlyRate(sender.emailsPerMonth)}</span>
            <span class="row-subtitle">{readShare(sender.readPercent)}</span>
          </span>
          <Icon name="chevron" class={`disclosure ${expanded ? "is-open" : ""}`} />
        </button>
      </div>
      {expanded && (
        <div class="sender-details" id={detailsId}>
          <p class="callout">{sender.summary ?? "Inbox Tidy hasn't described this sender yet."}</p>
          <p class="callout">
            <strong>{recommendationLabel(sender.recommendation)}</strong>
            {sender.recommendation && sender.recommendationReason
              ? `. ${sender.recommendationReason}`
              : ""}
          </p>
          {sender.recentSubjects.length > 0 && (
            <div class="subjects">
              <p class="caption secondary">Recent emails</p>
              <ul class="plain-list callout">
                {sender.recentSubjects.map((subject, i) => (
                  <li key={i} class="subject">
                    {subject}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {finishing && (
            <Hint icon="globe">
              Inbox Tidy opened this sender's unsubscribe page. Once you've finished there, tick
              "I've unsubscribed" so it counts.
            </Hint>
          )}
          <div class="button-row">
            {finishing && (
              <>
                <button
                  type="button"
                  class="button button-primary"
                  onClick={onConfirm}
                  disabled={confirmPending}
                >
                  <Icon name="check" size={14} />
                  {confirmPending ? "Saving…" : "I've unsubscribed"}
                </button>
                <button type="button" class="button" onClick={onUnsubscribe}>
                  <Icon name="external" size={14} />
                  Open the page again
                </button>
              </>
            )}
            {canUnsubscribe && (
              <button type="button" class="button button-primary" onClick={onUnsubscribe}>
                <Icon name="bellOff" size={14} />
                Unsubscribe
              </button>
            )}
            <button type="button" class="button" onClick={onToggleKeep} disabled={keepPending}>
              <Icon name="pin" size={14} />
              {sender.status === "kept" ? "Stop keeping" : "Keep"}
            </button>
            <button type="button" class="button" onClick={onTrash}>
              <Icon name="trash" size={14} />
              Move old emails to Trash
            </button>
          </div>
          {sender.unsubscribeMethod === "none" && (
            <Hint icon="skip">
              This sender doesn't offer a way to unsubscribe. You can still move their emails to
              Trash.
            </Hint>
          )}
          {sender.status !== "kept" && (
            <Hint icon="pin">Keep hides this sender from suggestions.</Hint>
          )}
        </div>
      )}
    </li>
  );
}
