const CIRCLE = "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z";

export const ICON_PATHS = {
  check: ["M3.5 8.5l3 3 6-7"],
  external: ["M6 3.5h6.5V10", "M12.5 3.5L4 12"],
  alert: [CIRCLE, "M8 4.9v3.6", "M8 11.1v.01"],
  info: [CIRCLE, "M8 7.4v3.8", "M8 4.9v.01"],
  skip: [CIRCLE, "M5.3 8h5.4"],
  search: ["M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10z", "M10.6 10.6l3.4 3.4"],
  chevron: ["M6 4l4 4-4 4"],
  close: ["M4.5 4.5l7 7", "M11.5 4.5l-7 7"],
  plus: ["M8 3.5v9", "M3.5 8h9"],
  shield: ["M8 1.8l5 2v4.1c0 3-2.1 5.3-5 6.3-2.9-1-5-3.3-5-6.3V3.8z", "M5.8 8l1.6 1.6 2.9-3.1"],
  key: [
    "M2.5 10.6a2.7 2.7 0 1 0 5.4 0 2.7 2.7 0 1 0-5.4 0",
    "M7.1 8.7L13 2.8",
    "M11 4.8l1.7 1.7",
    "M9.3 6.5l1.3 1.3",
  ],
  clipboard: [
    "M5.5 3h-1A1.5 1.5 0 0 0 3 4.5v8A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 11.5 3h-1",
    "M6.3 2h3.4a.8.8 0 0 1 .8.8v.9a.8.8 0 0 1-.8.8H6.3a.8.8 0 0 1-.8-.8v-.9a.8.8 0 0 1 .8-.8z",
    "M5.8 8h4.4",
    "M5.8 10.7h2.8",
  ],
  field: [
    "M3.5 4.8h9A1.5 1.5 0 0 1 14 6.3v3.4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 9.7V6.3a1.5 1.5 0 0 1 1.5-1.5z",
    "M4.8 6.6v2.8",
    "M7.4 8h.01",
    "M9.4 8h.01",
    "M11.4 8h.01",
  ],
  globe: [
    CIRCLE,
    "M8 2c-1.7 1.7-2.5 3.7-2.5 6s.8 4.3 2.5 6c1.7-1.7 2.5-3.7 2.5-6S9.7 3.7 8 2z",
    "M2.3 8h11.4",
  ],
  mail: [
    "M3 3.5h10A1.5 1.5 0 0 1 14.5 5v6a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 11V5A1.5 1.5 0 0 1 3 3.5z",
    "M2 4.6l6 4.4 6-4.4",
  ],
  bolt: ["M9 1.8L3.5 9h4l-.5 5.2L12.5 7h-4z"],
  trash: [
    "M2.5 4.5h11",
    "M6 4.5V3h4v1.5",
    "M4 4.5l.7 8.5a1.2 1.2 0 0 0 1.2 1.1h4.2a1.2 1.2 0 0 0 1.2-1.1L12 4.5",
    "M6.8 7v4.4",
    "M9.2 7v4.4",
  ],
  restore: ["M2.8 3.6v3.8h3.8", "M3.2 7.4A5 5 0 1 1 4.6 11.7"],
  refresh: ["M13.2 3.6v3.8H9.4", "M12.8 7.4A5 5 0 1 0 11.4 11.7"],
  lock: [
    "M4.5 7h7A1.5 1.5 0 0 1 13 8.5v4a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7z",
    "M5.5 7V5a2.5 2.5 0 0 1 5 0v2",
  ],
  sparkles: [
    "M6.5 2l1.2 3.3L11 6.5 7.7 7.7 6.5 11 5.3 7.7 2 6.5l3.3-1.2z",
    "M12 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z",
  ],
  calendar: [
    "M3.5 3h9A1.5 1.5 0 0 1 14 4.5v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-8A1.5 1.5 0 0 1 3.5 3z",
    "M2 6.5h12",
    "M5.5 1.8v2.4",
    "M10.5 1.8v2.4",
  ],
  plug: ["M6 2v3", "M10 2v3", "M4 5h8v2.5a4 4 0 0 1-8 0z", "M8 11.5V14"],
  server: [
    "M3.5 2.5h9a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z",
    "M3.5 9h9a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z",
    "M5 4.75h.01",
    "M5 11.25h.01",
  ],
  user: ["M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M3 14c.5-2.6 2.5-4 5-4s4.5 1.4 5 4"],
  bellOff: ["M4.5 11.5V7.5a3.5 3.5 0 0 1 7 0v4l1 1h-9z", "M6.8 14.3h2.4", "M2.5 2.5l11 11"],
  trendDown: ["M2 4.5l4.5 4.5 2.5-2.5 5 5", "M10 11.5h4v-4"],
  clock: [CIRCLE, "M8 4.8V8l2.2 1.5"],
  pin: ["M5 2.5h6", "M6 2.5v4L4 9.5h8l-2-3v-4", "M8 9.5V14"],
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({
  name,
  class: className,
  size = 16,
  label,
}: {
  name: IconName;
  class?: string;
  size?: number;
  label?: string;
}) {
  return (
    <svg
      class={`icon ${className ?? ""}`}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden={label ? undefined : "true"}
      role={label ? "img" : undefined}
      aria-label={label}
      fill="none"
      stroke="currentColor"
      stroke-width={size >= 20 ? 1.5 : 1.7}
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// A small rounded tile holding an icon, used as the visual cue beside instructions and headings.
export function IconTile({
  name,
  tone = "accent",
  size = "md",
}: {
  name: IconName;
  tone?: "accent" | "brand" | "success" | "danger" | "neutral";
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "lg" ? 22 : size === "sm" ? 14 : 16;
  return (
    <span class={`icon-tile icon-tile-${tone} icon-tile-${size}`} aria-hidden="true">
      <Icon name={name} size={px} />
    </span>
  );
}
