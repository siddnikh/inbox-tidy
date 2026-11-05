import { type ComponentChildren, createPortal } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

export function Sheet({
  title,
  onClose,
  busy = false,
  wide = false,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  // While an action is in flight the sheet can't be dismissed, so its result is never lost.
  busy?: boolean;
  wide?: boolean;
  children: ComponentChildren;
  footer?: ComponentChildren;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const app = document.getElementById("app");
    app?.setAttribute("inert", "");
    const root = panel.current;
    if (root) {
      const preferred = root.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? root).focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const current = panel.current;
      if (!current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(current);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!first || !last) {
        e.preventDefault();
        current.focus();
      } else if (!active || !current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      app?.removeAttribute("inert");
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return createPortal(
    <div class="sheet-overlay">
      <div
        ref={panel}
        class={`sheet ${wide ? "sheet-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        tabIndex={-1}
      >
        <header class="sheet-header">
          <h2 id={titleId} class="title">
            {title}
          </h2>
        </header>
        <div class="sheet-body">{children}</div>
        {footer && <footer class="sheet-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
