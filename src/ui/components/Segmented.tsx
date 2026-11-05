import type { TargetedKeyboardEvent } from "preact";
import { useRef } from "preact/hooks";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  idPrefix?: string;
}

function useArrowKeys<T extends string>({ options, value, onChange }: Props<T>) {
  const group = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: TargetedKeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const nextIndex = (index + step + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);
    group.current?.querySelectorAll<HTMLButtonElement>("button")[nextIndex]?.focus();
  };
  return { group, onKeyDown };
}

export function SegmentedTabs<T extends string>(props: Props<T>) {
  const { group, onKeyDown } = useArrowKeys(props);
  return (
    <div ref={group} class="segmented" role="tablist" aria-label={props.label}>
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <button
            key={option.value}
            type="button"
            id={props.idPrefix ? `${props.idPrefix}-${option.value}` : undefined}
            class="segment"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => props.onChange(option.value)}
            onKeyDown={onKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>(props: Props<T>) {
  return (
    <fieldset class="segmented">
      <legend class="sr-only">{props.label}</legend>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          class="segment"
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
