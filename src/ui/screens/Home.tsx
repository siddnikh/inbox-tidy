import { useState } from "preact/hooks";
import type { HomeSummary, SenderRow } from "../../shared/api.ts";
import { ApiError, api } from "../api.ts";
import { scanRunning, useApp } from "../app-state.ts";
import { EmptyState, ErrorNotice, SkeletonRows } from "../components/Feedback.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { Monogram, SenderSubtitle, senderName } from "../components/Sender.tsx";
import { formatNumber, inboxOverview, monthlyRate, readShare, relativeTime } from "../format.ts";
import { useLoad } from "../use-load.ts";

function ImpactCards({ impact }: { impact: HomeSummary["impact"] }) {
  const nothingYet =
    impact.sendersUnsubscribed === 0 &&
    impact.emailsAvoidedPerMonth === 0 &&
    impact.emailsTrashed === 0;
  const cards = [
    {
      label: "Senders you've unsubscribed from",
      value: impact.sendersUnsubscribed,
      empty: "None yet",
      note: null,
    },
    {
      label: "Fewer emails a month",
      value: impact.emailsAvoidedPerMonth,
      empty: "None yet",
      note: "Expected, based on how often they emailed you",
    },
    { label: "Emails moved to Trash", value: impact.emailsTrashed, empty: "None yet", note: null },
  ];
  return (
    <section aria-label="What Inbox Tidy has done for you">
      <div class="impact-grid">
        {cards.map((c) => (
          <div class="card impact-card" key={c.label}>
            <p class="callout secondary">{c.label}</p>
            {c.value > 0 ? (
              <p class="stat">{formatNumber(c.value)}</p>
            ) : (
              <p class="stat stat-empty">{c.empty}</p>
            )}
            {c.note && c.value > 0 && <p class="caption secondary">{c.note}</p>}
          </div>
        ))}
      </div>
      {nothingYet && (
        <p class="callout secondary impact-hint">
          Nothing yet. Pick a few senders below to get started, and your progress shows up here.
        </p>
      )}
    </section>
  );
}

function ImpactSkeleton() {
  return (
    <div class="impact-grid" role="status" aria-label="Loading your progress">
      {[1, 2, 3].map((n) => (
        <div class="card impact-card" key={n}>
          <span class="skeleton skeleton-text" style={{ width: "70%" }} />
          <span class="skeleton skeleton-stat" />
        </div>
      ))}
    </div>
  );
}

function Welcome() {
  const app = useApp();
  return (
    <section class="card welcome">
      <h2 class="title">Welcome to Inbox Tidy</h2>
      <p class="body secondary">
        Inbox Tidy shows you who fills your inbox and which senders you never read. In a few clicks
        it unsubscribes you and moves their old emails to Trash.
      </p>
      <button type="button" class="button button-primary" onClick={app.openAddAccount}>
        Add an email account
      </button>
    </section>
  );
}

function Suggestions() {
  const app = useApp();
  const list = useLoad(
    () => api<SenderRow[]>("/api/senders?filter=suggested&sort=most"),
    "suggested",
    app.version,
  );
  const top = list.data?.slice(0, 5);

  return (
    <section class="section">
      <div class="section-header">
        <h2 class="title">Suggested for you</h2>
        <button type="button" class="button button-plain" onClick={() => app.navigate("senders")}>
          See all senders
        </button>
      </div>
      {top === undefined && list.loading && <SkeletonRows count={5} label="Loading suggestions" />}
      {top === undefined && list.error && (
        <ErrorNotice
          title="Couldn't load your suggestions."
          message={list.error}
          onRetry={list.retry}
          retrying={list.loading}
        />
      )}
      {top && top.length === 0 && (
        <EmptyState title="No suggestions right now.">
          {scanRunning(app.scan)
            ? "Inbox Tidy is still reading your emails. Suggestions appear when the scan finishes."
            : "When Inbox Tidy spots senders you rarely open that offer a way to unsubscribe, they show up here."}
        </EmptyState>
      )}
      {top && top.length > 0 && (
        <ul class="list">
          {top.map((s) => (
            <li key={s.id} class="list-row suggestion-row">
              <Monogram sender={s} />
              <span class="row-text">
                <span class="row-title">{senderName(s)}</span>
                <SenderSubtitle sender={s} />
              </span>
              <span class="row-trailing">
                <span class="row-rate">{monthlyRate(s.emailsPerMonth)}</span>
                <span class="row-subtitle">{readShare(s.readPercent)}</span>
              </span>
              <button
                type="button"
                class="button button-small"
                onClick={() => app.openUnsubscribe([s])}
                aria-label={`Unsubscribe from ${senderName(s)}`}
              >
                Unsubscribe
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScanFooter({ lastScanAt }: { lastScanAt: string | null }) {
  const app = useApp();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = scanRunning(app.scan);

  const scanAgain = async () => {
    setStarting(true);
    setError(null);
    try {
      await app.startScan();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Inbox Tidy couldn't start the scan. Please try again.",
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <section class="scan-footer">
      <p class="callout secondary">
        {running
          ? "Scanning your inbox now."
          : lastScanAt
            ? `Last checked your inbox ${relativeTime(lastScanAt)}.`
            : "Your inbox hasn't been checked yet."}
      </p>
      <button type="button" class="button" onClick={scanAgain} disabled={running || starting}>
        {starting ? "Starting…" : running ? "Scanning…" : "Scan again"}
      </button>
      {error && (
        <p class="callout danger" role="alert">
          Couldn't start the scan. {error}
        </p>
      )}
    </section>
  );
}

export function Home() {
  const app = useApp();
  const summary = useLoad(() => api<HomeSummary>("/api/summary"), "summary", app.version);

  if (summary.data === undefined) {
    if (summary.error) {
      return (
        <div class="stack">
          <PageHeader title="Your inbox" />
          <ErrorNotice
            title="Couldn't load your home screen."
            message={summary.error}
            onRetry={summary.retry}
            retrying={summary.loading}
          />
        </div>
      );
    }
    return (
      <div class="stack">
        <PageHeader title="Your inbox" />
        <ImpactSkeleton />
        <span class="skeleton skeleton-text" style={{ width: "80%" }} />
        <SkeletonRows count={5} label="Loading suggestions" />
      </div>
    );
  }

  const data = summary.data;
  if (data.inbox.accounts === 0) {
    return (
      <div class="stack">
        <PageHeader title="Your inbox" />
        <Welcome />
      </div>
    );
  }

  return (
    <div class="stack">
      <PageHeader title="Your inbox" />
      <ImpactCards impact={data.impact} />
      <p class="body overview">{inboxOverview(data)}</p>
      <Suggestions />
      <ScanFooter lastScanAt={data.lastScanAt} />
    </div>
  );
}
