import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AccountSummary, ScanStatus, SenderRow } from "../shared/api.ts";
import { api } from "./api.ts";
import { AppContext, type AppState, type Tab, type ToastTone } from "./app-state.ts";
import { type ScanNotice, ScanProgress, ScanResultNotice } from "./components/ScanBar.tsx";
import { SegmentedTabs } from "./components/Segmented.tsx";
import { type ToastItem, Toasts } from "./components/Toasts.tsx";
import { Accounts } from "./screens/Accounts.tsx";
import { Home } from "./screens/Home.tsx";
import { Senders } from "./screens/Senders.tsx";
import { Settings } from "./screens/Settings.tsx";
import { AddAccountSheet } from "./sheets/AddAccountSheet.tsx";
import { TrashSheet } from "./sheets/TrashSheet.tsx";
import { UnsubscribeSheet } from "./sheets/UnsubscribeSheet.tsx";

const TABS: { value: Tab; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "senders", label: "Senders" },
  { value: "accounts", label: "Accounts" },
  { value: "settings", label: "Settings" },
];

function tabFromHash(): Tab {
  const hash = window.location.hash.slice(1);
  return TABS.find((t) => t.value === hash)?.value ?? "home";
}

type OpenSheet =
  | { kind: "add" }
  | { kind: "unsubscribe" | "trash"; senders: SenderRow[]; onFinished?: () => void }
  | null;

const POLL_MS = 1000;
const POLL_RETRY_MS = 2000;
// A scan the UI just asked for may not be visible on the very first poll.
const EXPECTED_SCAN_POLLS = 3;
const CLOCK_SLACK_MS = 2000;

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [scan, setScan] = useState<ScanStatus | null>(null);
  const [pollTrouble, setPollTrouble] = useState(false);
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [retryingScan, setRetryingScan] = useState(false);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const toastId = useRef(1);
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--header-height", `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((next: Tab) => {
    if (window.location.hash !== `#${next}`) window.location.hash = next;
    setTab(next);
    window.scrollTo(0, 0);
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = toastId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, tone }]);
      setTimeout(() => dismissToast(id), tone === "error" ? 6000 : 3000);
    },
    [dismissToast],
  );

  // The poller lives in refs so timers never call a stale closure.
  const scanner = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sawRunning = false;
    let expected: { since: number; polls: number } | null = null;

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(poll, ms);
    };

    const finish = (s: ScanStatus) => {
      sawRunning = false;
      expected = null;
      refresh();
      if (s.state === "failed") {
        setNotice({ failed: true, message: s.message, errors: s.errors });
        return;
      }
      toast(s.message || "Scan finished.", "success");
      setNotice(s.errors.length ? { failed: false, message: s.message, errors: s.errors } : null);
    };

    const handle = (s: ScanStatus) => {
      setScan(s);
      setPollTrouble(false);
      if (s.state === "running") {
        sawRunning = true;
        schedule(POLL_MS);
        return;
      }
      const finishedAt = s.finishedAt ? Date.parse(s.finishedAt) : Number.NaN;
      if (sawRunning || (expected && finishedAt >= expected.since)) {
        finish(s);
        return;
      }
      if (expected && expected.polls < EXPECTED_SCAN_POLLS) {
        expected.polls++;
        schedule(POLL_MS);
        return;
      }
      expected = null;
    };

    async function poll() {
      timer = null;
      try {
        handle(await api<ScanStatus>("/api/scan"));
      } catch {
        if (sawRunning || expected) {
          setPollTrouble(true);
          schedule(POLL_RETRY_MS);
        }
      }
    }

    return {
      handle,
      poll,
      expect() {
        expected = { since: Date.now() - CLOCK_SLACK_MS, polls: 0 };
      },
      stop() {
        if (timer) clearTimeout(timer);
      },
    };
  }, [refresh, toast]);

  useEffect(() => {
    scanner.poll();
    return scanner.stop;
  }, [scanner]);

  const startScan = useCallback(async () => {
    const status = await api<ScanStatus>("/api/scan", { method: "POST" });
    setNotice(null);
    scanner.expect();
    scanner.handle(status);
  }, [scanner]);

  const watchScan = useCallback(() => {
    scanner.expect();
    scanner.poll();
  }, [scanner]);

  const state: AppState = {
    version,
    refresh,
    toast,
    scan,
    scanTrouble: pollTrouble,
    startScan,
    watchScan,
    navigate,
    openAddAccount: () => setSheet({ kind: "add" }),
    openUnsubscribe: (senders, onFinished) =>
      setSheet({ kind: "unsubscribe", senders, onFinished }),
    openTrash: (senders, onFinished) => setSheet({ kind: "trash", senders, onFinished }),
  };

  const onConnected = (account: AccountSummary) => {
    setSheet(null);
    toast(`Connected ${account.email}. Reading your emails now…`, "success");
    refresh();
    watchScan();
  };

  const retryScan = async () => {
    setRetryingScan(true);
    try {
      await startScan();
    } catch {
      toast(
        "Couldn't start the scan. Check the account on the Accounts tab and try again.",
        "error",
      );
    } finally {
      setRetryingScan(false);
    }
  };

  return (
    <AppContext.Provider value={state}>
      <header class="app-header" ref={header}>
        <p class="window-title">Inbox Tidy</p>
        <nav class="tab-row">
          <SegmentedTabs
            options={TABS}
            value={tab}
            onChange={navigate}
            label="Sections"
            idPrefix="tab"
          />
        </nav>
        {scan?.state === "running" && tab !== "home" && (
          <div class="header-inner">
            <ScanProgress scan={scan} trouble={pollTrouble} />
          </div>
        )}
      </header>
      <main class="page">
        <div class="stack" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {notice && (
            <ScanResultNotice
              notice={notice}
              onDismiss={() => setNotice(null)}
              onOpenAccounts={() => {
                setNotice(null);
                navigate("accounts");
              }}
              onRetry={retryScan}
              retrying={retryingScan}
            />
          )}
          {tab === "home" && <Home />}
          {tab === "senders" && <Senders />}
          {tab === "accounts" && <Accounts />}
          {tab === "settings" && <Settings />}
        </div>
      </main>
      {sheet?.kind === "add" && (
        <AddAccountSheet onClose={() => setSheet(null)} onConnected={onConnected} />
      )}
      {sheet?.kind === "unsubscribe" && (
        <UnsubscribeSheet
          senders={sheet.senders}
          onClose={() => setSheet(null)}
          onFinished={sheet.onFinished}
        />
      )}
      {sheet?.kind === "trash" && (
        <TrashSheet
          senders={sheet.senders}
          onClose={() => setSheet(null)}
          onFinished={sheet.onFinished}
        />
      )}
      <Toasts items={toasts} onDismiss={dismissToast} />
    </AppContext.Provider>
  );
}
