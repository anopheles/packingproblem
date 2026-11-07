// Unit squares described by centre + rotation (degrees). Container is [0, s]².

export interface Square {
  x: number;
  y: number;
  /** rotation in degrees, counter-clockwise */
  a: number;
}

export interface Packing {
  n: number;
  /** best known side length */
  s: number;
  proven: boolean;
  credit: string;
  year?: number;
  note?: string;
  squares: Square[];
}

type Pt = [number, number];

export function corners(q: Square): Pt[] {
  const t = (q.a * Math.PI) / 180;
  const c = Math.cos(t) / 2;
  const s = Math.sin(t) / 2;
  // half-diagonal vectors
  return [
    [q.x + c - s, q.y + s + c],
    [q.x - c - s, q.y - s + c],
    [q.x - c + s, q.y - s - c],
    [q.x + c + s, q.y + s - c],
  ];
}

function project(pts: Pt[], ax: Pt): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of pts) {
    const d = x * ax[0] + y * ax[1];
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}

/** Overlap depth between two unit squares via separating axis theorem. ≤ 0 means disjoint/touching. */
export function overlapDepth(p: Square, q: Square): number {
  const P = corners(p);
  const Q = corners(q);
  let min = Infinity;
  for (const a of [p.a, q.a]) {
    const t = (a * Math.PI) / 180;
    for (const ax of [
      [Math.cos(t), Math.sin(t)],
      [-Math.sin(t), Math.cos(t)],
    ] as Pt[]) {
      const [a0, a1] = project(P, ax);
      const [b0, b1] = project(Q, ax);
      const d = Math.min(a1, b1) - Math.max(a0, b0);
      if (d < min) min = d;
    }
  }
  return min;
}

/** How far a square sticks out of [0,s]² (≤ 0 means inside). */
export function protrusion(q: Square, s: number): number {
  let worst = -Infinity;
  for (const [x, y] of corners(q)) {
    worst = Math.max(worst, -x, -y, x - s, y - s);
  }
  return worst;
}

export interface Issue {
  kind: "overlap" | "outside" | "count";
  detail: string;
}

export function validate(p: Packing, tol = 1e-4): Issue[] {
  const issues: Issue[] = [];
  if (p.squares.length !== p.n) {
    issues.push({ kind: "count", detail: `expected ${p.n} squares, got ${p.squares.length}` });
  }
  p.squares.forEach((q, i) => {
    const o = protrusion(q, p.s);
    if (o > tol) issues.push({ kind: "outside", detail: `square ${i} sticks out by ${o.toExponential(2)}` });
  });
  for (let i = 0; i < p.squares.length; i++) {
    for (let j = i + 1; j < p.squares.length; j++) {
      const d = overlapDepth(p.squares[i], p.squares[j]);
      if (d > tol) issues.push({ kind: "overlap", detail: `squares ${i} & ${j} overlap by ${d.toExponential(2)}` });
    }
  }
  return issues;
}

export const isTilted = (q: Square) => Math.abs(((q.a % 90) + 90) % 90) > 1e-6 && Math.abs((((q.a % 90) + 90) % 90) - 90) > 1e-6;
