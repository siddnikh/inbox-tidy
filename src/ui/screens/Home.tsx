import { useEffect, useState } from "preact/hooks";
import type { AccountSummary, HomeSummary, SenderRow } from "../../shared/api.ts";
import { ApiError, api } from "../api.ts";
import { scanRunning, useApp } from "../app-state.ts";
import { EmptyState, ErrorNotice, InlineError, SkeletonRows } from "../components/Feedback.tsx";
import { Icon, type IconName, IconTile } from "../components/Icon.tsx";
import { SpotArt, WelcomeArt } from "../components/Illustration.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { ScanCard } from "../components/ScanBar.tsx";
import { SegmentedTabs } from "../components/Segmented.tsx";
import { Monogram, SenderSubtitle, senderName } from "../components/Sender.tsx";
import { formatNumber, inboxOverview, monthlyRate, readShare, relativeTime } from "../format.ts";
import { useConfirmUnsubscribe } from "../use-confirm-unsubscribe.ts";
import { useLoad } from "../use-load.ts";

function ImpactCards({ impact }: { impact: HomeSummary["impact"] }) {
  const nothingYet =
    impact.sendersUnsubscribed === 0 &&
    impact.emailsAvoidedPerMonth === 0 &&
    impact.emailsTrashed === 0;
  const cards: { label: string; value: number; icon: IconName; note: string | null }[] = [
    {
      label: "Senders you've unsubscribed from",
      value: impact.sendersUnsubscribed,
      icon: "bellOff",
      note: null,
    },
    {
      label: "Fewer emails a month",
      value: impact.emailsAvoidedPerMonth,
      icon: "trendDown",
      note: "Expected, based on how often they emailed you",
    },
    { label: "Emails moved to Trash", value: impact.emailsTrashed, icon: "trash", note: null },
  ];
  return (
    <section aria-label="What Inbox Tidy has done for you">
      <div class="impact-grid">
        {cards.map((c) => (
          <div class={`card impact-card ${c.value > 0 ? "has-value" : ""}`} key={c.label}>
            <div class="impact-head">
              <IconTile name={c.icon} size="sm" tone={c.value > 0 ? "accent" : "neutral"} />
              <p class="callout secondary">{c.label}</p>
            </div>
            {c.value > 0 ? (
              <p class="stat">{formatNumber(c.value)}</p>
            ) : (
              <p class="stat stat-empty">None yet</p>
            )}
            {c.note && c.value > 0 && <p class="caption secondary">{c.note}</p>}
          </div>
        ))}
      </div>
      {nothingYet && (
        <div class="impact-hint">
          <SpotArt name="sparkles" />
          <p class="callout">
            <strong>Nothing yet.</strong>{" "}
            <span class="secondary">
              Pick a few senders below to get started, and your progress shows up here.
            </span>
          </p>
        </div>
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
      <WelcomeArt />
      <div class="welcome-text">
        <h2 class="title">Welcome to Inbox Tidy</h2>
        <p class="body secondary">
          Inbox Tidy shows you who fills your inbox and which senders you never read. In a few
          clicks it unsubscribes you and moves their old emails to Trash.
        </p>
        <ol class="welcome-steps">
          <li>
            <IconTile name="plus" size="sm" />
            <span>Add your email account</span>
          </li>
          <li>
            <IconTile name="search" size="sm" />
            <span>See who emails you most</span>
          </li>
          <li>
            <IconTile name="bellOff" size="sm" />
            <span>Unsubscribe in a few clicks</span>
          </li>
        </ol>
        <button type="button" class="button button-primary" onClick={app.openAddAccount}>
          <Icon name="plus" size={14} />
          Add an email account
        </button>
      </div>
    </section>
  );
}

function FinishOnWeb({ accountId }: { accountId: number | null }) {
  const app = useApp();
  const confirming = useConfirmUnsubscribe();
  const scope = accountId === null ? "" : `&account=${accountId}`;
  const list = useLoad(
    () => api<SenderRow[]>(`/api/senders?filter=finish_on_web&sort=most${scope}`),
    `finish${scope}`,
    app.version,
  );
  const rows = list.data;
  if (!rows || rows.length === 0) return null;

  return (
    <section class="card finish-card" aria-labelledby="finish-title">
      <div class="finish-head">
        <IconTile name="globe" tone="brand" />
        <div>
          <h2 class="title" id="finish-title">
            Finish unsubscribing
          </h2>
          <p class="callout secondary">
            These senders only offer an unsubscribe web page. Inbox Tidy opened it for you, but it
            can't see what you do there. Finish on each page, then tick it here so it counts.
          </p>
        </div>
      </div>
      <ul class="list finish-list">
        {rows.map((s) => {
          const saving = confirming.pending.has(s.id);
          return (
            <li key={s.id} class="list-row finish-row">
              <label class="finish-check">
                <input
                  type="checkbox"
                  checked={saving}
                  disabled={saving}
                  onChange={() => confirming.confirm(s)}
                />
                <Monogram sender={s} />
                <span class="row-text">
                  <span class="row-title">{senderName(s)}</span>
                  <span class="row-subtitle">
                    {saving ? "Saving…" : `I've unsubscribed from ${s.domain}`}
                  </span>
                </span>
              </label>
              <span class="row-rate">{monthlyRate(s.emailsPerMonth)}</span>
              <button
                type="button"
                class="button button-small"
                onClick={() => app.openUnsubscribe([s])}
                aria-label={`Open the unsubscribe page for ${senderName(s)} again`}
              >
                <Icon name="external" size={13} />
                Open page again
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Suggestions({ accountId }: { accountId: number | null }) {
  const app = useApp();
  const scope = accountId === null ? "" : `&account=${accountId}`;
  const list = useLoad(
    () => api<SenderRow[]>(`/api/senders?filter=suggested&sort=most${scope}`),
    `suggested${scope}`,
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
        <EmptyState
          title="No suggestions right now."
          art={scanRunning(app.scan) ? "mail" : "check"}
          artTone={scanRunning(app.scan) ? "accent" : "success"}
        >
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
        <Icon name="refresh" size={14} />
        {starting ? "Starting…" : running ? "Scanning…" : "Scan again"}
      </button>
      {error && <InlineError>Couldn't start the scan. {error}</InlineError>}
    </section>
  );
}

const ACCOUNT_KEY = "inbox-tidy.home-account";
const ALL = "all";

function storedAccount(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? ALL;
  } catch {
    return ALL;
  }
}

function useHomeAccount(accounts: AccountSummary[] | undefined) {
  const [choice, setChoice] = useState(storedAccount);
  const exists = accounts?.some((a) => String(a.id) === choice) ?? false;
  const selected = choice !== ALL && exists ? Number(choice) : null;

  useEffect(() => {
    if (accounts && choice !== ALL && !exists) setChoice(ALL);
  }, [accounts, choice, exists]);

  const choose = (value: string) => {
    setChoice(value);
    try {
      localStorage.setItem(ACCOUNT_KEY, value);
    } catch {
      // Private storage can be unavailable; the choice still applies for this session.
    }
  };
  return { selected, choose };
}

function AccountPicker({
  accounts,
  selected,
  onChange,
}: {
  accounts: AccountSummary[];
  selected: number | null;
  onChange: (value: string) => void;
}) {
  if (accounts.length === 1) {
    const only = accounts[0] as AccountSummary;
    return (
      <p class="account-chip">
        <Icon name="mail" size={14} />
        {only.email}
      </p>
    );
  }
  return (
    <div class="account-tabs">
      <SegmentedTabs
        label="Show one email account"
        value={selected === null ? ALL : String(selected)}
        onChange={onChange}
        options={[
          { value: ALL, label: "All accounts" },
          ...accounts.map((a) => ({ value: String(a.id), label: a.email })),
        ]}
      />
    </div>
  );
}

export function Home() {
  const app = useApp();
  const accounts = useLoad(() => api<AccountSummary[]>("/api/accounts"), "accounts", app.version);
  const { selected, choose } = useHomeAccount(accounts.data);
  const scope = selected === null ? "" : `?account=${selected}`;
  const summary = useLoad(
    () => api<HomeSummary>(`/api/summary${scope}`),
    `summary${scope}`,
    app.version,
  );
  const running = app.scan?.state === "running" ? app.scan : null;
  const picker = accounts.data && accounts.data.length > 0 && (
    <AccountPicker accounts={accounts.data} selected={selected} onChange={choose} />
  );
  const scanCard = running && <ScanCard scan={running} trouble={app.scanTrouble} />;

  if (summary.data === undefined) {
    if (summary.error) {
      return (
        <div class="stack">
          <PageHeader title="Your inbox" />
          {picker}
          {scanCard}
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
        {picker}
        {scanCard}
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
      {picker}
      {scanCard}
      <ImpactCards impact={data.impact} />
      <p class="body overview">{inboxOverview(data)}</p>
      <FinishOnWeb accountId={selected} />
      <Suggestions accountId={selected} />
      <ScanFooter lastScanAt={data.lastScanAt} />
    </div>
  );
}
