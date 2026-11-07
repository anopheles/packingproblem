// Renders a packing as an SVG "plate".

import { corners, isTilted, type Square } from "./geometry.ts";

const NS = "http://www.w3.org/2000/svg";

export interface PlateOptions {
  s: number;
  squares: Square[];
  spare?: Square[];
  /** draw the ⌈√n⌉ grid box for comparison */
  gridBox?: number | null;
  thumb?: boolean;
}

const pts = (q: Square) => corners(q).map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(" ");

export function plateMarkup(o: PlateOptions): string {
  const pad = o.thumb ? 0.04 * o.s : 0.06 * Math.max(o.s, o.gridBox ?? 0);
  const ext = Math.max(o.s, o.gridBox ?? 0);
  const vb = `${-pad} ${-pad} ${ext + 2 * pad} ${ext + 2 * pad}`;
  const sq = o.squares
    .map((q, i) => `<polygon class="sq${isTilted(q) ? " tilt" : ""}" data-i="${i}" points="${pts(q)}"/>`)
    .join("");
  const spare = (o.spare ?? []).map((q) => `<polygon class="spare" points="${pts(q)}"/>`).join("");
  const grid =
    o.gridBox && o.gridBox > o.s + 1e-9
      ? `<rect class="gridbox" x="0" y="0" width="${o.gridBox}" height="${o.gridBox}"/>` +
        Array.from({ length: o.gridBox - 1 }, (_, i) => {
          const t = i + 1;
          return `<line class="gridline" x1="${t}" y1="0" x2="${t}" y2="${o.gridBox}"/><line class="gridline" x1="0" y1="${t}" x2="${o.gridBox}" y2="${t}"/>`;
        }).join("")
      : "";
  // y-up maths coordinates: flip inside a group so the viewBox stays positive.
  return `<svg xmlns="${NS}" viewBox="${vb}" class="plate${o.thumb ? " thumb" : ""}" role="img">
<g transform="translate(0 ${ext}) scale(1 -1)">
<rect class="box" x="0" y="0" width="${o.s}" height="${o.s}"/>
${grid}${spare}${sq}
</g></svg>`;
}

/** Standalone SVG with inline styles, for download. */
export function exportSvg(s: number, squares: Square[]): string {
  const body = squares
    .map((q) => `<polygon points="${pts(q)}" fill="${isTilted(q) ? "#2c46b0" : "#dfe3dc"}" stroke="#1c2330" stroke-width="${(s / 600).toFixed(5)}"/>`)
    .join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="800" height="800">
<g transform="translate(0 ${s}) scale(1 -1)">
  <rect width="${s}" height="${s}" fill="#f4f5f0" stroke="#1c2330" stroke-width="${(s / 300).toFixed(5)}"/>
  ${body}
</g>
</svg>
`;
}
