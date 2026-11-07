import type { Issue, Square } from "./geometry.ts";

export interface Variant {
  /** source SVG file name, or null for a generated grid */
  file: string | null;
  s: number;
  squares: Square[];
  /** squares of the source packing not needed for this n (shown as ghosts) */
  spare: Square[];
  issues: Issue[];
  /** credits / exact forms from the SVG's leading comment */
  comment: string;
}

export interface Entry {
  n: number;
  s: number;
  /** proven optimal / trivial (best known, grid) / open (best known, non-trivial) */
  status: "proven" | "trivial" | "open";
  latexShort?: string;
  latexPoly?: string;
  credit: string[];
  /** other n values the catalog shows with this same packing */
  sharedWith?: number[];
  variants: Variant[];
  source: string;
}

export interface Dataset {
  fetched: string;
  source: string;
  entries: Entry[];
}
