import type { ComponentChildren } from "preact";
import { Icon, type IconName } from "./Icon.tsx";
import { SpotArt } from "./Illustration.tsx";

export function ErrorNotice({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
}) {
  return (
    <div class="notice notice-error" role="alert">
      <Icon name="alert" class="notice-icon" size={20} />
      <div class="notice-text">
        <p class="headline">{title}</p>
        <p class="callout">{message}</p>
      </div>
      {onRetry && (
        <button type="button" class="button" onClick={onRetry} disabled={retrying}>
          {retrying ? "Trying again…" : retryLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  art,
  artTone,
  children,
  action,
}: {
  title: string;
  art: IconName;
  artTone?: "accent" | "success";
  children?: ComponentChildren;
  action?: ComponentChildren;
}) {
  return (
    <div class="empty">
      <SpotArt name={art} tone={artTone} />
      <p class="headline">{title}</p>
      {children && <p class="callout secondary">{children}</p>}
      {action}
    </div>
  );
}

// A short explanation or instruction, always led by an icon so it reads at a glance.
export function Hint({
  icon = "info",
  tone,
  children,
}: {
  icon?: IconName;
  tone?: "danger" | "success";
  children: ComponentChildren;
}) {
  return (
    <p class={`hint caption ${tone ?? "secondary"}`}>
      <Icon name={icon} class="hint-icon" size={14} />
      <span>{children}</span>
    </p>
  );
}

// An inline failure message next to the control that failed.
export function InlineError({
  children,
  announce = true,
}: {
  children: ComponentChildren;
  // Off when the message already sits inside an aria-live region.
  announce?: boolean;
}) {
  return (
    <p class="inline-error callout" role={announce ? "alert" : undefined}>
      <Icon name="alert" class="hint-icon" />
      <span>{children}</span>
    </p>
  );
}

export function SkeletonRows({ count = 5, label }: { count?: number; label: string }) {
  return (
    <ul class="list" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <li class="list-row skeleton-row" key={i}>
          <span class="skeleton skeleton-circle" />
          <span class="skeleton-stack">
            <span class="skeleton skeleton-text" style={{ width: `${38 + ((i * 17) % 30)}%` }} />
            <span
              class="skeleton skeleton-text small"
              style={{ width: `${22 + ((i * 11) % 20)}%` }}
            />
          </span>
          <span class="skeleton skeleton-text trailing" />
        </li>
      ))}
    </ul>
  );
}
