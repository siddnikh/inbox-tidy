import { useState } from "preact/hooks";
import type { AccountSummary } from "../../shared/api.ts";
import { ApiError, api } from "../api.ts";
import { scanRunning, useApp } from "../app-state.ts";
import { EmptyState, ErrorNotice, Hint, SkeletonRows } from "../components/Feedback.tsx";
import { Icon, IconTile } from "../components/Icon.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { plural, providerLabel, relativeTime } from "../format.ts";
import { useLoad } from "../use-load.ts";

function RemoveAccountSheet({
  account,
  onClose,
  onRemoved,
}: {
  account: AccountSummary;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await api<{ ok: true }>(`/api/accounts/${account.id}`, { method: "DELETE" });
      onRemoved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Please try again.");
      setRemoving(false);
    }
  };

  return (
    <Sheet
      title={`Remove ${account.email}?`}
      onClose={onClose}
      busy={removing}
      footer={
        <>
          <button type="button" class="button" onClick={onClose} disabled={removing} data-autofocus>
            Cancel
          </button>
          <button type="button" class="button button-danger" onClick={remove} disabled={removing}>
            {removing ? "Removing…" : "Remove account"}
          </button>
        </>
      }
    >
      <p class="body">
        Inbox Tidy will forget this account's password and its copy of the list of senders and
        emails. Senders that only emailed this account disappear from your lists.
      </p>
      <div class="recover-note">
        <IconTile name="shield" tone="success" />
        <p class="callout">
          <strong>Your mailbox stays as it is.</strong>{" "}
          <span class="secondary">
            Nothing changes in your real mailbox, and you can add the account again any time.
          </span>
        </p>
      </div>
      {error && <ErrorNotice title="Couldn't remove the account." message={error} />}
    </Sheet>
  );
}

function AccountRow({ account, onRemove }: { account: AccountSummary; onRemove: () => void }) {
  const app = useApp();
  return (
    <li class="list-row account-row">
      <span class="monogram" aria-hidden="true">
        {account.email.charAt(0).toUpperCase()}
      </span>
      <span class="row-text">
        <span class="row-title">{account.email}</span>
        <span class="row-subtitle">
          {providerLabel(account.provider)} · {plural(account.messageCount, "email")}
        </span>
        {account.lastScanError ? (
          <>
            <span class="callout danger account-error">
              <Icon name="alert" class="hint-icon" />
              <span>{account.lastScanError}</span>
            </span>
            <span class="hint caption secondary">
              <Icon name="refresh" class="hint-icon" size={14} />
              <span>
                Press Scan again on Home to retry. If it still fails, remove the account and add it
                again with a new app password.
              </span>
            </span>
          </>
        ) : (
          <span class="hint caption secondary">
            <Icon name="clock" class="hint-icon" size={14} />
            <span>
              {scanRunning(app.scan) && app.scan?.accountEmail === account.email
                ? "Scanning now…"
                : account.lastScanAt
                  ? `Last checked ${relativeTime(account.lastScanAt)}`
                  : "Not checked yet"}
            </span>
          </span>
        )}
      </span>
      <button type="button" class="button button-small" onClick={onRemove}>
        Remove
      </button>
    </li>
  );
}

export function Accounts() {
  const app = useApp();
  const accounts = useLoad(() => api<AccountSummary[]>("/api/accounts"), "accounts", app.version);
  const [removing, setRemoving] = useState<AccountSummary | null>(null);
  const rows = accounts.data;

  return (
    <div class="stack">
      <PageHeader title="Email accounts">
        {rows && rows.length > 0 && (
          <button type="button" class="button button-primary" onClick={app.openAddAccount}>
            <Icon name="plus" size={14} />
            Add account
          </button>
        )}
      </PageHeader>
      {rows === undefined && accounts.loading && (
        <SkeletonRows count={2} label="Loading accounts" />
      )}
      {rows === undefined && accounts.error && (
        <ErrorNotice
          title="Couldn't load your email accounts."
          message={accounts.error}
          onRetry={accounts.retry}
          retrying={accounts.loading}
        />
      )}
      {rows && rows.length === 0 && (
        <EmptyState
          title="No email accounts yet."
          art="mail"
          action={
            <button type="button" class="button button-primary" onClick={app.openAddAccount}>
              <Icon name="plus" size={14} />
              Add an email account
            </button>
          }
        >
          Add one to see who emails you most.
        </EmptyState>
      )}
      {rows && rows.length > 0 && (
        <ul class="list">
          {rows.map((a) => (
            <AccountRow key={a.id} account={a} onRemove={() => setRemoving(a)} />
          ))}
        </ul>
      )}
      {rows && rows.length > 0 && (
        <Hint icon="lock">
          Passwords are kept in your Mac's Keychain. Inbox Tidy only reads your inbox, and changes
          nothing until you confirm an action.
        </Hint>
      )}
      {removing && (
        <RemoveAccountSheet
          account={removing}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            app.toast(`Removed ${removing.email}.`, "success");
            setRemoving(null);
            app.refresh();
          }}
        />
      )}
    </div>
  );
}
