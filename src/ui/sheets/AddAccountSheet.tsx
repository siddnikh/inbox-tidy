import type { JSX, TargetedSubmitEvent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type {
  AccountSummary,
  AddAccountRequest,
  MailProviderId,
  ProviderPreset,
  ServerSettings,
} from "../../shared/api.ts";
import { ApiError, api } from "../api.ts";
import { ErrorNotice, Hint } from "../components/Feedback.tsx";
import { Icon, type IconName, IconTile } from "../components/Icon.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { stepIcon } from "../format.ts";
import { useLoad } from "../use-load.ts";

type Step = "provider" | "password" | "form";
type FieldKey = "email" | "password" | "imapHost" | "imapPort" | "smtpHost" | "smtpPort";

const PROVIDER_HINTS: Record<MailProviderId, string> = {
  gmail: "Google accounts",
  icloud: "iCloud, me.com, mac.com",
  yahoo: "Yahoo and AOL",
  rediffmail_pro: "Business accounts",
  other: "Any provider with IMAP",
};

const PROVIDER_ICONS: Record<MailProviderId, IconName> = {
  gmail: "mail",
  icloud: "mail",
  yahoo: "mail",
  rediffmail_pro: "user",
  other: "server",
};

const STEP_NAMES = ["Choose", "Password", "Connect"];

function SheetSteps({ current }: { current: number }) {
  return (
    <div class="sheet-steps">
      <p class="caption secondary">
        Step {current} of {STEP_NAMES.length}
      </p>
      <ol class="sheet-steps-track" aria-hidden="true">
        {STEP_NAMES.map((name, i) => (
          <li
            key={name}
            class={i + 1 < current ? "is-done" : i + 1 === current ? "is-current" : undefined}
          >
            {name}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SettingsLink({ provider }: { provider: ProviderPreset }) {
  if (!provider.appPasswordUrl) return null;
  return (
    <a
      class="button button-link-out"
      href={provider.appPasswordUrl}
      target="_blank"
      rel="noreferrer"
    >
      Open {provider.label} settings
      <Icon name="external" size={14} />
    </a>
  );
}

function PasswordSteps({ provider }: { provider: ProviderPreset }) {
  // The steps say "(button below)", so the link sits inside the step that mentions it.
  const linkAt = provider.steps.findIndex((s) => /button below/i.test(s));
  return (
    <>
      <ol class="visual-steps">
        {provider.steps.map((step, i) => (
          <li key={step} class="visual-step">
            <span class="visual-step-marker">
              <IconTile name={stepIcon(step)} />
              <span class="step-badge" aria-hidden="true">
                {i + 1}
              </span>
            </span>
            <span class="visual-step-text">
              <span class="body">{step}</span>
              {i === linkAt && <SettingsLink provider={provider} />}
            </span>
          </li>
        ))}
      </ol>
      {linkAt < 0 && <SettingsLink provider={provider} />}
    </>
  );
}

function normalise(field: string): string {
  return field.toLowerCase().replace(/[^a-z]/g, "");
}

function serverFieldsMatch(apiField: string | undefined, key: FieldKey): boolean {
  if (!apiField) return false;
  const wanted = normalise(apiField);
  return wanted.length > 0 && normalise(key).startsWith(wanted);
}

interface ServerForm {
  host: string;
  port: string;
  secure: boolean;
}

function toSettings(form: ServerForm): ServerSettings {
  return { host: form.host.trim(), port: Number(form.port), secure: form.secure };
}

export function AddAccountSheet({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: (account: AccountSummary) => void;
}) {
  const providers = useLoad(() => api<ProviderPreset[]>("/api/providers"), "providers", 0);
  const [step, setStep] = useState<Step>("provider");
  const [provider, setProvider] = useState<ProviderPreset | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [imap, setImap] = useState<ServerForm>({ host: "", port: "993", secure: true });
  const [smtp, setSmtp] = useState<ServerForm>({ host: "", port: "465", secure: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [invalid, setInvalid] = useState<Partial<Record<FieldKey, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const isOther = provider?.id === "other";

  useEffect(() => {
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    target?.focus();
  }, [invalid, error]);

  const choose = (preset: ProviderPreset) => {
    setProvider(preset);
    setError(null);
    setInvalid({});
    setStep("password");
  };

  const validate = (): Partial<Record<FieldKey, string>> => {
    const problems: Partial<Record<FieldKey, string>> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      problems.email = "Enter your full email address, like you@example.com.";
    if (!password)
      problems.password = provider?.appPasswordUrl
        ? "Paste the app password you created."
        : "Enter your password.";
    if (isOther) {
      if (!imap.host.trim()) problems.imapHost = "Enter the incoming mail server.";
      if (!Number.isInteger(Number(imap.port)) || Number(imap.port) <= 0)
        problems.imapPort = "Enter a port number, like 993.";
      if (!smtp.host.trim()) problems.smtpHost = "Enter the outgoing mail server.";
      if (!Number.isInteger(Number(smtp.port)) || Number(smtp.port) <= 0)
        problems.smtpPort = "Enter a port number, like 465.";
    }
    return problems;
  };

  const submit = async (e: TargetedSubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!provider || submitting) return;
    const problems = validate();
    setInvalid(problems);
    setError(null);
    if (Object.keys(problems).length > 0) return;
    setSubmitting(true);
    const body: AddAccountRequest = {
      provider: provider.id,
      email: email.trim(),
      password,
      ...(isOther ? { imap: toSettings(imap), smtp: toSettings(smtp) } : {}),
    };
    try {
      const account = await api<AccountSummary>("/api/accounts", { method: "POST", body });
      onConnected(account);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError) setError({ message: err.message, field: err.field });
      else setError({ message: "Inbox Tidy couldn't add that account. Please try again." });
    }
  };

  const fieldState = (key: FieldKey) => {
    const local = invalid[key];
    const fromServer = serverFieldsMatch(error?.field, key);
    return {
      "aria-invalid": local || fromServer ? ("true" as const) : undefined,
      "aria-describedby": local ? `${key}-problem` : fromServer ? "connect-error" : undefined,
    };
  };

  const fieldProblem = (key: FieldKey) =>
    invalid[key] ? (
      <span class="field-problem" id={`${key}-problem`}>
        <Icon name="alert" class="hint-icon" size={14} />
        <span>{invalid[key]}</span>
      </span>
    ) : null;

  const serverFields = (
    label: string,
    prefix: "imap" | "smtp",
    value: ServerForm,
    set: (v: ServerForm) => void,
    placeholder: string,
    securePort: string,
    plainPort: string,
  ) => (
    <fieldset class="server-fields">
      <legend class="caption secondary">{label}</legend>
      <div class="field-row">
        <label class="field grow">
          <span class="field-label">Server</span>
          <input
            class="input"
            type="text"
            autoComplete="off"
            spellcheck={false}
            placeholder={placeholder}
            value={value.host}
            onInput={(e) => set({ ...value, host: e.currentTarget.value })}
            {...fieldState(`${prefix}Host`)}
          />
          {fieldProblem(`${prefix}Host`)}
        </label>
        <label class="field port">
          <span class="field-label">Port</span>
          <input
            class="input"
            type="number"
            inputMode="numeric"
            value={value.port}
            onInput={(e) => set({ ...value, port: e.currentTarget.value })}
            {...fieldState(`${prefix}Port`)}
          />
          {fieldProblem(`${prefix}Port`)}
        </label>
      </div>
      <label class="check-option">
        <input
          type="checkbox"
          checked={value.secure}
          onChange={(e) => {
            const secure = e.currentTarget.checked;
            const port =
              secure && value.port === plainPort
                ? securePort
                : !secure && value.port === securePort
                  ? plainPort
                  : value.port;
            set({ ...value, secure, port });
          }}
        />
        <span>Secure connection (SSL)</span>
      </label>
    </fieldset>
  );

  let body: JSX.Element;
  let footer: JSX.Element;

  if (step === "provider") {
    body = (
      <>
        <SheetSteps current={1} />
        <p class="body">Which email do you want to tidy?</p>
        {providers.data === undefined && providers.loading && (
          <div class="tile-grid" role="status" aria-label="Loading email providers">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} class="tile skeleton" />
            ))}
          </div>
        )}
        {providers.data === undefined && providers.error && (
          <ErrorNotice
            title="Couldn't load the list of email providers."
            message={providers.error}
            onRetry={providers.retry}
            retrying={providers.loading}
          />
        )}
        {providers.data && (
          <div class="tile-grid">
            {providers.data.map((p, i) => (
              <button
                key={p.id}
                type="button"
                class="tile"
                onClick={() => choose(p)}
                data-autofocus={i === 0 ? true : undefined}
              >
                <IconTile name={PROVIDER_ICONS[p.id]} size="sm" />
                <span class="tile-title">{p.label}</span>
                <span class="caption secondary">{PROVIDER_HINTS[p.id]}</span>
              </button>
            ))}
          </div>
        )}
      </>
    );
    footer = (
      <button type="button" class="button" onClick={onClose}>
        Cancel
      </button>
    );
  } else if (step === "password" && provider) {
    body = (
      <>
        <SheetSteps current={2} />
        <div class="intro">
          <IconTile
            name={isOther ? "server" : provider.appPasswordUrl ? "key" : "shield"}
            tone="brand"
            size="lg"
          />
          <p class="body">
            {isOther
              ? "You'll need your provider's mail server details."
              : provider.appPasswordUrl
                ? `${provider.label} needs a special password just for Inbox Tidy. Your normal password won't work, and this one can be removed any time.`
                : `${provider.label} needs one setting turned on before Inbox Tidy can read your inbox.`}
          </p>
        </div>
        <PasswordSteps provider={provider} />
        {provider.note && (
          <p class="callout note">
            <Icon name="info" class="hint-icon" />
            <span>{provider.note}</span>
          </p>
        )}
      </>
    );
    footer = (
      <>
        <button type="button" class="button" onClick={() => setStep("provider")}>
          Back
        </button>
        <button
          type="button"
          class="button button-primary"
          onClick={() => setStep("form")}
          data-autofocus
        >
          {provider.appPasswordUrl ? "I have my app password" : "Continue"}
        </button>
      </>
    );
  } else {
    body = (
      <form id="add-account-form" ref={formRef} class="form" onSubmit={submit} noValidate>
        <SheetSteps current={3} />
        {error && (
          <div id="connect-error">
            <ErrorNotice
              title={`Couldn't connect to ${provider?.label ?? "your email"}.`}
              message={error.message}
            />
          </div>
        )}
        <fieldset class="form-fields" disabled={submitting}>
          <label class="field">
            <span class="field-label">Email address</span>
            <input
              class="input"
              type="email"
              autoComplete="email"
              spellcheck={false}
              placeholder="you@example.com"
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
              data-autofocus
              {...fieldState("email")}
            />
            {fieldProblem("email")}
          </label>
          <label class="field">
            <span class="field-label">
              {isOther
                ? "Password or app password"
                : provider?.appPasswordUrl
                  ? "App password"
                  : "Password"}
            </span>
            <span class="password-wrap">
              <input
                class="input"
                type={(showPassword ? "text" : "password") as "text"}
                autoComplete="off"
                spellcheck={false}
                value={password}
                onInput={(e) => setPassword(e.currentTarget.value)}
                {...fieldState("password")}
              />
              <button
                type="button"
                class="button button-plain reveal"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
            {fieldProblem("password") ??
              (provider?.appPasswordUrl && (
                <Hint icon="clipboard">Paste the password {provider.label} showed you.</Hint>
              ))}
          </label>
          {isOther && (
            <>
              {serverFields(
                "Incoming mail (IMAP)",
                "imap",
                imap,
                setImap,
                "imap.example.com",
                "993",
                "143",
              )}
              {serverFields(
                "Outgoing mail (SMTP)",
                "smtp",
                smtp,
                setSmtp,
                "smtp.example.com",
                "465",
                "587",
              )}
            </>
          )}
        </fieldset>
        <Hint icon="lock">
          Your password is kept in your Mac's Keychain and only used to read your inbox.
        </Hint>
      </form>
    );
    footer = (
      <>
        <button
          type="button"
          class="button"
          onClick={() => setStep("password")}
          disabled={submitting}
        >
          Back
        </button>
        <button
          type="submit"
          form="add-account-form"
          class="button button-primary"
          disabled={submitting}
        >
          {submitting ? "Checking…" : "Connect"}
        </button>
      </>
    );
  }

  return (
    <Sheet
      key={step}
      title={step === "form" && provider ? `Connect ${provider.label}` : "Add an email account"}
      onClose={() => {
        if (!submitting) onClose();
      }}
      busy={submitting}
      footer={footer}
    >
      {body}
    </Sheet>
  );
}
