import type { ScanStage, ScanStatus } from "../../shared/api.ts";
import { formatNumber, scanFraction } from "../format.ts";
import { Icon, type IconName, IconTile } from "./Icon.tsx";

export interface ScanNotice {
  failed: boolean;
  message: string;
  errors: ScanStatus["errors"];
}

const STAGE_FALLBACK: Record<ScanStage, string> = {
  connecting: "Connecting to your email…",
  reading: "Reading your emails…",
  understanding: "Sorting your senders…",
  done: "Finishing up…",
};

const STAGES: { stage: Exclude<ScanStage, "done">; label: string; icon: IconName }[] = [
  { stage: "connecting", label: "Connect", icon: "plug" },
  { stage: "reading", label: "Read", icon: "mail" },
  { stage: "understanding", label: "Sort", icon: "sparkles" },
];

function stageIndex(stage: ScanStage | null): number {
  if (stage === "done") return STAGES.length;
  return Math.max(
    0,
    STAGES.findIndex((s) => s.stage === stage),
  );
}

function StageSteps({ stage }: { stage: ScanStage | null }) {
  const current = stageIndex(stage);
  return (
    <ol class="stage-steps" aria-label="Scan steps">
      {STAGES.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "next";
        return (
          <li
            key={s.stage}
            class={`stage-step stage-${state}`}
            aria-current={state === "active" ? "step" : undefined}
          >
            <Icon name={state === "done" ? "check" : s.icon} size={13} />
            <span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function stageSentence(scan: ScanStatus): string {
  if (scan.message) return scan.message;
  const base = scan.stage ? STAGE_FALLBACK[scan.stage] : "Getting ready to scan…";
  if (scan.total > 0)
    return `${base} ${formatNumber(scan.processed)} of ${formatNumber(scan.total)}`;
  return base;
}

export function ScanProgress({ scan, trouble }: { scan: ScanStatus; trouble: boolean }) {
  const fraction = scanFraction(scan);
  const sentence = stageSentence(scan);
  return (
    <section class="scan-bar" aria-label="Scan progress">
      <div class="scan-bar-text">
        <p class="callout scan-sentence">{sentence}</p>
        <StageSteps stage={scan.stage} />
        {fraction !== null && (
          <p class="caption secondary scan-percent">{Math.round(fraction * 100)}%</p>
        )}
      </div>
      <div
        class={`progress ${fraction === null ? "progress-indeterminate" : ""}`}
        role="progressbar"
        aria-label={sentence}
        aria-valuemin={0}
        aria-valuemax={scan.total > 0 ? scan.total : undefined}
        aria-valuenow={fraction === null ? undefined : scan.processed}
      >
        <div
          class="progress-fill"
          style={fraction === null ? undefined : { width: `${fraction * 100}%` }}
        />
      </div>
      <p class="sr-only" aria-live="polite">
        {scan.stage ? STAGE_FALLBACK[scan.stage] : ""}
      </p>
      {trouble && (
        <p class="hint caption secondary">
          <Icon name="clock" class="hint-icon" size={14} />
          <span>Couldn't check how the scan is going. Trying again…</span>
        </p>
      )}
    </section>
  );
}

export function ScanResultNotice({
  notice,
  onDismiss,
  onOpenAccounts,
  onRetry,
  retrying,
}: {
  notice: ScanNotice;
  onDismiss: () => void;
  onOpenAccounts: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const heading = notice.failed
    ? "The scan didn't finish."
    : `The scan finished, but ${notice.errors.length === 1 ? "one account" : `${notice.errors.length} accounts`} couldn't be read.`;
  return (
    <section class="notice notice-error scan-notice" role="alert">
      <Icon name="alert" class="notice-icon" size={20} />
      <div class="notice-text">
        <p class="headline">{heading}</p>
        {notice.failed && notice.message && <p class="callout">{notice.message}</p>}
        {notice.errors.length > 0 && (
          <ul class="plain-list callout">
            {notice.errors.map((e) => (
              <li key={e.accountEmail}>
                <strong>{e.accountEmail}:</strong> {e.message}
              </li>
            ))}
          </ul>
        )}
        <p class="callout">Check the account on the Accounts tab, then scan again.</p>
      </div>
      <div class="notice-actions">
        <button type="button" class="button" onClick={onOpenAccounts}>
          Open Accounts
        </button>
        {notice.failed && (
          <button type="button" class="button" onClick={onRetry} disabled={retrying}>
            {retrying ? "Starting…" : "Scan again"}
          </button>
        )}
        <button type="button" class="button button-plain" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}

const STAGE_TITLE: Record<ScanStage, string> = {
  connecting: "Connecting to your email",
  reading: "Reading your emails",
  understanding: "Sorting your senders",
  done: "Finishing up",
};

const STAGE_ICON: Record<ScanStage, IconName> = {
  connecting: "plug",
  reading: "mail",
  understanding: "sparkles",
  done: "check",
};

export function ScanCard({ scan, trouble }: { scan: ScanStatus; trouble: boolean }) {
  const fraction = scanFraction(scan);
  const sentence = stageSentence(scan);
  const stage = scan.stage ?? "connecting";
  return (
    <section class="card scan-card" aria-label="Scan progress">
      <div class="scan-card-head">
        <span class="scan-card-icon">
          <IconTile name={STAGE_ICON[stage]} tone="brand" size="lg" />
        </span>
        <div class="scan-card-title">
          <h2 class="title">{scan.stage ? STAGE_TITLE[scan.stage] : "Getting ready to scan"}</h2>
          {scan.accountEmail && <p class="callout secondary">{scan.accountEmail}</p>}
        </div>
        <p class="scan-card-percent" aria-hidden="true">
          {fraction === null ? "" : `${Math.round(fraction * 100)}%`}
        </p>
      </div>
      <div
        class={`progress progress-large ${fraction === null ? "progress-indeterminate" : ""}`}
        role="progressbar"
        aria-label={sentence}
        aria-valuemin={0}
        aria-valuemax={scan.total > 0 ? scan.total : undefined}
        aria-valuenow={fraction === null ? undefined : scan.processed}
      >
        <div
          class="progress-fill"
          style={fraction === null ? undefined : { width: `${fraction * 100}%` }}
        />
      </div>
      <div class="scan-card-foot">
        <p class="body scan-sentence">{sentence}</p>
        <StageSteps stage={scan.stage} />
      </div>
      <p class="hint caption secondary">
        <Icon name="info" class="hint-icon" size={14} />
        <span>
          You can keep using Inbox Tidy while this runs. The numbers below update when it finishes.
        </span>
      </p>
      {trouble && (
        <p class="hint caption secondary">
          <Icon name="clock" class="hint-icon" size={14} />
          <span>Couldn't check how the scan is going. Trying again…</span>
        </p>
      )}
    </section>
  );
}
