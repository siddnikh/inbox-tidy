const PATHS = {
  check: "M3.5 8.5l3 3 6-7",
  external: "M6 3.5h6.5V10M12.5 3.5L4 12",
  alert: "M8 4.5v4.5M8 11.5v.01",
  skip: "M4.5 8h7",
  search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6l3.4 3.4",
  chevron: "M6 4l4 4-4 4",
  close: "M4.5 4.5l7 7M11.5 4.5l-7 7",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, class: className }: { name: IconName; class?: string }) {
  return (
    <svg
      class={`icon ${className ?? ""}`}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
