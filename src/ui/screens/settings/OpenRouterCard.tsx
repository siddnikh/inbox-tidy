import type { TargetedSubmitEvent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { OpenRouterKeyCheck, OpenRouterStatus } from "../../../shared/api.ts";
import { ApiError, api } from "../../api.ts";
import { useApp } from "../../app-state.ts";
import { ErrorNotice, Hint, InlineError } from "../../components/Feedback.tsx";
import { Icon, IconTile } from "../../components/Icon.tsx";
import { Sheet } from "../../components/Sheet.tsx";
import { VisualSteps } from "../../components/Steps.tsx";
import { useLoad } from "../../use-load.ts";
import { HelperStatus } from "./HelperStatus.tsx";
import { ModelPicker } from "./ModelPicker.tsx";

type KeyTest =
  | { state: "idle" }
  | { state: "running" }
  | { state: "ok"; result: OpenRouterKeyCheck }
  | { state: "error"; message: string };

function messageOf(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

function LinkOut({ href, children }: { href: string; children: string }) {
  return (
    <a class="button button-link-out" href={href} target="_blank" rel="noreferrer">
      {children}
      <Icon name="external" size={14} />
    </a>
  );
}

function KeyForm({
  replacing,
  onSaved,
  onCancel,
}: {
  replacing: boolean;
  onSaved: (status: OpenRouterStatus) => void;
  onCancel?: () => void;
}) {
  const app = useApp();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replacing) input.current?.focus();
  }, [replacing]);

  const submit = async (e: TargetedSubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!key.trim()) {
      setProblem("Paste your OpenRouter key first.");
      input.current?.focus();
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      const status = await api<OpenRouterStatus>("/api/ai/openrouter/key", {
        method: "PUT",
        body: { key },
      });
      setKey("");
      setShow(false);
      app.toast("Saved your OpenRouter key", "success");
      onSaved(status);
    } catch (err) {
      setProblem(messageOf(err, "Couldn't save your key. Please try again."));
      input.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form class="key-form" onSubmit={submit} noValidate>
      <label class="field">
        <span class="field-label">
          {replacing ? "Your new OpenRouter key" : "Your OpenRouter key"}
        </span>
        <span class="password-wrap">
          <input
            ref={input}
            class="input"
            type={(show ? "text" : "password") as "text"}
            autoComplete="off"
            spellcheck={false}
            placeholder="sk-or-…"
            value={key}
            disabled={saving}
            onInput={(e) => setKey(e.currentTarget.value)}
            aria-invalid={problem ? "true" : undefined}
            aria-describedby={problem ? "key-problem" : undefined}
          />
          <button
            type="button"
            class="button button-plain reveal"
            onClick={() => setShow((v) => !v)}
            aria-pressed={show}
            aria-label={show ? "Hide key" : "Show key"}
          >
            {show ? "Hide" : "Show"}
          </button>
        </span>
        {problem ? (
          <span class="field-problem" id="key-problem" role="alert">
            <Icon name="alert" class="hint-icon" size={14} />
            <span>{problem}</span>
          </span>
        ) : (
          <Hint icon="lock">Kept in your Mac's Keychain. Inbox Tidy never shows it again.</Hint>
        )}
      </label>
      <div class="button-row">
        <button type="submit" class="button button-primary" disabled={saving}>
          {saving ? "Saving…" : "Save key"}
        </button>
        {onCancel && (
          <button type="button" class="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function RemoveKeySheet({
  onClose,
  onRemoved,
}: {
  onClose: () => void;
  onRemoved: (status: OpenRouterStatus) => void;
}) {
  const app = useApp();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const status = await api<OpenRouterStatus>("/api/ai/openrouter/key", { method: "DELETE" });
      app.toast("Removed your OpenRouter key", "success");
      onRemoved(status);
    } catch (e) {
      setRemoving(false);
      setError(messageOf(e, "Please try again."));
    }
  };

  return (
    <Sheet
      title="Remove your OpenRouter key?"
      onClose={onClose}
      busy={removing}
      footer={
        <>
          <button type="button" class="button" onClick={onClose} disabled={removing} data-autofocus>
            Cancel
          </button>
          <button type="button" class="button button-danger" onClick={remove} disabled={removing}>
            {removing ? "Removing…" : "Remove key"}
          </button>
        </>
      }
    >
      <div class="intro">
        <IconTile name="key" tone="danger" size="lg" />
        <p class="body">
          Inbox Tidy will stop using OpenRouter and delete the key from your Mac's Keychain.
        </p>
      </div>
      <Hint icon="info">
        The key still works on openrouter.ai until you delete it there. You can add it again any
        time.
      </Hint>
      {error && <ErrorNotice title="Couldn't remove your key." message={error} />}
    </Sheet>
  );
}

export function OpenRouterCard({
  model,
  savingModel,
  modelSaved,
  modelError,
  onPickModel,
  onKeyChanged,
}: {
  model: string;
  savingModel: boolean;
  modelSaved: boolean;
  modelError: string | null;
  onPickModel: (id: string) => Promise<boolean>;
  onKeyChanged: () => void;
}) {
  const status = useLoad(() => api<OpenRouterStatus>("/api/ai/openrouter"), "openrouter", 0);
  const [replacing, setReplacing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [test, setTest] = useState<KeyTest>({ state: "idle" });

  const runTest = async () => {
    setTest({ state: "running" });
    try {
      const result = await api<OpenRouterKeyCheck>("/api/ai/openrouter/key/check", {
        method: "POST",
      });
      setTest({ state: "ok", result });
    } catch (e) {
      setTest({ state: "error", message: messageOf(e, "Please try again.") });
    }
  };

  const applyStatus = (next: OpenRouterStatus, thenTest: boolean) => {
    status.setData(() => next);
    setReplacing(false);
    setTest({ state: "idle" });
    onKeyChanged();
    if (thenTest) void runTest();
  };

  const current = status.data;
  const hasKey = current?.hasKey ?? false;

  return (
    <section class="card settings-group helper-card" aria-labelledby="helper-openrouter-heading">
      <div class="setting-heading">
        <IconTile name="globe" tone="brand" />
        <span class="heading-text">
          <h2 class="headline" id="helper-openrouter-heading">
            OpenRouter
          </h2>
          <span class="caption secondary">
            Pay as you go, with no subscription. Good if you don't have Claude or ChatGPT.
          </span>
        </span>
        <HelperStatus state={current ? (hasKey ? "ready" : "needs_key") : null} />
      </div>

      <Hint icon="lock">
        With OpenRouter, the same sender details (names, addresses, how many emails they send, and
        up to five subject lines each) go to OpenRouter and to the company that runs the model you
        pick. Never the emails themselves.
      </Hint>
      <Hint icon="card">
        What you use is billed to your OpenRouter account. Each model below shows a rough cost.
      </Hint>

      {current === undefined && status.error && (
        <ErrorNotice
          title="Couldn't check your OpenRouter key."
          message={status.error}
          onRetry={status.retry}
          retrying={status.loading}
        />
      )}
      {current === undefined && !status.error && (
        <div class="key-skeleton" role="status" aria-label="Loading your OpenRouter key">
          <span class="skeleton skeleton-text" style={{ width: "50%" }} />
          <span class="skeleton skeleton-text" style={{ width: "35%" }} />
        </div>
      )}

      {current && !hasKey && (
        <>
          <p class="subheading">Add your key</p>
          <VisualSteps
            steps={[
              {
                key: "account",
                icon: "globe",
                text: "Open OpenRouter's keys page and sign in, or create a free account (button below).",
                extra: (
                  <LinkOut href="https://openrouter.ai/settings/keys">Open OpenRouter keys</LinkOut>
                ),
              },
              {
                key: "credit",
                icon: "card",
                text: "Add a few dollars of credit. Most models won't answer without it.",
                extra: (
                  <LinkOut href="https://openrouter.ai/settings/credits">
                    Open the Credits page
                  </LinkOut>
                ),
              },
              {
                key: "create",
                icon: "key",
                text: "Back on the keys page, press Create, name it Inbox Tidy, then copy the key it shows you.",
              },
              {
                key: "paste",
                icon: "clipboard",
                text: "Paste the key here and press Save key.",
              },
            ]}
          />
          <KeyForm replacing={false} onSaved={(s) => applyStatus(s, true)} />
        </>
      )}

      {current && hasKey && (
        <div class="key-saved">
          <p class="key-saved-line callout">
            <Icon name="lock" class="hint-icon success" />
            <span>
              Your key is saved in your Mac's Keychain
              {current.keyEnding ? (
                <>
                  , ending in <code class="key-ending">…{current.keyEnding}</code>
                </>
              ) : null}
              .
            </span>
          </p>
          {replacing ? (
            <KeyForm
              replacing
              onSaved={(s) => applyStatus(s, true)}
              onCancel={() => setReplacing(false)}
            />
          ) : (
            <div class="button-row">
              <button
                type="button"
                class="button"
                onClick={runTest}
                disabled={test.state === "running"}
              >
                <Icon name="check" size={14} />
                {test.state === "running" ? "Testing your key…" : "Test key"}
              </button>
              <button type="button" class="button" onClick={() => setReplacing(true)}>
                <Icon name="key" size={14} />
                Replace key
              </button>
              <button
                type="button"
                class="button button-plain danger"
                onClick={() => setRemoving(true)}
              >
                <Icon name="trash" size={14} />
                Remove key
              </button>
            </div>
          )}
          <div aria-live="polite">
            {test.state === "running" && (
              <Hint icon="clock">Checking your key with OpenRouter…</Hint>
            )}
            {test.state === "ok" && (
              <p class={`hint callout ${test.result.hasCredit ? "success" : "secondary"}`}>
                <Icon name={test.result.hasCredit ? "check" : "info"} class="hint-icon" />
                <span>
                  {test.result.message}
                  {!test.result.hasCredit && (
                    <>
                      {" "}
                      <a
                        href="https://openrouter.ai/settings/credits"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Add credit
                      </a>
                    </>
                  )}
                </span>
              </p>
            )}
            {test.state === "error" && <InlineError announce={false}>{test.message}</InlineError>}
          </div>
        </div>
      )}

      <ModelPicker
        current={model}
        saving={savingModel}
        saved={modelSaved}
        onPick={onPickModel}
        error={modelError}
      />

      {removing && (
        <RemoveKeySheet
          onClose={() => setRemoving(false)}
          onRemoved={(s) => {
            setRemoving(false);
            applyStatus(s, false);
          }}
        />
      )}
    </section>
  );
}
