/**
 * Fixed per-person colors: each decision maker gets one deterministic
 * color from the palette, so "who decided what" is visible at a glance
 * across the whole app. Team decisions (no maker) get the neutral gray.
 */
const PALETTE = [
  "#c0392b", // red
  "#2471a3", // blue
  "#1e8449", // green
  "#7d3c98", // purple
  "#b9770e", // amber
  "#0e6655", // teal
  "#ca6f1e", // orange
  "#2e4053", // slate
];

export function personColor(name) {
  if (!name) {
    return "#7f8c8d";
  }

  let hash = 0;
  for (const character of String(name)) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }

  return PALETTE[hash % PALETTE.length];
}
