import type { ScanStage, ScanStatus } from "../../shared/api.ts";
import { formatNumber, scanFraction } from "../format.ts";

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
        <p class="callout">{sentence}</p>
        {fraction !== null && <p class="caption secondary">{Math.round(fraction * 100)}%</p>}
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
        <p class="caption secondary">Couldn't check how the scan is going. Trying again…</p>
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
