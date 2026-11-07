import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "katex/dist/katex.min.css";
import "./style.css";
import katex from "katex";
import raw from "./data/packings.json";
import { isTilted } from "./geometry.ts";
import { exportSvg, plateMarkup } from "./plate.ts";
import { notes } from "./notes.ts";
import type { Dataset, Entry } from "./types.ts";

const data = raw as unknown as Dataset;
const byN = new Map(data.entries.map((e) => [e.n, e]));
const allN = data.entries.map((e) => e.n);
const STRIP_MAX = 324;

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- formatting ----------

/** 4.675530093604551 → "4.675 530 093 6" (digits grouped in threes, as in printed tables). */
function grouped(x: number, digits = 10): string {
  if (Number.isInteger(x)) return String(x);
  const [i, f] = x.toFixed(digits).split(".");
  return `${i}.${f.replace(/(\d{3})(?=\d)/g, "$1 ")}`;
}
const fmt = (x: number, d = 4) => (Number.isInteger(x) ? String(x) : x.toFixed(d));

const statusText: Record<Entry["status"], string> = {
  proven: "Proved optimal",
  open: "Best known; not proved optimal",
  trivial: "Grid packing; nothing better known",
};
const statusMark: Record<Entry["status"], string> = { proven: "∎", open: "□", trivial: "▦" };

function renderTex(tex: string, display = false): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: display, macros: { "\\Nn": "#1" } });
  } catch {
    return esc(tex);
  }
}

/** Catalog writes algebraic numbers of high degree as {}^{d}🔒. */
function exactForm(e: Entry): { html: string; degree?: number } | null {
  if (!e.latexShort) return null;
  const lock = e.latexShort.match(/\{\}\^\{(\d+)\}🔒/);
  if (lock) return { html: "", degree: Number(lock[1]) };
  // Drop the trailing "= decimal" part; the big number already shows it.
  const tex = e.latexShort
    .replace(/\\begin\{aligned\}|\\end\{aligned\}|&|\\\\/g, "")
    .replace(/=\s*\\Nn\{[^}]*\}\s*$/, "")
    .trim();
  if (/^s\s*=\s*[\d.]+$/.test(tex)) return null; // just an integer
  return { html: renderTex(tex) };
}

// ---------- state ----------

interface View {
  n: number;
  variant: number;
  compare: boolean;
}
const view: View = { n: 17, variant: 0, compare: false };

function parseHash(): "gallery" | number {
  const h = location.hash.replace(/^#\/?/, "");
  if (h === "gallery") return "gallery";
  const n = Number(h);
  return byN.has(n) ? n : 17;
}

// ---------- app shell ----------

const app = $("#app");
app.innerHTML = `
<header class="mast">
  <a class="brand" href="#17">
    <svg viewBox="0 0 10 10" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9"/><rect x="1.5" y="1.5" width="3" height="3"/><rect x="5" y="2.2" width="3" height="3" transform="rotate(32 6.5 3.7)"/><rect x="1.5" y="5.5" width="3" height="3"/></svg>
    <span>Squares in a square</span>
  </a>
  <nav>
    <a href="#17" data-nav="plate">Plate</a>
    <a href="#gallery" data-nav="gallery">All packings</a>
    <button class="theme" type="button" aria-label="Switch colour theme" title="Switch colour theme"></button>
  </nav>
</header>
<main id="main"></main>
`;

// ---------- theme ----------
const themes = ["system", "light", "dark"] as const;
type Theme = (typeof themes)[number];
let theme: Theme = "system";
try { theme = (localStorage.getItem("theme") as Theme) || "system"; } catch {}
function applyTheme() {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const b = $(".theme");
  b.textContent = theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark";
}
$(".theme").addEventListener("click", () => {
  theme = themes[(themes.indexOf(theme) + 1) % themes.length];
  try { localStorage.setItem("theme", theme); } catch {}
  applyTheme();
});
applyTheme();

// ---------- detail view ----------

function detailShell() {
  $("#main").innerHTML = `
<section class="detail">
  <div class="stage" tabindex="0" aria-label="Packing diagram. Scroll to zoom, drag to pan, 0 to reset.">
    <div class="plate-wrap"></div>
    <div class="tip" hidden></div>
    <div class="zoom">
      <button type="button" data-z="in" aria-label="Zoom in">+</button>
      <button type="button" data-z="out" aria-label="Zoom out">−</button>
      <button type="button" data-z="reset" aria-label="Reset view">Fit</button>
    </div>
    <p class="legend"></p>
  </div>
  <aside class="facts"></aside>
</section>
<section class="strip-wrap" aria-label="Every n from 1 to ${STRIP_MAX}">
  <div class="strip-head">
    <p>How much each packing exceeds the area bound √n. Click or drag to move between n.</p>
    <p class="strip-key"><span class="k st-proven"></span>proved <span class="k st-open"></span>open <span class="k st-trivial"></span>grid</p>
  </div>
  <svg class="strip" preserveAspectRatio="none"></svg>
  <div class="strip-tip" hidden></div>
</section>`;
  buildStrip();
  wireStage();
}

function renderDetail() {
  if (!$(".detail")) detailShell();
  const e = byN.get(view.n)!;
  view.variant = Math.min(view.variant, e.variants.length - 1);
  const v = e.variants[view.variant];
  const k = Math.ceil(Math.sqrt(e.n - 1e-9));
  const tilted = v.squares.filter(isTilted).length;
  const waste = v.s * v.s - e.n;
  const ex = exactForm(e);
  const note = notes[e.n];
  const idx = allN.indexOf(e.n);
  const prev = allN[idx - 1], next = allN[idx + 1];

  $(".legend").innerHTML =
    (tilted ? `<span><i class="k k-tilt"></i>tilted</span>` : "") +
    `<span><i class="k k-flat"></i>axis-aligned</span>` +
    (v.spare.length ? `<span><i class="k k-spare"></i>unused slot</span>` : "");
  const rigid = e.credit.some((c) => /^Rigid\.?$/.test(c));
  const credits = e.credit.filter((c) => !/^Rigid\.?$/.test(c));
  $(".plate-wrap").innerHTML = plateMarkup({ s: v.s, squares: v.squares, spare: v.spare, gridBox: view.compare ? k : null });
  resetZoom();

  $(".facts").innerHTML = `
<div class="nrow">
  <a class="step" ${prev ? `href="#${prev}"` : 'aria-disabled="true"'} aria-label="Previous n" title="Previous (←)">‹</a>
  <label class="nfield"><span class="sr">Number of squares</span><span aria-hidden="true">n =</span>
    <input type="text" inputmode="numeric" value="${e.n}" style="width:${String(e.n).length + 0.4}ch" aria-label="Number of squares" title="Type a number and press Enter (/)"/>
  </label>
  <a class="step" ${next ? `href="#${next}"` : 'aria-disabled="true"'} aria-label="Next n" title="Next (→)">›</a>
</div>
<p class="side"><i>s</i> = ${grouped(v.s)}${Number.isInteger(v.s) ? "" : "…"}</p>
<p class="status st-${e.status}"><span class="mark" aria-hidden="true">${statusMark[e.status]}</span>${statusText[e.status]}</p>
${rigid ? `<p class="rigid">Rigid: no square can move, even slightly.</p>` : ""}
${
  ex
    ? ex.degree
      ? `<div class="exact"><p>Exact value: a root of a degree-${ex.degree} polynomial.</p>${
          e.latexPoly ? `<details><summary>Show the polynomial</summary><div class="poly">${e.latexPoly.length < 6000 ? renderTex(e.latexPoly, true) : `<code>${esc(e.latexPoly)}</code>`}</div></details>` : ""
        }</div>`
      : `<div class="exact">${ex.html}</div>`
    : ""
}
${note ? `<p class="note">${esc(note)}</p>` : ""}
${e.sharedWith ? `<p class="shared">The catalog shows one picture for n = ${e.sharedWith.join(" and ")}${v.spare.length ? `; this n leaves ${v.spare.length === 1 ? "one slot" : `${v.spare.length} slots`} empty` : ""}.</p>` : ""}
<dl class="stats">
  <div><dt>Area bound √n</dt><dd>${fmt(Math.sqrt(e.n))}</dd></div>
  <div><dt>Grid ⌈√n⌉</dt><dd>${k}</dd></div>
  <div><dt>Saved vs grid</dt><dd>${k - v.s < 1e-9 ? "—" : fmt(k - v.s)}</dd></div>
  <div><dt>Empty area</dt><dd>${fmt(waste, 3)} <small>(${((waste / (v.s * v.s)) * 100).toFixed(1)}%)</small></dd></div>
  <div><dt>Tilted squares</dt><dd>${tilted} of ${e.n}</dd></div>
</dl>
${
  v.issues.length
    ? `<p class="warn">This packing failed the geometry check: ${esc(v.issues.slice(0, 3).map((i) => i.detail).join("; "))}. The data may be wrong.</p>`
    : ""
}
<div class="controls">
  ${
    k > v.s + 1e-9
      ? `<label class="check"><input type="checkbox" data-act="compare" ${view.compare ? "checked" : ""}/> Overlay the ${k} × ${k} grid <kbd>c</kbd></label>`
      : ""
  }
  ${
    e.variants.length > 1
      ? `<div class="variants" role="group" aria-label="Equally good packings">${e.variants
          .map((_, i) => `<button type="button" data-variant="${i}" aria-pressed="${i === view.variant}">${i === 0 ? "Pictured" : "Alternative"}</button>`)
          .join("")}</div>`
      : ""
  }
</div>
<ul class="credits">${credits.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
<div class="actions">
  <button type="button" data-act="copy">Copy coordinates</button>
  <button type="button" data-act="svg">Download SVG</button>
  <a href="${esc(v.file ? e.source.replace(/[^/]+$/, v.file) : e.source)}" target="_blank" rel="noopener">Open in catalog</a>
</div>
${v.comment ? `<details class="source"><summary>Source notes from the SVG</summary><pre>${esc(v.comment)}</pre></details>` : ""}
<p class="toast" role="status" aria-live="polite"></p>`;

  wireFacts(e);
  markStrip();
  document.title = `n = ${e.n} · Squares in a square`;
}

function wireFacts(e: Entry) {
  const f = $(".facts");
  const input = $<HTMLInputElement>("input[type=text]", f);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      const n = Number(input.value);
      if (byN.has(n)) go(n);
      else {
        input.setCustomValidity("x");
        toast(`No packing for n = ${input.value}. Try 1–${STRIP_MAX}, or a larger n from the gallery.`);
      }
    }
    ev.stopPropagation();
  });
  input.addEventListener("input", () => {
    input.setCustomValidity("");
    input.style.width = `${Math.max(1, input.value.length) + 0.4}ch`;
  });
  input.addEventListener("focus", () => input.select());
  f.querySelector('[data-act="compare"]')?.addEventListener("change", (ev) => {
    view.compare = (ev.target as HTMLInputElement).checked;
    renderDetail();
  });
  f.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach((b) =>
    b.addEventListener("click", () => {
      view.variant = Number(b.dataset.variant);
      renderDetail();
    }),
  );
  const v = () => e.variants[view.variant];
  $('[data-act="copy"]', f).addEventListener("click", async () => {
    const json = JSON.stringify(
      { n: e.n, s: v().s, convention: "unit squares; centre (x, y) from the bottom-left corner; angle in degrees", squares: v().squares },
      null,
      1,
    );
    try {
      await navigator.clipboard.writeText(json);
      toast(`Copied ${e.n} squares as JSON.`);
    } catch {
      toast("Clipboard is blocked here; use Download SVG instead.");
    }
  });
  $('[data-act="svg"]', f).addEventListener("click", () => {
    const blob = new Blob([exportSvg(v().s, v().squares)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `squares-in-square-${e.n}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Downloaded.");
  });
}

let toastTimer = 0;
function toast(msg: string) {
  const t = $(".toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("on"), 2600);
}

// ---------- zoom / pan / hover ----------

let zoom = { k: 1, x: 0, y: 0 };
function applyZoom() {
  const svg = $(".plate-wrap svg") as SVGSVGElement | null;
  if (svg) svg.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.k})`;
  $(".stage").classList.toggle("zoomed", zoom.k > 1.001);
}
function resetZoom() {
  zoom = { k: 1, x: 0, y: 0 };
  applyZoom();
}
function zoomAt(factor: number, cx: number, cy: number) {
  const k = Math.min(40, Math.max(1, zoom.k * factor));
  const f = k / zoom.k;
  zoom = { k, x: cx - (cx - zoom.x) * f, y: cy - (cy - zoom.y) * f };
  if (k === 1) zoom = { k: 1, x: 0, y: 0 };
  applyZoom();
}

function wireStage() {
  const stage = $(".stage");
  const wrap = $(".plate-wrap");
  const tip = $(".tip");
  const center = () => {
    const r = wrap.getBoundingClientRect();
    return [r.width / 2, r.height / 2] as const;
  };
  wrap.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    },
    { passive: false },
  );
  let drag: { x: number; y: number; zx: number; zy: number } | null = null;
  wrap.addEventListener("pointerdown", (ev) => {
    if (zoom.k <= 1) return;
    drag = { x: ev.clientX, y: ev.clientY, zx: zoom.x, zy: zoom.y };
    wrap.setPointerCapture(ev.pointerId);
    stage.classList.add("dragging");
  });
  wrap.addEventListener("pointermove", (ev) => {
    if (drag) {
      zoom.x = drag.zx + ev.clientX - drag.x;
      zoom.y = drag.zy + ev.clientY - drag.y;
      applyZoom();
      return;
    }
    const t = ev.target as Element;
    if (t instanceof SVGPolygonElement && t.classList.contains("sq")) {
      const i = Number(t.dataset.i);
      const e = byN.get(view.n)!;
      const q = e.variants[view.variant].squares[i];
      wrap.querySelector(".hot")?.classList.remove("hot");
      t.classList.add("hot");
      tip.innerHTML = `<b>Square ${i + 1}</b><span>centre (${q.x.toFixed(5)}, ${q.y.toFixed(5)})</span><span>${q.a === 0 ? "not tilted" : `tilted ${q.a.toFixed(5)}°`}</span>`;
      const r = stage.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      tip.style.left = `${Math.min(x + 16, r.width - 200)}px`;
      tip.style.top = `${Math.max(8, y - 64)}px`;
      tip.hidden = false;
    } else hideTip();
  });
  const hideTip = () => {
    tip.hidden = true;
    wrap.querySelector(".hot")?.classList.remove("hot");
  };
  wrap.addEventListener("pointerleave", hideTip);
  wrap.addEventListener("pointerup", () => {
    drag = null;
    stage.classList.remove("dragging");
  });
  wrap.addEventListener("dblclick", resetZoom);
  stage.querySelectorAll<HTMLButtonElement>("[data-z]").forEach((b) =>
    b.addEventListener("click", () => {
      const [cx, cy] = center();
      if (b.dataset.z === "in") zoomAt(1.6, cx, cy);
      else if (b.dataset.z === "out") zoomAt(1 / 1.6, cx, cy);
      else resetZoom();
    }),
  );
}

// ---------- strip chart ----------

function buildStrip() {
  const svg = $<SVGSVGElement>(".strip");
  const H = 60;
  svg.setAttribute("viewBox", `0 0 ${STRIP_MAX} ${H}`);
  let bars = "";
  for (let n = 1; n <= STRIP_MAX; n++) {
    const e = byN.get(n)!;
    const ex = e.s - Math.sqrt(n);
    const h = Math.max(1.2, ex * (H - 4));
    bars += `<rect class="bar st-${e.status}" data-n="${n}" x="${n - 1 + 0.12}" y="${H - h}" width="0.76" height="${h}"/>`;
  }
  svg.innerHTML = `<rect class="cursor" x="0" y="0" width="1" height="${H}"/>${bars}`;
  const tip = $(".strip-tip");
  const nAt = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return Math.min(STRIP_MAX, Math.max(1, Math.floor(((ev.clientX - r.left) / r.width) * STRIP_MAX) + 1));
  };
  let scrubbing = false;
  svg.addEventListener("pointerdown", (ev) => {
    scrubbing = true;
    svg.setPointerCapture(ev.pointerId);
    go(nAt(ev), true);
  });
  svg.addEventListener("pointermove", (ev) => {
    const n = nAt(ev);
    const e = byN.get(n)!;
    const r = svg.getBoundingClientRect();
    tip.textContent = `n = ${n}, s = ${fmt(e.s)}`;
    tip.style.left = `${Math.min(r.width - 120, Math.max(0, ev.clientX - r.left - 50))}px`;
    tip.hidden = false;
    if (scrubbing && n !== view.n) go(n, true);
  });
  svg.addEventListener("pointerup", () => (scrubbing = false));
  svg.addEventListener("pointerleave", () => (tip.hidden = true));
}
function markStrip() {
  const c = document.querySelector(".strip .cursor");
  if (!c) return;
  c.setAttribute("x", String(view.n - 1));
  c.toggleAttribute("hidden", view.n > STRIP_MAX);
}

// ---------- gallery ----------

type Filter = "all" | "nontrivial" | "open" | "proven";
let filter: Filter = "nontrivial";
try { filter = (localStorage.getItem("filter") as Filter) || "nontrivial"; } catch {}

const filterLabels: Record<Filter, string> = { nontrivial: "Not a plain grid", open: "Open", proven: "Proved", all: "Every n" };

function renderGallery() {
  const keep = (e: Entry) =>
    filter === "all" ? true : filter === "nontrivial" ? e.variants[0].squares.some(isTilted) || !Number.isInteger(e.s) : e.status === filter;
  const list = data.entries.filter(keep);
  const small = list.filter((e) => e.n <= STRIP_MAX);
  const big = list.filter((e) => e.n > STRIP_MAX);
  const card = (e: Entry) => `
<a class="card st-${e.status}${e.n === view.n ? " current" : ""}" href="#${e.n}" data-n="${e.n}">
  <div class="thumb" data-n="${e.n}"></div>
  <span class="cn">${e.n}</span><span class="cs">${fmt(e.s)}</span><span class="cm" title="${statusText[e.status]}">${statusMark[e.status]}</span>
</a>`;
  $("#main").innerHTML = `
<section class="gallery">
  <div class="ghead">
    <h1>Best known packings, n = 1 to ${STRIP_MAX}</h1>
    <p>Each plate is the smallest square anyone has found that holds n unit squares. A tombstone ∎ marks a packing proved optimal; a hollow □ marks one that might still be beaten.</p>
    <div class="filters" role="group" aria-label="Show">
      ${(Object.keys(filterLabels) as Filter[]).map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === filter}">${filterLabels[f]}</button>`).join("")}
      <span class="count">${list.length} shown</span>
    </div>
  </div>
  <div class="grid">${small.map(card).join("")}</div>
  ${big.length ? `<h2>Larger cases</h2><p class="sub">A few much larger n the catalog records because they beat the grid in unusual ways.</p><div class="grid">${big.map(card).join("")}</div>` : ""}
</section>`;
  document.querySelectorAll<HTMLButtonElement>("[data-f]").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.f as Filter;
      try { localStorage.setItem("filter", filter); } catch {}
      renderGallery();
    }),
  );
  // Draw thumbnails lazily; the big ones have thousands of squares.
  const io = new IntersectionObserver(
    (items) => {
      for (const it of items) {
        if (!it.isIntersecting) continue;
        const el = it.target as HTMLElement;
        const e = byN.get(Number(el.dataset.n))!;
        el.innerHTML = plateMarkup({ s: e.s, squares: e.variants[0].squares, spare: e.variants[0].spare, thumb: true });
        io.unobserve(el);
      }
    },
    { rootMargin: "400px" },
  );
  document.querySelectorAll(".thumb").forEach((t) => io.observe(t));
  document.title = "All packings · Squares in a square";
  document.querySelector(".card.current")?.scrollIntoView({ block: "center" });
}

// ---------- routing & keys ----------

function go(n: number, replace = false) {
  if (replace) history.replaceState(null, "", `#${n}`);
  else location.hash = `#${n}`;
  if (replace) route();
}

function route() {
  const r = parseHash();
  document.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) =>
    a.setAttribute("aria-current", String((r === "gallery") === (a.dataset.nav === "gallery"))),
  );
  if (r === "gallery") {
    renderGallery();
    return;
  }
  if (r !== view.n) view.variant = 0;
  view.n = r;
  ($<HTMLAnchorElement>('[data-nav="plate"]')).href = `#${r}`;
  renderDetail();
}

window.addEventListener("hashchange", route);
window.addEventListener("keydown", (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if ((ev.target as HTMLElement).matches("input, textarea")) return;
  const inDetail = !!$(".detail");
  const idx = allN.indexOf(view.n);
  if (inDetail && (ev.key === "ArrowRight" || ev.key === "j") && allN[idx + 1]) go(allN[idx + 1]);
  else if (inDetail && (ev.key === "ArrowLeft" || ev.key === "k") && allN[idx - 1]) go(allN[idx - 1]);
  else if (ev.key === "g") location.hash = inDetail ? "#gallery" : `#${view.n}`;
  else if (ev.key === "Escape" && !inDetail) location.hash = `#${view.n}`;
  else if (inDetail && ev.key === "/") {
    ev.preventDefault();
    $<HTMLInputElement>(".nfield input").focus();
  } else if (inDetail && ev.key === "c") {
    const b = $<HTMLInputElement>('[data-act="compare"]');
    if (b) { view.compare = !view.compare; renderDetail(); }
  } else if (inDetail && ev.key === "0") resetZoom();
  else return;
  ev.preventDefault();
});

if (!location.hash) history.replaceState(null, "", "#17");
route();
