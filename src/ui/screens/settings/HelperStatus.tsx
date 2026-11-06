import type { AiHelperState } from "../../../shared/api.ts";
import { Icon, type IconName } from "../../components/Icon.tsx";

const STATES: Record<AiHelperState, { icon: IconName; text: string; tone: string }> = {
  ready: { icon: "check", text: "Ready", tone: "status-ready" },
  signed_out: { icon: "key", text: "Installed, not signed in", tone: "status-attention" },
  not_installed: { icon: "skip", text: "Not installed", tone: "status-missing" },
  needs_key: { icon: "key", text: "No key yet", tone: "status-missing" },
  unknown: { icon: "info", text: "Installed", tone: "status-attention" },
};

export function HelperStatus({ state }: { state: AiHelperState | null }) {
  if (state === null) {
    return (
      <span class="status-pill status-checking" role="status">
        <span class="sr-only">Checking</span>
      </span>
    );
  }
  const { icon, text, tone } = STATES[state];
  return (
    <span class={`status-pill ${tone}`}>
      <Icon name={icon} size={14} />
      {text}
    </span>
  );
}
