import { ICON_PATHS, type IconName } from "./Icon.tsx";

function sparkle(cx: number, cy: number, s: number): string {
  return `M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z`;
}

// A small spot illustration for empty states: one glyph on a soft purple disc, with a yellow spark.
export function SpotArt({
  name,
  tone = "accent",
}: {
  name: IconName;
  tone?: "accent" | "success";
}) {
  return (
    <svg
      class={`spot-art spot-art-${tone}`}
      viewBox="0 0 96 80"
      width="96"
      height="80"
      aria-hidden="true"
    >
      <circle class="art-glow" cx="48" cy="40" r="34" />
      <circle class="art-ring" cx="48" cy="40" r="34" />
      <rect class="art-paper" x="27" y="19" width="42" height="42" rx="12" />
      <g
        class="art-glyph"
        transform="translate(32 24) scale(2)"
        fill="none"
        stroke-width="0.85"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        {ICON_PATHS[name].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path class="art-spark" d={sparkle(76, 16, 6)} />
      <path class="art-spark-soft" d={sparkle(17, 56, 3.5)} />
      <circle class="art-dot" cx="82" cy="58" r="2" />
      <circle class="art-dot" cx="20" cy="24" r="1.5" />
    </svg>
  );
}

// The first-run picture: a couple of envelopes, tidied, with a yellow check.
export function WelcomeArt() {
  return (
    <svg class="welcome-art" viewBox="0 0 168 120" width="168" height="120" aria-hidden="true">
      <ellipse class="art-glow" cx="84" cy="64" rx="74" ry="50" />
      <g transform="rotate(-9 64 52)">
        <rect class="art-paper" x="30" y="30" width="68" height="46" rx="9" />
        <path class="art-line" d="M38 38l26 19 26-19" />
      </g>
      <rect class="art-paper art-paper-front" x="56" y="46" width="76" height="52" rx="10" />
      <path class="art-line" d="M65 55l29 21 29-21" />
      <path class="art-line art-line-faint" d="M66 89h22" />
      <circle class="art-highlight" cx="128" cy="46" r="15" />
      <path class="art-on-highlight" d="M121.5 46.5l4.5 4.5 8.5-9.5" />
      <path class="art-spark" d={sparkle(26, 22, 7)} />
      <path class="art-spark-soft" d={sparkle(150, 92, 4.5)} />
      <circle class="art-dot" cx="146" cy="20" r="2.2" />
      <circle class="art-dot" cx="20" cy="88" r="1.8" />
    </svg>
  );
}
