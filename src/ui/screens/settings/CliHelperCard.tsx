import { useEffect, useState } from "preact/hooks";
import type { AiHelperState } from "../../../shared/api.ts";
import { CopyCommand } from "../../components/CopyCommand.tsx";
import { Hint } from "../../components/Feedback.tsx";
import { Icon, IconTile } from "../../components/Icon.tsx";
import { type VisualStep, VisualSteps } from "../../components/Steps.tsx";
import { HelperStatus } from "./HelperStatus.tsx";

type CliId = "claude" | "codex";

interface CliGuide {
  name: string;
  detail: string;
  account: string;
  install: string;
  installNote: string;
  // Both installers put the CLI in ~/.local/bin, which a Terminal window opened before the
  // install doesn't search yet, so a fresh install signs in by full path.
  signInAfterInstall: string;
  signIn: string;
  guideUrl: string;
  guideLabel: string;
}

const GUIDES: Record<CliId, CliGuide> = {
  claude: {
    name: "Claude Code",
    detail: "Uses your Claude subscription. Needs a paid plan, such as Pro or Max.",
    account: "Claude",
    install: "curl -fsSL https://claude.ai/install.sh | bash",
    installNote: "It installs Claude Code. It may sit quietly for a minute while it downloads.",
    signInAfterInstall: "~/.local/bin/claude auth login",
    signIn: "claude auth login",
    guideUrl: "https://code.claude.com/docs/en/setup",
    guideLabel: "Claude Code's setup guide",
  },
  codex: {
    name: "Codex",
    detail: "Uses your ChatGPT subscription. Needs a paid plan, such as Plus or Pro.",
    account: "ChatGPT",
    install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    installNote: "It installs Codex. If it asks “Start Codex now?”, press Return to skip.",
    signInAfterInstall: "~/.local/bin/codex login",
    signIn: "codex login",
    guideUrl: "https://github.com/openai/codex",
    guideLabel: "Codex's setup guide",
  },
};

function CheckAgainButton({ checking, onCheck }: { checking: boolean; onCheck: () => void }) {
  return (
    <button type="button" class="button step-action" onClick={onCheck} disabled={checking}>
      <Icon name="refresh" size={14} />
      {checking ? "Checking…" : "Check again"}
    </button>
  );
}

function stepsFor(
  id: CliId,
  state: AiHelperState,
  checking: boolean,
  onCheck: () => void,
): VisualStep[] {
  const guide = GUIDES[id];
  const steps: VisualStep[] = [
    {
      key: "terminal",
      icon: "terminal",
      text: (
        <>
          Open Terminal: press <kbd>Command</kbd> and <kbd>Space</kbd> together, type{" "}
          <strong>Terminal</strong>, then press <kbd>Return</kbd>.
        </>
      ),
    },
  ];
  const installed = state !== "not_installed";
  if (!installed) {
    steps.push({
      key: "install",
      icon: "clipboard",
      text: `Copy this line, paste it into Terminal with Command and V, then press Return. ${guide.installNote}`,
      extra: <CopyCommand command={guide.install} label={`install ${guide.name}`} />,
    });
  }
  steps.push({
    key: "sign-in",
    icon: "user",
    text: `${installed ? "Copy this line, paste it into Terminal" : "When it's done, copy this line, paste it in"}, then press Return. Your browser opens: sign in with your ${guide.account} account.`,
    extra: (
      <CopyCommand
        command={installed ? guide.signIn : guide.signInAfterInstall}
        label={`sign in to ${guide.name}`}
      />
    ),
  });
  steps.push({
    key: "check",
    icon: "refresh",
    text: "Come back here and press Check again.",
    extra: <CheckAgainButton checking={checking} onCheck={onCheck} />,
  });
  return steps;
}

export function CliHelperCard({
  id,
  state,
  startOpen,
  checking,
  onCheckAgain,
}: {
  id: CliId;
  state: AiHelperState | null;
  startOpen: boolean;
  checking: boolean;
  onCheckAgain: () => void;
}) {
  const guide = GUIDES[id];
  const needsSetup = state === "not_installed" || state === "signed_out";
  const [open, setOpen] = useState(startOpen);
  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);
  const headingId = `helper-${id}-heading`;
  const stepsId = `helper-${id}-steps`;

  return (
    <section class="card settings-group helper-card" aria-labelledby={headingId}>
      <div class="setting-heading">
        <IconTile name="terminal" tone="brand" />
        <span class="heading-text">
          <h2 class="headline" id={headingId}>
            {guide.name}
          </h2>
          <span class="caption secondary">{guide.detail}</span>
        </span>
        <HelperStatus state={state} />
      </div>

      {state === "ready" && (
        <Hint icon="check" tone="success">
          Installed and signed in. Nothing else to do.
        </Hint>
      )}
      {state === "unknown" && (
        <Hint icon="info">
          It's installed, but Inbox Tidy couldn't tell whether it's signed in. Press Test the AI
          helper above to find out.
        </Hint>
      )}

      {needsSetup && (
        <>
          <button
            type="button"
            class="button button-plain disclosure-button"
            aria-expanded={open}
            aria-controls={stepsId}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name="chevron" size={14} class={`disclosure${open ? " is-open" : ""}`} />
            {state === "not_installed"
              ? `Show me how to set up ${guide.name}`
              : `Show me how to sign in to ${guide.name}`}
          </button>
          {open && (
            <div class="helper-steps" id={stepsId}>
              <VisualSteps steps={stepsFor(id, state, checking, onCheckAgain)} />
              <a
                class="button button-link-out"
                href={guide.guideUrl}
                target="_blank"
                rel="noreferrer"
              >
                {guide.guideLabel}
                <Icon name="external" size={14} />
              </a>
            </div>
          )}
        </>
      )}
    </section>
  );
}
