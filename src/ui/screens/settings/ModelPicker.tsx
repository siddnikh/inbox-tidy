import type { TargetedSubmitEvent } from "preact";
import { useState } from "preact/hooks";
import type { OpenRouterModel, OpenRouterModelsResponse } from "../../../shared/api.ts";
import { api } from "../../api.ts";
import { ErrorNotice, Hint, InlineError } from "../../components/Feedback.tsx";
import { Icon } from "../../components/Icon.tsx";
import { modelPrice, sortCostEstimate } from "../../format.ts";
import { useLoad } from "../../use-load.ts";

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]*\/[A-Za-z0-9._~:-]+$/;

function ModelDetails({ model }: { model: OpenRouterModel }) {
  const estimate = sortCostEstimate(model);
  return (
    <span class="model-details">
      <span class="caption secondary">{model.note ?? model.id}</span>
      <span class="caption secondary">
        {modelPrice(model)}
        {estimate ? `. ${estimate}.` : "."}
      </span>
    </span>
  );
}

function ModelOption({
  model,
  checked,
  disabled,
  onPick,
}: {
  model: OpenRouterModel;
  checked: boolean;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <label class={`model-option check-option${checked ? " is-selected" : ""}`}>
      <input
        type="radio"
        name="openrouter-model"
        checked={checked}
        disabled={disabled}
        onChange={() => onPick(model.id)}
      />
      <span class="model-option-text">
        <span class="model-name">{model.name}</span>
        <ModelDetails model={model} />
      </span>
    </label>
  );
}

export function ModelPicker({
  current,
  saving,
  saved,
  onPick,
  error,
}: {
  current: string;
  saving: boolean;
  saved: boolean;
  onPick: (id: string) => Promise<boolean>;
  error: string | null;
}) {
  const models = useLoad(
    () => api<OpenRouterModelsResponse>("/api/ai/openrouter/models"),
    "openrouter-models",
    0,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customId, setCustomId] = useState("");
  const [customProblem, setCustomProblem] = useState<string | null>(null);

  const list = models.data?.models ?? [];
  const selected = list.find((m) => m.id === current);
  const words = query.trim().toLowerCase();
  const matches = words
    ? list.filter((m) => `${m.name} ${m.id}`.toLowerCase().includes(words))
    : list;
  const suggested = matches.filter((m) => m.recommended);
  const others = matches.filter((m) => !m.recommended);

  const submitCustom = async (e: TargetedSubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const id = customId.trim();
    if (!MODEL_ID.test(id)) {
      setCustomProblem("Type the model ID the way OpenRouter shows it, like openai/gpt-6-luna.");
      return;
    }
    setCustomProblem(null);
    if (await onPick(id)) setCustomId("");
  };

  const pick = (id: string) => {
    void onPick(id);
  };

  return (
    <div class="model-section">
      <div class="subheading-row">
        <p class="subheading">Model</p>
        <span class="save-status caption" aria-live="polite">
          {saving && <span class="secondary">Saving…</span>}
          {saved && (
            <span class="success">
              <Icon name="check" /> Saved
            </span>
          )}
        </span>
      </div>
      <div class="model-current">
        <span class="model-option-text">
          <span class="model-name">
            {selected?.name ?? current}
            {selected?.recommended && <span class="badge badge-accent">Suggested</span>}
          </span>
          {selected && <ModelDetails model={selected} />}
          {!selected && models.loading && (
            <span class="skeleton skeleton-text" style={{ width: "70%" }} />
          )}
          {!selected && models.data && (
            <span class="caption secondary">
              OpenRouter's list doesn't include this model right now, so its price isn't shown.
            </span>
          )}
          {!selected && models.data === undefined && models.error && !models.loading && (
            <span class="caption secondary">
              The price shows once OpenRouter's list of models loads.
            </span>
          )}
        </span>
        <button
          type="button"
          class="button"
          aria-expanded={open}
          aria-controls="model-picker"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "close" : "search"} size={14} />
          {open ? "Close the list" : "Choose a different model"}
        </button>
      </div>
      {error && <InlineError>Couldn't change the model. {error}</InlineError>}

      {open && (
        <div class="model-picker" id="model-picker">
          {models.data === undefined && models.error && (
            <ErrorNotice
              title="Couldn't load OpenRouter's models."
              message={models.error}
              onRetry={models.retry}
              retrying={models.loading}
            />
          )}
          {models.data === undefined && !models.error && (
            <div class="model-list" role="status" aria-label="Loading models">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} class="model-option skeleton-option">
                  <span class="skeleton skeleton-text" style={{ width: `${40 + n * 8}%` }} />
                  <span class="skeleton skeleton-text small" style={{ width: "60%" }} />
                </span>
              ))}
            </div>
          )}
          {models.data && (
            <>
              <label class="search model-search">
                <span class="sr-only">Search models</span>
                <Icon name="search" class="search-icon" size={14} />
                <input
                  class="input search-input"
                  type="search"
                  placeholder={`Search ${list.length} models`}
                  value={query}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  spellcheck={false}
                />
              </label>
              <div class="model-list" role="radiogroup" aria-label="OpenRouter models">
                {matches.length === 0 && (
                  <p class="hint callout secondary model-empty">
                    <Icon name="search" class="hint-icon" />
                    <span>
                      No models match “{query.trim()}”. Try another word, or type the model ID
                      below.
                    </span>
                  </p>
                )}
                {suggested.length > 0 && <p class="model-group caption secondary">Suggested</p>}
                {suggested.map((m) => (
                  <ModelOption
                    key={m.id}
                    model={m}
                    checked={m.id === current}
                    disabled={saving}
                    onPick={pick}
                  />
                ))}
                {others.length > 0 && (
                  <p class="model-group caption secondary">
                    {suggested.length > 0 ? "All other models" : "Models"}
                  </p>
                )}
                {others.map((m) => (
                  <ModelOption
                    key={m.id}
                    model={m}
                    checked={m.id === current}
                    disabled={saving}
                    onPick={pick}
                  />
                ))}
              </div>
            </>
          )}
          <Hint icon="info">
            Only models that can answer in the fixed format Inbox Tidy needs are listed. A token is
            about three quarters of a word.
          </Hint>
          <form class="field model-custom" onSubmit={submitCustom} noValidate>
            <label class="field-label" for="custom-model-id">
              Or type a model ID from openrouter.ai
            </label>
            <span class="model-custom-row">
              <input
                id="custom-model-id"
                class="input"
                type="text"
                placeholder="openai/gpt-6-luna"
                spellcheck={false}
                autoComplete="off"
                value={customId}
                onInput={(e) => setCustomId(e.currentTarget.value)}
                aria-invalid={customProblem ? "true" : undefined}
                aria-describedby={customProblem ? "custom-model-problem" : undefined}
              />
              <button type="submit" class="button" disabled={saving || !customId.trim()}>
                {saving ? "Saving…" : "Use this model"}
              </button>
            </span>
            {customProblem && (
              <span class="field-problem" id="custom-model-problem" role="alert">
                <Icon name="alert" class="hint-icon" size={14} />
                <span>{customProblem}</span>
              </span>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
