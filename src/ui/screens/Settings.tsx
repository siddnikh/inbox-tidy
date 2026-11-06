import { useEffect, useRef, useState } from "preact/hooks";
import type {
  AiCheckResponse,
  AiProviderChoice,
  AppSettings,
  HealthResponse,
} from "../../shared/api.ts";
import { ApiError, api } from "../api.ts";
import { useApp } from "../app-state.ts";
import { ErrorNotice, Hint, InlineError } from "../components/Feedback.tsx";
import { Icon, IconTile } from "../components/Icon.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { useLoad } from "../use-load.ts";

const AI_CHOICES: { value: AiProviderChoice; label: string; detail: string }[] = [
  { value: "auto", label: "Automatic", detail: "Tries Claude first, then Codex" },
  { value: "claude", label: "Claude only", detail: "Uses your Claude subscription" },
  { value: "codex", label: "Codex only", detail: "Uses your ChatGPT subscription through Codex" },
];

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
): [SaveState, (patch: Partial<AppSettings>) => Promise<void>] {
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
    if (!before) return;
    if (timer.current) clearTimeout(timer.current);
    settings.setData((current) => ({ ...current, ...patch }));
    setStatus({ state: "saving" });
    try {
      const saved = await api<AppSettings>("/api/settings", { method: "PUT", body: patch });
      settings.setData(() => saved);
      setStatus({ state: "saved" });
      timer.current = setTimeout(() => setStatus({ state: "idle" }), 2500);
    } catch (e) {
      settings.setData(() => before);
      setStatus({
        state: "error",
        message: e instanceof ApiError ? e.message : "Please try again.",
      });
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
              {check.data.label} answered in {(check.data.durationMs / 1000).toFixed(1)} seconds.
              It's ready to sort your senders.
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

export function Settings() {
  const app = useApp();
  const settings = useLoad(() => api<AppSettings>("/api/settings"), "settings", app.version);
  const health = useLoad(() => api<HealthResponse>("/api/health"), "health", app.version);
  const [aiStatus, saveAi] = useSaver(settings);
  const [lookbackStatus, saveLookback] = useSaver(settings);
  const current = settings.data;

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
        {[1, 2].map((n) => (
          <div class="card settings-group" key={n}>
            <span class="skeleton skeleton-text" style={{ width: "30%" }} />
            <span class="skeleton skeleton-text" style={{ width: "60%" }} />
            <span class="skeleton skeleton-text" style={{ width: "50%" }} />
          </div>
        ))}
      </div>
    );
  }

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
          Inbox Tidy uses an AI helper on your Mac to sort senders and suggest which ones to
          unsubscribe from.
        </p>
        <Hint icon="lock">
          It only sees sender names and subject lines, never the emails themselves.
        </Hint>
        <div class="radio-list">
          {AI_CHOICES.map((choice) => (
            <label class="check-option" key={choice.value}>
              <input
                type="radio"
                name="ai-provider"
                checked={current.aiProvider === choice.value}
                onChange={() => saveAi({ aiProvider: choice.value })}
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
        <div class="availability">
          {health.data === undefined && health.loading && (
            <span class="skeleton skeleton-text" style={{ width: "45%" }} />
          )}
          {health.data === undefined && health.error && (
            <InlineError announce={false}>
              Couldn't check which AI helpers are installed. {health.error}{" "}
              <button type="button" class="button button-plain inline" onClick={health.retry}>
                Try again
              </button>
            </InlineError>
          )}
          {health.data && (
            <ul class="plain-list callout availability-list">
              {health.data.ai.providers.map((p) => (
                <li key={p.id} class="hint">
                  <Icon
                    name={p.available ? "check" : "skip"}
                    class={`hint-icon ${p.available ? "success" : "secondary"}`}
                  />
                  <span>
                    {p.label}:{" "}
                    <span class={p.available ? "success" : "secondary"}>
                      {p.available ? "installed" : "not found on this Mac"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <AiCheck />
      </section>

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
