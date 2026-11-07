// Flattens one of David Ellsworth's packing SVGs into a list of unit squares.
// Squares appear as 1×1 rects, larger integer rects, or filled orthogonal paths
// (several squares merged into one outline). Outline-only paths (fill:none) are ignored.

import { DOMParser } from "@xmldom/xmldom";
import type { Square } from "../src/geometry.ts";

type M = [number, number, number, number, number, number]; // a b c d e f
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const nums = (s: string) => (s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

function parseTransform(t: string | null): M {
  let m = I;
  if (!t) return m;
  for (const [, op, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = nums(args);
    let k: M;
    switch (op) {
      case "translate":
        k = [1, 0, 0, 1, v[0], v[1] ?? 0];
        break;
      case "scale":
        k = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
        break;
      case "rotate": {
        const r = (v[0] * Math.PI) / 180;
        const c = Math.cos(r), s = Math.sin(r);
        k = [c, s, -s, c, 0, 0];
        if (v.length === 3) k = mul(mul([1, 0, 0, 1, v[1], v[2]], k), [1, 0, 0, 1, -v[1], -v[2]]);
        break;
      }
      case "matrix":
        k = v.slice(0, 6) as M;
        break;
      default:
        throw new Error(`unsupported transform ${op}`);
    }
    m = mul(m, k);
  }
  return m;
}

function styleProp(el: Element, prop: string): string | null {
  const st = el.getAttribute("style");
  if (st) {
    const m = st.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    if (m) return m[1].trim();
  }
  const a = el.getAttribute(prop);
  return a || null;
}

/** Path → list of closed subpaths (vertex lists). Only straight-line commands. */
function parsePath(d: string): [number, number][][] {
  const toks = d.match(/[MLHVZmlhvz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const subs: [number, number][][] = [];
  let cur: [number, number][] = [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = "";
  let i = 0;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[a-z]/i.test(toks[i])) cmd = toks[i++];
    switch (cmd) {
      case "M": case "m": {
        if (cur.length) subs.push(cur);
        const nx = num(), ny = num();
        x = cmd === "m" ? x + nx : nx; y = cmd === "m" ? y + ny : ny;
        sx = x; sy = y; cur = [[x, y]];
        cmd = cmd === "m" ? "l" : "L"; // implicit lineto
        break;
      }
      case "L": x = num(); y = num(); cur.push([x, y]); break;
      case "l": x += num(); y += num(); cur.push([x, y]); break;
      case "H": x = num(); cur.push([x, y]); break;
      case "h": x += num(); cur.push([x, y]); break;
      case "V": y = num(); cur.push([x, y]); break;
      case "v": y += num(); cur.push([x, y]); break;
      case "Z": case "z":
        if (cur.length) subs.push(cur);
        cur = []; x = sx; y = sy;
        break;
      default:
        throw new Error(`unsupported path command ${cmd}`);
    }
  }
  if (cur.length) subs.push(cur);
  return subs;
}

const EPS = 1e-9;

function uniqSorted(v: number[]): number[] {
  v.sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of v) if (!out.length || x - out[out.length - 1] > EPS) out.push(x);
  return out;
}

/** Nonzero winding number of point against polygons. */
function winding(px: number, py: number, polys: [number, number][][]): number {
  let w = 0;
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i];
      const [x1, y1] = p[(i + 1) % p.length];
      if (y0 <= py) {
        if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) w++;
      } else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) w--;
    }
  }
  return w;
}

/**
 * Splits an orthogonal filled region (in local coords) into axis-aligned unit squares.
 * Greedy: the bottom-most, then left-most filled cell must be a square's lower-left corner.
 */
function fillWithUnitSquares(polys: [number, number][][]): [number, number][] {
  for (const p of polys)
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
      if (Math.abs(x0 - x1) > EPS && Math.abs(y0 - y1) > EPS) throw new Error("non-orthogonal path edge");
    }
  let xs = uniqSorted(polys.flat().map((v) => v[0]));
  let ys = uniqSorted(polys.flat().map((v) => v[1]));
  // filled[j][i] for cell [xs[i],xs[i+1]] × [ys[j],ys[j+1]]
  let filled: boolean[][] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    filled.push([]);
    for (let i = 0; i < xs.length - 1; i++)
      filled[j].push(winding((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2, polys) !== 0);
  }
  const insertX = (x: number) => {
    const i = xs.findIndex((v) => v > x - EPS);
    if (i >= 0 && Math.abs(xs[i] - x) < EPS) return;
    if (i <= 0) throw new Error("square escapes region (x)");
    xs.splice(i, 0, x);
    for (const row of filled) row.splice(i, 0, row[i - 1]);
  };
  const insertY = (y: number) => {
    const j = ys.findIndex((v) => v > y - EPS);
    if (j >= 0 && Math.abs(ys[j] - y) < EPS) return;
    if (j <= 0) throw new Error("square escapes region (y)");
    ys.splice(j, 0, y);
    filled.splice(j, 0, [...filled[j - 1]]);
  };
  const out: [number, number][] = [];
  for (let guard = 0; guard < 10000; guard++) {
    let found: [number, number] | null = null;
    outer: for (let j = 0; j < filled.length; j++)
      for (let i = 0; i < filled[j].length; i++)
        if (filled[j][i]) { found = [i, j]; break outer; }
    if (!found) return out;
    const x0 = xs[found[0]], y0 = ys[found[1]];
    insertX(x0 + 1);
    insertY(y0 + 1);
    for (let j = 0; j < ys.length - 1; j++) {
      if (ys[j] < y0 - EPS || ys[j + 1] > y0 + 1 + EPS) continue;
      for (let i = 0; i < xs.length - 1; i++) {
        if (xs[i] < x0 - EPS || xs[i + 1] > x0 + 1 + EPS) continue;
        if (!filled[j][i]) throw new Error(`region is not a union of unit squares near (${x0}, ${y0})`);
        filled[j][i] = false;
      }
    }
    out.push([x0, y0]);
  }
  throw new Error("fill did not terminate");
}

export interface ParsedSvg {
  s: number;
  squares: Square[];
  comment: string;
}

export function parseSvg(src: string): ParsedSvg {
  // Leading comment holds credits / exact forms.
  const comment = (src.match(/<!--([\s\S]*?)-->/)?.[1] ?? "").trim();

  // Resolve internal DTD entities by hand.
  const ents = new Map<string, string>();
  for (const [, k, v] of src.matchAll(/<!ENTITY\s+(\S+)\s+"([^"]*)"\s*>/g)) ents.set(k, v);
  let body = src.replace(/<!DOCTYPE[\s\S]*?\]>/, "").replace(/<!--[\s\S]*?-->/g, "");
  for (let pass = 0; pass < 5 && /&[\w.]+;/.test(body); pass++)
    body = body.replace(/&([\w.]+);/g, (m, k) => ents.get(k) ?? m);
  body = body.replace(/--/g, "+").replace(/\+-/g, "-").replace(/-\+/g, "-");

  const doc = new DOMParser({ errorHandler: { warning: () => {}, error: () => {} } }).parseFromString(body, "image/svg+xml");
  const root = doc.documentElement;
  const vb = nums(root.getAttribute("viewBox") ?? "");
  if (vb.length !== 4) throw new Error("no viewBox");
  const s = vb[2];
  if (Math.abs(vb[3] - s) > 1e-9) throw new Error("non-square viewBox");

  const byId = new Map<string, Element>();
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const id = all[i].getAttribute("id");
    if (id && !byId.has(id)) byId.set(id, all[i]); // first wins, like browsers
  }

  const squares: Square[] = [];
  const emit = (m: M, lx: number, ly: number) => {
    const det = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(Math.abs(det) - 1) > 1e-6) throw new Error("non-rigid transform on a square");
    const [cx, cy] = apply(m, lx + 0.5, ly + 0.5);
    let a = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    a = ((a % 90) + 90) % 90;
    if (90 - a < 1e-9) a = 0;
    if (a < 1e-9) a = 0;
    squares.push({ x: cx, y: cy, a });
  };

  const walk = (el: Element, m: M, fill: string | null, depth: number) => {
    if (depth > 50) throw new Error("recursion too deep");
    const tag = el.localName;
    if (tag === "defs" || tag === "script" || tag === "style" || tag === "title" || tag === "desc") return;
    const f = styleProp(el, "fill") ?? fill;
    const local = mul(m, parseTransform(el.getAttribute("transform")));
    const filled = f !== "none";
    switch (tag) {
      case "svg":
      case "g":
      case "symbol":
        for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) walk(c as Element, local, f, depth + 1);
        return;
      case "use": {
        const href = (el.getAttribute("xlink:href") || el.getAttribute("href") || "").replace(/^#/, "");
        const target = byId.get(href);
        if (!target) throw new Error(`missing use target #${href}`);
        const x = Number(el.getAttribute("x") || 0), y = Number(el.getAttribute("y") || 0);
        walk(target, mul(local, [1, 0, 0, 1, x, y]), f, depth + 1);
        return;
      }
      case "rect": {
        if (!filled) return;
        const x = Number(el.getAttribute("x") || 0), y = Number(el.getAttribute("y") || 0);
        const w = Number(el.getAttribute("width")), h = Number(el.getAttribute("height"));
        // The container is drawn as a white or id="outer" rect; skip it.
        if (el.getAttribute("id") === "outer" || /^(white|#fff(fff)?)$/i.test(f ?? "")) return;
        const W = Math.round(w), H = Math.round(h);
        if (Math.abs(w - W) > 1e-9 || Math.abs(h - H) > 1e-9) throw new Error(`non-integer rect ${w}×${h}`);
        for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) emit(local, x + i, y + j);
        return;
      }
      case "path":
      case "polygon": {
        if (!filled) return;
        const d = tag === "path" ? el.getAttribute("d") ?? "" : "M" + (el.getAttribute("points") ?? "") + "Z";
        for (const [lx, ly] of fillWithUnitSquares(parsePath(d))) emit(local, lx, ly);
        return;
      }
      default:
        return; // text, line, etc. are decoration
    }
  };
  walk(root, I, null, 0);

  // Flip to math orientation (origin bottom-left, y up) so the stored data reads naturally.
  for (const q of squares) {
    q.x -= vb[0];
    q.y = s - (q.y - vb[1]);
    q.a = q.a === 0 ? 0 : 90 - q.a;
  }
  return { s, squares, comment };
}
