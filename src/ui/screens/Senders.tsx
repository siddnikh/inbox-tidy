import { useEffect, useState } from "preact/hooks";
import type { SenderFilter, SenderRow, SenderSort } from "../../shared/api.ts";
import { ApiError, api } from "../api.ts";
import { scanRunning, useApp } from "../app-state.ts";
import { EmptyState, ErrorNotice, SkeletonRows } from "../components/Feedback.tsx";
import { Icon } from "../components/Icon.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { SenderListRow, senderName } from "../components/Sender.tsx";
import { plural } from "../format.ts";
import { useLoad } from "../use-load.ts";

const FILTERS: { value: SenderFilter; label: string }[] = [
  { value: "suggested", label: "Suggested" },
  { value: "all", label: "All" },
  { value: "can_unsubscribe", label: "Can unsubscribe" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "kept", label: "Kept" },
];

const SORTS: { value: SenderSort; label: string }[] = [
  { value: "most", label: "Most emails" },
  { value: "least_read", label: "Least read" },
  { value: "recent", label: "Most recent" },
];

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function EmptyForFilter({
  filter,
  query,
  onClearSearch,
  onShowFilter,
}: {
  filter: SenderFilter;
  query: string;
  onClearSearch: () => void;
  onShowFilter: (f: SenderFilter) => void;
}) {
  const app = useApp();
  if (query) {
    return (
      <EmptyState
        title={`No senders match "${query}".`}
        action={
          <button type="button" class="button" onClick={onClearSearch}>
            Clear search
          </button>
        }
      >
        Try part of their name or email address.
      </EmptyState>
    );
  }
  switch (filter) {
    case "suggested":
      return (
        <EmptyState
          title="No suggestions right now."
          action={
            <button type="button" class="button" onClick={() => onShowFilter("all")}>
              Show all senders
            </button>
          }
        >
          {scanRunning(app.scan)
            ? "Inbox Tidy is still reading your emails. Suggestions appear when the scan finishes."
            : "Inbox Tidy suggests senders you rarely open that offer a way to unsubscribe. None fit that right now."}
        </EmptyState>
      );
    case "all":
      return (
        <EmptyState
          title="No senders yet."
          action={
            <button type="button" class="button button-primary" onClick={app.openAddAccount}>
              Add an email account
            </button>
          }
        >
          {scanRunning(app.scan)
            ? "Inbox Tidy is still reading your emails. Senders appear here as soon as the scan finishes."
            : "Add an email account and Inbox Tidy lists everyone who emailed you once it has read your inbox."}
        </EmptyState>
      );
    case "can_unsubscribe":
      return (
        <EmptyState title="No senders offer a way to unsubscribe.">
          None of the emails Inbox Tidy found include an unsubscribe option. You can still move old
          emails to Trash from the All list.
        </EmptyState>
      );
    case "unsubscribed":
      return (
        <EmptyState
          title="You haven't unsubscribed from anyone yet."
          action={
            <button type="button" class="button" onClick={() => onShowFilter("suggested")}>
              Show suggestions
            </button>
          }
        >
          Senders you unsubscribe from are listed here.
        </EmptyState>
      );
    case "kept":
      return (
        <EmptyState title="You haven't kept any senders.">
          Keeping a sender hides it from suggestions. Open a sender and choose Keep.
        </EmptyState>
      );
  }
}

export function Senders() {
  const app = useApp();
  const [filter, setFilter] = useState<SenderFilter>("all");
  const [sort, setSort] = useState<SenderSort>("most");
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 250);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Map<number, SenderRow>>(new Map());
  const [keepPending, setKeepPending] = useState<Set<number>>(new Set());

  const params = new URLSearchParams({ filter, sort });
  if (query) params.set("q", query);
  const list = useLoad(
    () => api<SenderRow[]>(`/api/senders?${params.toString()}`),
    `${filter}|${sort}`,
    app.version,
    query,
  );

  const changeFilter = (next: SenderFilter) => {
    setFilter(next);
    setExpanded(null);
    setSelected(new Map());
  };

  const toggleSelect = (sender: SenderRow, on: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(sender.id, sender);
      else next.delete(sender.id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Map());

  const replaceRow = (row: SenderRow) =>
    list.setData((rows) => rows.map((r) => (r.id === row.id ? row : r)));

  const toggleKeep = async (sender: SenderRow) => {
    const keeping = sender.status !== "kept";
    setKeepPending((s) => new Set(s).add(sender.id));
    replaceRow({ ...sender, status: keeping ? "kept" : "active" });
    try {
      const updated = await api<SenderRow>(`/api/senders/${sender.id}/keep`, {
        method: keeping ? "POST" : "DELETE",
      });
      replaceRow(updated);
    } catch (e) {
      replaceRow(sender);
      const reason = e instanceof ApiError ? e.message : "Please try again.";
      app.toast(
        `Couldn't ${keeping ? "keep" : "stop keeping"} ${senderName(sender)}. ${reason}`,
        "error",
      );
    } finally {
      setKeepPending((s) => {
        const next = new Set(s);
        next.delete(sender.id);
        return next;
      });
    }
  };

  const rows = list.data;
  const selectedRows = [...selected.values()];

  return (
    <div class="stack">
      <PageHeader title="Senders" />
      <div class="toolbar">
        <Segmented options={FILTERS} value={filter} onChange={changeFilter} label="Show" />
        <div class="toolbar-end">
          <label class="search">
            <Icon name="search" class="search-icon" />
            <input
              class="input search-input"
              type="search"
              placeholder="Search senders"
              aria-label="Search senders"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
              spellcheck={false}
            />
          </label>
          <label class="select-label">
            <span class="sr-only">Sort by</span>
            <select
              class="select"
              value={sort}
              onChange={(e) => setSort(e.currentTarget.value as SenderSort)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {rows === undefined && list.loading && <SkeletonRows count={8} label="Loading senders" />}
      {rows === undefined && list.error && (
        <ErrorNotice
          title="Couldn't load your senders."
          message={list.error}
          onRetry={list.retry}
          retrying={list.loading}
        />
      )}
      {rows !== undefined && list.error && (
        <ErrorNotice
          title="Couldn't refresh this list."
          message={`${list.error} The list below may be out of date.`}
          onRetry={list.retry}
          retrying={list.loading}
        />
      )}
      {rows && rows.length === 0 && (
        <EmptyForFilter
          filter={filter}
          query={query}
          onClearSearch={() => setSearch("")}
          onShowFilter={changeFilter}
        />
      )}
      {rows && rows.length > 0 && (
        <>
          <p class="caption secondary list-count" aria-live="polite">
            {list.loading ? "Updating…" : plural(rows.length, "sender")}
          </p>
          <ul class={`list ${list.loading ? "is-refreshing" : ""}`}>
            {rows.map((s) => (
              <SenderListRow
                key={s.id}
                sender={s}
                selected={selected.has(s.id)}
                expanded={expanded === s.id}
                keepPending={keepPending.has(s.id)}
                onSelect={(on) => toggleSelect(s, on)}
                onExpand={() => setExpanded((id) => (id === s.id ? null : s.id))}
                onUnsubscribe={() => app.openUnsubscribe([s])}
                onToggleKeep={() => toggleKeep(s)}
                onTrash={() => app.openTrash([s])}
              />
            ))}
          </ul>
        </>
      )}

      {selectedRows.length > 0 && (
        <section class="bulk-bar" aria-label="Selected senders">
          <span class="callout">{plural(selectedRows.length, "sender")} selected</span>
          <div class="button-row">
            <button type="button" class="button button-plain" onClick={clearSelection}>
              Clear
            </button>
            <button
              type="button"
              class="button"
              onClick={() => app.openTrash(selectedRows, clearSelection)}
            >
              Move emails to Trash
            </button>
            <button
              type="button"
              class="button button-primary"
              onClick={() => app.openUnsubscribe(selectedRows, clearSelection)}
            >
              Unsubscribe from {selectedRows.length}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
