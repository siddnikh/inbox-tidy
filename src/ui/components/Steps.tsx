import type { ComponentChildren } from "preact";
import { type IconName, IconTile } from "./Icon.tsx";

export interface VisualStep {
  key: string;
  icon: IconName;
  text: ComponentChildren;
  // Controls that belong to this step, such as a link or a line to copy.
  extra?: ComponentChildren;
}

// Numbered instructions: each step has a purple number badge on an icon tile, joined by a line.
export function VisualSteps({ steps }: { steps: VisualStep[] }) {
  return (
    <ol class="visual-steps">
      {steps.map((step, i) => (
        <li key={step.key} class="visual-step">
          <span class="visual-step-marker">
            <IconTile name={step.icon} />
            <span class="step-badge" aria-hidden="true">
              {i + 1}
            </span>
          </span>
          <span class="visual-step-text">
            <span class="body">{step.text}</span>
            {step.extra}
          </span>
        </li>
      ))}
    </ol>
  );
}
