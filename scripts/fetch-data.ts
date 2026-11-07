// Builds src/data/packings.json from David Ellsworth's "Squares in Squares" catalog.
// Downloads are cached in data-cache/ (gitignored) so the site is only hit once.
// Usage: npm run fetch-data [-- --refresh]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSvg } from "./svg-to-squares.ts";
import { validate, type Square } from "../src/geometry.ts";
import type { Entry, Dataset } from "../src/types.ts";

const BASE = "https://kingbird.myphotos.cc/packing/";
const PAGE = "squares_in_squares.html";
const CACHE = "data-cache";
const OUT = "src/data/packings.json";
const MAX_GRID_N = 324; // catalog covers every n up to here; unlisted n use the trivial grid
const refresh = process.argv.includes("--refresh");

mkdirSync(CACHE, { recursive: true });
mkdirSync("src/data", { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cached(file: string): Promise<string> {
  const path = join(CACHE, file);
  if (!refresh && existsSync(path)) return readFileSync(path, "utf8");
  await sleep(300); // be polite: sequential, spaced requests
  const res = await fetch(BASE + encodeURIComponent(file), {
    headers: { "User-Agent": "packingproblem-local-viewer/0.1 (personal, non-commercial; caches results)" },
  });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(path, text);
  process.stdout.write(".");
  return text;
}

const stripTags = (h: string) =>
  h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // The catalog wraps sentences with <br>; re-join continuation lines.
    .reduce<string[]>((acc, l) => {
      if (acc.length && /^([a-z(]|and\b)/.test(l)) acc[acc.length - 1] += " " + l;
      else acc.push(l);
      return acc;
    }, []);

interface RawEntry {
  ns: number[];
  href: string;
  embed: string;
  latexShort?: string;
  latexPoly?: string;
  credit: string[];
}

function parseCatalog(html: string): RawEntry[] {
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  const chunks = html.split(/<div class="box">/).slice(1);
  const out: RawEntry[] = [];
  for (const c of chunks) {
    const head = c.match(/<font size="\+3">([\d,\s]+)<br>\s*<a href="([^"]+)">[\s\S]*?<embed src="([^"]+)"/);
    if (!head) continue;
    const ns = head[1].split(",").map((x) => Number(x.trim())).filter(Boolean);
    const desc = c.match(/<div align="center">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? "";
    let latexShort: string | undefined;
    let latexPoly: string | undefined;
    let rest = desc;
    const f1 = desc.match(/<span class="frame1">\s*\$([\s\S]*?)\$\s*<\/span>/);
    const fs = desc.match(/<span class="frames">\s*\$([\s\S]*?)\$\s*<\/span>/);
    if (f1) {
      latexShort = f1[1].trim();
      latexPoly = fs?.[1].trim();
      rest = desc.replace(/<span class="toggle">[\s\S]*?<\/span>\s*<\/span>/, "");
    } else {
      const m = desc.match(/\$([\s\S]*?)\$/);
      if (m) {
        latexShort = m[1].trim();
        rest = desc.replace(m[0], "");
      }
    }
    out.push({ ns, href: head[2], embed: head[3], latexShort, latexPoly, credit: stripTags(rest) });
  }
  return out;
}

function gridPacking(n: number): { squares: Square[]; spare: Square[] } {
  const k = Math.ceil(Math.sqrt(n - 1e-9));
  const cells: Square[] = [];
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) cells.push({ x: i + 0.5, y: j + 0.5, a: 0 });
  // Leave the empty cells in the top-right corner.
  cells.sort((p, q) => p.y - q.y || p.x - q.x);
  return { squares: cells.slice(0, n), spare: cells.slice(n) };
}

const round = (q: Square): Square => ({ x: +q.x.toFixed(12), y: +q.y.toFixed(12), a: +q.a.toFixed(12) });

async function main() {
  const html = await cached(PAGE);
  const raw = parseCatalog(html);
  console.log(`catalog: ${raw.length} entries`);

  const entries = new Map<number, Entry>();
  let failures = 0;

  for (const r of raw) {
    const files = [...new Set([r.href, r.embed])];
    const parsed = [];
    for (const f of files) {
      try {
        parsed.push({ file: f, ...parseSvg(await cached(f)) });
      } catch (e) {
        console.warn(`\n  ! ${f}: ${(e as Error).message}`);
      }
    }
    if (!parsed.length) {
      failures++;
      continue;
    }
    // The pictured (embedded) version is what the catalog shows; the link target is the alternative.
    parsed.sort((a, b) => (a.file === r.embed ? -1 : 0) - (b.file === r.embed ? -1 : 0));
    const proven = r.credit.some((l) => /^Proved\b/i.test(l)) || (r.credit.some((l) => /^Trivial/i.test(l)) && Number.isInteger(Math.sqrt(r.ns[0])));
    const trivial = r.credit.some((l) => /^Trivial/i.test(l));

    for (const n of r.ns) {
      const variants: Entry["variants"] = parsed.map((p) => {
        // e.g. the catalog shows n=3 with the 2-square picture: fill an integer box as a grid instead.
        if (p.squares.length < n && Number.isInteger(p.s) && Math.ceil(Math.sqrt(n - 1e-9)) === p.s) {
          const g = gridPacking(n);
          return { file: null, s: p.s, squares: g.squares, spare: g.spare, issues: [], comment: p.comment };
        }
        const sq = p.squares.slice(0, n).map(round);
        const spare = p.squares.slice(n).map(round);
        const issues = validate({ n, s: p.s, proven, credit: "", squares: sq });
        return { file: p.file, s: p.s, squares: sq, spare, issues, comment: p.comment };
      });
      // For shared entries ("2, 3") the two files are each n's own picture, not alternatives:
      // keep only pictures that fit this n exactly when there are any.
      const exact = variants.filter((v) => v.file && v.spare.length === 0);
      if (exact.length) variants.splice(0, variants.length, ...exact);
      entries.set(n, {
        n,
        s: variants[0].s,
        status: proven ? "proven" : trivial ? "trivial" : "open",
        latexShort: r.latexShort,
        latexPoly: r.latexPoly,
        credit: r.credit,
        sharedWith: r.ns.length > 1 ? r.ns : undefined,
        variants,
        source: BASE + r.href,
      });
    }
  }

  for (let n = 1; n <= MAX_GRID_N; n++) {
    if (entries.has(n)) continue;
    const g = gridPacking(n);
    const k = Math.ceil(Math.sqrt(n - 1e-9));
    entries.set(n, {
      n,
      s: k,
      status: k * k === n ? "proven" : "trivial",
      credit: [k * k === n ? "Trivial — a perfect square." : "Trivial grid packing; nothing better is known."],
      variants: [{ file: null, s: k, squares: g.squares, spare: g.spare, issues: validate({ n, s: k, proven: false, credit: "", squares: g.squares }), comment: "" }],
      source: BASE + PAGE,
    });
  }

  const list = [...entries.values()].sort((a, b) => a.n - b.n);
  const bad = list.filter((e) => e.variants.some((v) => v.issues.length));
  const data: Dataset = { fetched: new Date().toISOString(), source: BASE + PAGE, entries: list };
  writeFileSync(OUT, JSON.stringify(data));
  console.log(`\nwrote ${list.length} packings to ${OUT}`);
  if (failures) console.log(`${failures} catalog entries could not be parsed`);
  for (const e of bad)
    for (const v of e.variants) if (v.issues.length) console.log(`  n=${e.n} ${v.file}: ${v.issues.slice(0, 2).map((i) => i.detail).join("; ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
