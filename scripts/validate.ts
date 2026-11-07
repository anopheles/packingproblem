// Re-checks every packing in the dataset: right count, no overlaps, inside the box.
import { readFileSync } from "node:fs";
import { validate } from "../src/geometry.ts";
import type { Dataset } from "../src/types.ts";

const data: Dataset = JSON.parse(readFileSync("src/data/packings.json", "utf8"));
let bad = 0;
for (const e of data.entries)
  for (const v of e.variants) {
    const issues = validate({ n: e.n, s: v.s, proven: false, credit: "", squares: v.squares });
    if (issues.length) {
      bad++;
      console.error(`n=${e.n} ${v.file ?? "grid"}: ${issues.map((i) => i.detail).join("; ")}`);
    }
  }
console.log(`${data.entries.length} packings checked, ${bad} with problems`);
process.exit(bad ? 1 : 0);
