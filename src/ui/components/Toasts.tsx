import { createPortal } from "preact";
import type { ToastTone } from "../app-state.ts";
import { Icon } from "./Icon.tsx";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export function Toasts({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return createPortal(
    <div class="toast-region" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} class={`toast toast-${t.tone}`}>
          {t.tone === "success" && <Icon name="check" class="toast-icon" />}
          {t.tone === "error" && <Icon name="alert" class="toast-icon" />}
          <span>{t.message}</span>
          <button
            type="button"
            class="toast-close"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
