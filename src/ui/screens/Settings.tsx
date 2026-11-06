import { useEffect, useRef, useState } from "preact/hooks";
import type {
  AiCheckResponse,
  AiHelperState,
  AiHelpersResponse,
  AiProviderChoice,
  AiProviderId,
  AppSettings,
  HealthResponse,
} from "../../shared/api.ts";
import { ApiError, api } from "../api.ts";
import { useApp } from "../app-state.ts";
import { ErrorNotice, Hint, InlineError } from "../components/Feedback.tsx";
import { Icon, IconTile } from "../components/Icon.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { useLoad } from "../use-load.ts";
import { CliHelperCard } from "./settings/CliHelperCard.tsx";
import { OpenRouterCard } from "./settings/OpenRouterCard.tsx";

const AI_CHOICES: { value: AiProviderChoice; label: string; detail: string }[] = [
  {
    value: "auto",
    label: "Automatic",
    detail: "Tries Claude Code, then Codex, then OpenRouter if you've saved a key",
  },
  { value: "claude", label: "Claude Code only", detail: "Uses your Claude subscription" },
  { value: "codex", label: "Codex only", detail: "Uses your ChatGPT subscription" },
  { value: "openrouter", label: "OpenRouter only", detail: "Pay as you go with your own key" },
];

const LABELS: Record<AiProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  openrouter: "OpenRouter",
};

const LOOKBACKS = [3, 6, 12, 24];

type SaveState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; message: string };

function SaveStatus({ status }: { status: SaveState }) {
  return (
    <span class="save-status caption" aria-live="polite">
      {status.state === "saving" && <span class="secondary">Saving…</span>}
      {status.state === "saved" && (
        <span class="success">
          <Icon name="check" /> Saved
        </span>
      )}
    </span>
  );
}

function useSaver(
  settings: ReturnType<typeof useLoad<AppSettings>>,
): [SaveState, (patch: Partial<AppSettings>) => Promise<boolean>] {
  const [status, setStatus] = useState<SaveState>({ state: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const save = async (patch: Partial<AppSettings>) => {
    const before = settings.data;
    if (!before) return false;
    if (timer.current) clearTimeout(timer.current);
    settings.setData((current) => ({ ...current, ...patch }));
    setStatus({ state: "saving" });
    try {
      const saved = await api<AppSettings>("/api/settings", { method: "PUT", body: patch });
      settings.setData(() => saved);
      setStatus({ state: "saved" });
      timer.current = setTimeout(() => setStatus({ state: "idle" }), 2500);
      return true;
    } catch (e) {
      settings.setData(() => before);
      setStatus({
        state: "error",
        message: e instanceof ApiError ? e.message : "Please try again.",
      });
      return false;
    }
  };
  return [status, save];
}

function AiCheck() {
  const [check, setCheck] = useState<
    | { state: "idle" }
    | { state: "running" }
    | { state: "ok"; data: AiCheckResponse }
    | { state: "error"; message: string }
  >({ state: "idle" });

  const run = async () => {
    setCheck({ state: "running" });
    try {
      const data = await api<AiCheckResponse>("/api/ai/check", { method: "POST" });
      setCheck({ state: "ok", data });
    } catch (e) {
      setCheck({
        state: "error",
        message: e instanceof ApiError ? e.message : "Please try again.",
      });
    }
  };

  return (
    <div class="setting-action">
      <button type="button" class="button" onClick={run} disabled={check.state === "running"}>
        <Icon name="sparkles" size={14} />
        {check.state === "running" ? "Checking… this can take a moment" : "Test the AI helper"}
      </button>
      <div aria-live="polite">
        {check.state === "ok" && (
          <p class="hint callout success">
            <Icon name="check" class="hint-icon" />
            <span>
              {check.data.label}
              {check.data.model ? ` (${check.data.model})` : ""} answered in{" "}
              {(check.data.durationMs / 1000).toFixed(1)} seconds. It's ready to sort your senders.
            </span>
          </p>
        )}
        {check.state === "error" && (
          <InlineError announce={false}>The AI helper didn't answer. {check.message}</InlineError>
        )}
      </div>
    </div>
  );
}

function InUse({
  helpers,
  checking,
  note,
  onCheckAgain,
}: {
  helpers: ReturnType<typeof useLoad<AiHelpersResponse>>;
  checking: boolean;
  note: { tone: "success" | "info" | "error"; text: string } | null;
  onCheckAgain: () => void;
}) {
  const data = helpers.data;
  return (
    <div class="in-use">
      {data === undefined && helpers.loading && (
        <div class="in-use-row" role="status" aria-label="Checking your AI helpers">
          <span class="skeleton skeleton-circle small" />
          <span class="skeleton skeleton-text" style={{ width: "45%" }} />
        </div>
      )}
      {data === undefined && helpers.error && (
        <InlineError announce={false}>
          Couldn't check which AI helpers are ready. {helpers.error}{" "}
          <button type="button" class="button button-plain inline" onClick={helpers.retry}>
            Try again
          </button>
        </InlineError>
      )}
      {data && (
        <div class="in-use-row">
          {data.inUse ? (
            <>
              <IconTile name="check" tone="success" size="sm" />
              <span class="callout">
                Using <strong>{LABELS[data.inUse]}</strong> now.
              </span>
            </>
          ) : (
            <>
              <IconTile name="info" tone="neutral" size="sm" />
              <span class="callout secondary">
                No AI helper is ready yet, so senders are sorted with simple rules. Set one up
                below.
              </span>
            </>
          )}
          <button
            type="button"
            class="button button-plain button-small in-use-check"
            onClick={onCheckAgain}
            disabled={checking}
          >
            <Icon name="refresh" size={14} />
            {checking ? "Checking…" : "Check again"}
          </button>
        </div>
      )}
      <div aria-live="polite">
        {note?.tone === "error" && <InlineError announce={false}>{note.text}</InlineError>}
        {note && note.tone !== "error" && (
          <Hint
            icon={note.tone === "success" ? "check" : "info"}
            tone={note.tone === "success" ? "success" : undefined}
          >
            {note.text}
          </Hint>
        )}
      </div>
    </div>
  );
}

export function Settings() {
  const app = useApp();
  const settings = useLoad(() => api<AppSettings>("/api/settings"), "settings", app.version);
  const health = useLoad(() => api<HealthResponse>("/api/health"), "health", app.version);
  const [helpersVersion, setHelpersVersion] = useState(0);
  const helpers = useLoad(
    () => api<AiHelpersResponse>("/api/ai/helpers"),
    "ai-helpers",
    app.version + helpersVersion,
  );
  const [aiStatus, saveAi] = useSaver(settings);
  const [modelStatus, saveModel] = useSaver(settings);
  const [lookbackStatus, saveLookback] = useSaver(settings);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<{
    tone: "success" | "info" | "error";
    text: string;
  } | null>(null);
  const current = settings.data;

  const checkAgain = async () => {
    setChecking(true);
    setCheckNote(null);
    const before = new Map(helpers.data?.helpers.map((h) => [h.id, h.state]) ?? []);
    try {
      const fresh = await api<AiHelpersResponse>("/api/ai/helpers?refresh=1");
      if (helpers.data) helpers.setData(() => fresh);
      else helpers.retry();
      const nowReady = fresh.helpers.filter(
        (h) => h.state === "ready" && before.get(h.id) !== "ready",
      );
      if (nowReady.length > 0) {
        const names = nowReady.map((h) => LABELS[h.id]).join(" and ");
        app.toast(`${names} ${nowReady.length > 1 ? "are" : "is"} ready`, "success");
      } else {
        setCheckNote({
          tone: "info",
          text: "Nothing has changed yet. Finish the steps for a helper, then check again.",
        });
      }
    } catch (e) {
      setCheckNote({
        tone: "error",
        text: `Couldn't check again. ${e instanceof ApiError ? e.message : "Please try again."}`,
      });
    } finally {
      setChecking(false);
    }
  };

  if (current === undefined) {
    if (settings.error) {
      return (
        <div class="stack">
          <PageHeader title="Settings" />
          <ErrorNotice
            title="Couldn't load your settings."
            message={settings.error}
            onRetry={settings.retry}
            retrying={settings.loading}
          />
        </div>
      );
    }
    return (
      <div class="stack" role="status" aria-label="Loading settings">
        <PageHeader title="Settings" />
        {[1, 2, 3].map((n) => (
          <div class="card settings-group" key={n}>
            <span class="skeleton skeleton-text" style={{ width: "30%" }} />
            <span class="skeleton skeleton-text" style={{ width: "60%" }} />
            <span class="skeleton skeleton-text" style={{ width: "50%" }} />
          </div>
        ))}
      </div>
    );
  }

  const stateOf = (id: AiProviderId): AiHelperState | null =>
    helpers.data?.helpers.find((h) => h.id === id)?.state ?? null;
  const needsSetup = (id: AiProviderId) =>
    stateOf(id) === "not_installed" || stateOf(id) === "signed_out";
  const firstToSetUp = (["claude", "codex"] as const).find(needsSetup);
  const startOpen = (id: "claude" | "codex") =>
    needsSetup(id) &&
    (current.aiProvider === id || (helpers.data?.inUse === null && firstToSetUp === id));

  return (
    <div class="stack">
      <PageHeader title="Settings" />
      <section class="card settings-group" aria-labelledby="ai-heading">
        <div class="setting-heading">
          <IconTile name="sparkles" tone="brand" />
          <h2 class="headline" id="ai-heading">
            AI helper
          </h2>
          <SaveStatus status={aiStatus} />
        </div>
        <p class="callout secondary">
          An AI helper sorts your senders and suggests which ones to unsubscribe from. Use your
          Claude or ChatGPT subscription through Claude Code or Codex, or pay as you go with
          OpenRouter.
        </p>
        <Hint icon="lock">
          It only sees sender names, addresses, how many emails they send, and up to five subject
          lines each. Never the emails themselves.
        </Hint>
        <p class="subheading">Which helper to use</p>
        <div class="radio-list">
          {AI_CHOICES.map((choice) => (
            <label class="check-option" key={choice.value}>
              <input
                type="radio"
                name="ai-provider"
                checked={current.aiProvider === choice.value}
                onChange={async () => {
                  setCheckNote(null);
                  if (await saveAi({ aiProvider: choice.value })) setHelpersVersion((n) => n + 1);
                }}
              />
              <span>
                {choice.label}
                <span class="caption secondary option-detail">{choice.detail}</span>
              </span>
            </label>
          ))}
        </div>
        {aiStatus.state === "error" && (
          <InlineError>Couldn't save your AI helper choice. {aiStatus.message}</InlineError>
        )}
        <InUse helpers={helpers} checking={checking} note={checkNote} onCheckAgain={checkAgain} />
        <AiCheck />
      </section>

      <CliHelperCard
        id="claude"
        state={stateOf("claude")}
        startOpen={startOpen("claude")}
        checking={checking}
        onCheckAgain={checkAgain}
      />
      <CliHelperCard
        id="codex"
        state={stateOf("codex")}
        startOpen={startOpen("codex")}
        checking={checking}
        onCheckAgain={checkAgain}
      />
      <OpenRouterCard
        model={current.openRouterModel}
        savingModel={modelStatus.state === "saving"}
        modelSaved={modelStatus.state === "saved"}
        modelError={modelStatus.state === "error" ? modelStatus.message : null}
        onPickModel={(id) => saveModel({ openRouterModel: id })}
        onKeyChanged={() => setHelpersVersion((n) => n + 1)}
      />

      <section class="card settings-group" aria-labelledby="lookback-heading">
        <div class="setting-heading">
          <IconTile name="calendar" tone="brand" />
          <h2 class="headline" id="lookback-heading">
            How far back to look
          </h2>
          <SaveStatus status={lookbackStatus} />
        </div>
        <label class="select-label">
          <span class="sr-only">How far back to look</span>
          <select
            class="select"
            value={String(current.lookbackMonths)}
            onChange={(e) => saveLookback({ lookbackMonths: Number(e.currentTarget.value) })}
          >
            {LOOKBACKS.map((m) => (
              <option key={m} value={String(m)}>
                {m} months
              </option>
            ))}
          </select>
        </label>
        <Hint icon="clock">The next scan reads emails from this far back.</Hint>
        {lookbackStatus.state === "error" && (
          <InlineError>Couldn't save how far back to look. {lookbackStatus.message}</InlineError>
        )}
      </section>

      <p class="caption secondary about">
        {health.data ? `Inbox Tidy ${health.data.version}` : "Inbox Tidy"}
      </p>
    </div>
  );
}
