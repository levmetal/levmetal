// Generates the SVG artwork for the profile README and refreshes the
// "Selected work" block from the repos pinned on github.com/levmetal.
//
//   node scripts/build-assets.mjs
//
// Needs a GitHub token to read the pins: $GITHUB_TOKEN (set automatically in
// Actions) or a local `gh auth login`.
//
// GitHub shows README images through <img>, which can't load external fonts,
// so IBM Plex is embedded in every SVG as base64 woff2, subset to just the
// characters that SVG draws.
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets");
const CARDS = join(OUT, "cards");
const USER = "levmetal";
mkdirSync(CARDS, { recursive: true });

/* ------------------------------------------------------------------ colour */
// 60-30-10:
//   60  base     — the near-black canvas and its surfaces
//   30  neutral  — slate text, borders and inactive plates
//   10  accent   — one cyan, plus a deep cyan for its shadows
// Two semantic colours sit outside the ratio and only ever mean one thing:
// violet = the telecom side (L1–L3, the analog signal), green = "it's up".
const C = {
  bg: "#0A0E14",
  panel: "#0F1520",
  raised: "#131B27",
  border: "#1C2531",
  line: "#2A3646",
  text: "#E6EDF3",
  muted: "#8B98A9",
  dim: "#566173",
  accent: "#38E1FF",
  accentDeep: "#0E6577",
  telecom: "#A78BFA",
  ok: "#4ADE80",
};

/* ------------------------------------------------------------------- fonts */
const CACHE = join(ROOT, "scripts", ".fonts");
mkdirSync(CACHE, { recursive: true });

// Returns the woff2 for the closest available weight at or below the one asked for.
async function fontData(pkg, weight) {
  for (let w = weight; w >= 100; w -= 100) {
    const file = join(CACHE, `${pkg}-${w}.woff2`);
    if (existsSync(file)) return readFileSync(file);
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, buf);
    return buf;
  }
  throw new Error(`No woff2 found for ${pkg} ${weight}`);
}

const FACES = {
  LevMono: { pkg: "ibm-plex-mono", weights: [400, 700] },
  LevSans: { pkg: "ibm-plex-sans", weights: [400, 600, 700] },
};
const FONT_DATA = {};
for (const [family, { pkg, weights }] of Object.entries(FACES))
  for (const w of weights) FONT_DATA[`${family}-${w}`] = await fontData(pkg, w);

// The characters an SVG renders: its text nodes, with entities decoded.
const drawnText = (svg) =>
  [...svg.replace(/<style>[\s\S]*?<\/style>/g, "").matchAll(/>([^<]+)</g)].map((m) => m[1]).join("")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

// Only embed the faces an SVG actually uses, subset to the glyphs it draws.
async function fontFaces(svg) {
  const chars = [...new Set(drawnText(svg))].join("");
  const weights = new Set([400, ...[...svg.matchAll(/font-weight="(\d+)"/g)].map((m) => +m[1])]);
  const used = [];
  if (svg.includes('class="mono')) used.push(["LevMono", 400], ["LevMono", 700]);
  if (svg.includes('class="sans')) for (const w of FACES.LevSans.weights) if (weights.has(w)) used.push(["LevSans", w]);
  const faces = await Promise.all(used.map(async ([fam, w]) => {
    const woff2 = await subsetFont(FONT_DATA[`${fam}-${w}`], chars, { targetFormat: "woff2" });
    return `@font-face { font-family: '${fam}'; font-weight: ${w}; src: url(data:font/woff2;base64,${woff2.toString("base64")}) format('woff2'); }`;
  }));
  return faces.join("\n    ");
}

const MONO = "'LevMono','SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const SANS = "'LevSans','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif";
const BASE_CSS = `.mono { font-family: ${MONO}; } .sans { font-family: ${SANS}; }`;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n) => Math.round(n * 100) / 100;

// Writes are queued (font subsetting is async) and awaited at the end.
const PENDING = [];
function write(file, svg) {
  PENDING.push((async () => {
    svg = svg.replace("<style>", `<style>\n    ${await fontFaces(svg)}\n   `);
    writeFileSync(file, svg.trim() + "\n");
    console.log("wrote", file.slice(ROOT.length + 1).replace(/\\/g, "/"));
  })());
}

const gridPattern = (id, size = 40) => `
    <pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">
      <path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#FFFFFF" stroke-opacity="0.03" stroke-width="1"/>
    </pattern>`;

/* ------------------------------------------------------- angular language */
// Shared by every piece so the profile reads as one system (inspired by
// Persona's menus, kept quiet): a single chamfered corner, skewed plates with
// a tonal shadow, slash bars and controller-style status buttons.
const para = (x, y, w, h, slant) =>
  `${f(x + slant)},${y} ${f(x + w + slant)},${y} ${f(x + w)},${y + h} ${f(x)},${y + h}`;
const chamfer = (x, y, w, h, cut) => `${x},${y} ${x + w - cut},${y} ${x + w},${y + cut} ${x + w},${y + h} ${x},${y + h}`;
const cornerAccent = (x, y, w, cut, len = 40) =>
  `<polyline points="${x + w - cut - len},${y + 0.75} ${x + w - cut},${y + 0.75} ${x + w - 0.75},${y + cut} ${x + w - 0.75},${y + cut + len}" fill="none" stroke="${C.accent}" stroke-width="1.5"/>`;
const plateWidth = (text) => text.length * 7.75 + 28;
const kickerPlate = (x, y, text, fill = C.accent, shadow = C.accentDeep) => {
  const w = plateWidth(text);
  return `
  <polygon points="${para(x + 4, y + 4, w, 24, 9)}" fill="${shadow}"/>
  <polygon points="${para(x, y, w, 24, 9)}" fill="${fill}"/>
  <text x="${x + 17}" y="${y + 16.5}" class="mono" font-size="11" font-weight="700" letter-spacing="1.4" fill="${C.bg}">${esc(text)}</text>`;
};
const slashBars = (x, y, w = 74) =>
  `<polygon points="${para(x, y, w, 5, 4)}" fill="${C.accent}"/><polygon points="${para(x + w + 4, y, 18, 5, 4)}" fill="${C.accentDeep}"/>`;
const statusButton = (x, y, kind) => {
  const s = {
    live: { label: "LIVE", col: C.ok, glyph: `<circle class="pulse" r="4" fill="${C.ok}"/>` },
    ci: { label: "CI PASSING", col: C.ok, glyph: `<path d="M -5 0 L -1.5 3.5 L 5 -3.5" fill="none" stroke="${C.ok}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` },
    oss: { label: "OPEN SOURCE", col: C.muted, glyph: `<text y="3.5" text-anchor="middle" class="mono" font-size="9" font-weight="700" fill="${C.muted}">&lt;/&gt;</text>` },
    hire: { label: "OPEN TO FREELANCE &amp; REMOTE", col: C.ok, glyph: `<circle class="pulse" r="4.5" fill="${C.ok}"/>` },
  }[kind];
  return `
  <g transform="translate(${x} ${y})">
    <circle r="13" fill="${C.bg}" stroke="${s.col}" stroke-opacity=".6" stroke-width="1.5"/>
    ${s.glyph}
    <text x="-22" y="4" text-anchor="end" class="mono" font-size="11" font-weight="700" letter-spacing="1.2" fill="${s.col}">${s.label}</text>
  </g>`;
};
const PULSE_CSS = `
    .pulse { animation: pulse 2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
    @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: .35; transform: scale(1.8) } }
    @media (prefers-reduced-motion: reduce) { .pulse, .cursor { animation: none } }`;

// Framed panel used by the full-width pieces.
const panel = (W, H, cut = 32) => `
  <defs>${gridPattern("grid")}
    <clipPath id="frame"><polygon points="${chamfer(0, 0, W, H, cut)}"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="${C.bg}"/>
    <rect width="${W}" height="${H}" fill="url(#grid)"/>
    __BACKDROP__
  </g>
  <polygon points="${chamfer(0.75, 0.75, W - 1.5, H - 1.5, cut)}" fill="none" stroke="${C.border}" stroke-width="1.5"/>
  ${cornerAccent(0, 0, W, cut, 56)}`;

/* ---------------------------------------------------------------- waveform */
// Analog sine -> A/D converter -> digital square wave spelling "LEVI" in ASCII.
function waveform({ x0, x1, cy, amp, adcW = 44 }) {
  const mid = x0 + (x1 - x0) * 0.47;
  const pts = [];
  const cycles = 6.5;
  const sineW = mid - x0;
  for (let i = 0; i <= 260; i++) {
    const t = i / 260;
    const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.35 + 0.65; // gentle AM envelope
    pts.push([x0 + t * sineW, cy - Math.sin(t * cycles * 2 * Math.PI) * amp * env]);
  }
  const adcX = mid + 14;
  const sqStart = adcX + adcW + 14;
  const bits = "LEVI".split("").map((c) => c.charCodeAt(0).toString(2).padStart(8, "0")).join("");
  const bw = (x1 - sqStart) / bits.length;
  const hi = cy - amp * 0.8;
  const lo = cy + amp * 0.8;

  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (const [x, y] of pts.slice(1)) d += ` L ${f(x)} ${f(y)}`;
  // One continuous subpath (the A/D box covers the segment through it): a
  // second "M" would restart the dash pattern and show two pulses at once.
  d += ` L ${f(adcX)} ${f(cy)} L ${f(adcX + adcW)} ${f(cy)} L ${f(sqStart)} ${f(cy)}`;
  let y = bits[0] === "1" ? hi : lo;
  d += ` L ${f(sqStart)} ${f(y)}`;
  for (let i = 0; i < bits.length; i++) {
    const ny = bits[i] === "1" ? hi : lo;
    const x = sqStart + i * bw;
    if (ny !== y) { d += ` L ${f(x)} ${f(ny)}`; y = ny; }
    d += ` L ${f(x + bw)} ${f(y)}`;
  }

  // rough path length for the travelling-pulse dash animation
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  len += (x1 - adcX) + bits.length * amp * 0.8;

  const bitLabels = bits
    .split("")
    .map((b, i) => `<text x="${f(sqStart + i * bw + bw / 2)}" y="${f(lo + 26)}" text-anchor="middle">${b}</text>`)
    .join("");
  const byteLabels = "LEVI"
    .split("")
    .map((ch, i) => `<text x="${f(sqStart + (i * 8 + 4) * bw)}" y="${f(hi - 16)}" text-anchor="middle">0x${ch.charCodeAt(0).toString(16).toUpperCase()} · ${ch}</text>`)
    .join("");

  return { d, len: Math.round(len), adcX, adcW, cy, amp, bitLabels, byteLabels, splitAt: (adcX - x0) / (x1 - x0) };
}

/* ------------------------------------------------------------------ header */
{
  const W = 1200, H = 440;
  const w = waveform({ x0: 64, x1: 1136, cy: 352, amp: 24 });
  // The pulse runs on a normalised path (pathLength=1000) so exactly one light
  // travels left to right, with a gap longer than the whole wave.
  const seg = 55, L = 1000;
  const backdrop = `
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <polygon points="780,${H} 860,${H} ${W + 20},-20 ${W - 60},-20" fill="url(#slash)"/>
    <text transform="translate(${W - 24} 330) skewX(-12)" text-anchor="end" class="sans" font-size="330" font-weight="700" letter-spacing="-14" fill="none" stroke="${C.accent}" stroke-opacity=".07" stroke-width="1.5">LO</text>`;
  write(join(OUT, "header.svg"), `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Levi Oquendo — Web Developer and Telecommunications Engineer">
  <title>Levi Oquendo — Web Developer · Telecommunications Engineer</title>
  <defs>
    <radialGradient id="glow" cx="22%" cy="30%" r="60%">
      <stop offset="0" stop-color="${C.accent}" stop-opacity=".13"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="slash" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0"/><stop offset="1" stop-color="${C.accent}" stop-opacity=".07"/>
    </linearGradient>
    <linearGradient id="wave" x1="0" x2="1">
      <stop offset="0" stop-color="${C.telecom}" stop-opacity=".12"/>
      <stop offset="${f(w.splitAt - 0.02)}" stop-color="${C.telecom}" stop-opacity=".55"/>
      <stop offset="${f(w.splitAt + 0.06)}" stop-color="${C.accent}" stop-opacity=".6"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity=".15"/>
    </linearGradient>
    <filter id="blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <style>
    ${BASE_CSS}
    .cursor { animation: blink 1.1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0 } }${PULSE_CSS}
  </style>
  ${panel(W, H, 36).replace("__BACKDROP__", backdrop)}

  ${statusButton(W - 80, 60, "hire")}

  <text x="64" y="64" class="mono" font-size="15" fill="${C.dim}"><tspan fill="${C.accent}">~/levmetal</tspan> $ whoami<tspan class="cursor" fill="${C.accent}"> ▍</tspan></text>
  <text transform="translate(60 158) skewX(-6)" class="sans" font-size="78" font-weight="700" letter-spacing="-2.5" fill="${C.text}">Levi Oquendo</text>
  <text x="64" y="208" class="sans" font-size="26" font-weight="600" letter-spacing="-.3">
    <tspan fill="${C.accent}">Web Developer</tspan><tspan fill="${C.dim}" dx="10">/</tspan><tspan fill="${C.telecom}" dx="10">Telecommunications Engineer</tspan>
  </text>
  ${slashBars(64, 226)}
  <text x="64" y="262" class="sans" font-size="18" fill="${C.muted}">From the physical layer to the presentation layer.</text>

  <!-- signal: analog (telecom) → A/D → digital "LEVI" (web) -->
  <path d="${w.d}" fill="none" stroke="url(#wave)" stroke-width="2" stroke-linejoin="round"/>
  <path d="${w.d}" fill="none" stroke="${C.accent}" stroke-width="5" stroke-linecap="round" pathLength="${L}" stroke-dasharray="${seg} ${L + seg}" filter="url(#blur)" opacity=".8">
    <animate attributeName="stroke-dashoffset" from="${seg}" to="${-L}" dur="5s" repeatCount="indefinite"/>
  </path>
  <path d="${w.d}" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" pathLength="${L}" stroke-dasharray="${seg} ${L + seg}" opacity=".85">
    <animate attributeName="stroke-dashoffset" from="${seg}" to="${-L}" dur="5s" repeatCount="indefinite"/>
  </path>
  <polygon points="${para(w.adcX - 4, w.cy - 20, w.adcW, 40, 8)}" fill="${C.panel}" stroke="${C.line}"/>
  <text x="${f(w.adcX + w.adcW / 2)}" y="${w.cy + 4}" text-anchor="middle" class="mono" font-size="11" fill="${C.muted}">A/D</text>
  <g class="mono" font-size="10" fill="${C.dim}">${w.bitLabels}</g>
  <g class="mono" font-size="10" fill="${C.dim}" letter-spacing=".5">${w.byteLabels}</g>
  <text x="64" y="${w.cy - 40}" class="mono" font-size="10" fill="${C.dim}" letter-spacing="1.5">ANALOG IN</text>
</svg>`);
}

/* ------------------------------------------------------------- OSI layers */
{
  const W = 1200, rowH = 54, gap = 8, top = 116, x = 96, rw = 836;
  const layers = [
    ["L7", "Application", "React · Next.js · Astro · TypeScript", "web"],
    ["L6", "Presentation", "UI/UX · Tailwind · GSAP · Framer Motion", "web"],
    ["L5", "Session", "Auth · app state (Zustand) · real-time with Socket.io", "web"],
    ["L4", "Transport", "REST APIs · Node.js · Express · serverless functions", "web"],
    ["L3", "Network", "IP addressing · subnetting · routing", "tel"],
    ["L2", "Data Link", "Switching · framing · MAC & link protocols", "tel"],
    ["L1", "Physical", "Signals · modulation · RF & transmission media", "tel"],
  ];
  const H = top + layers.length * (rowH + gap) + 40;
  const yOf = (i) => top + i * (rowH + gap);
  const firstTel = layers.findIndex((l) => l[3] === "tel");
  const colOf = (kind) => (kind === "web" ? C.accent : C.telecom);

  const rows = layers.map(([id, name, detail, kind], i) => {
    const y = yOf(i), col = colOf(kind);
    return `
  <polygon points="${para(x, y, rw, rowH, 10)}" fill="${C.panel}" stroke="${C.border}"/>
  <polygon points="${para(x + 6, y + 14, 4, rowH - 28, 4)}" fill="${col}"/>
  <text x="${x + 24}" y="${y + 33}" class="mono" font-size="14" font-weight="700" fill="${col}">${id}</text>
  <text x="${x + 72}" y="${y + 34}" class="sans" font-size="18" font-weight="600" fill="${C.text}">${esc(name)}</text>
  <text x="${x + 262}" y="${y + 33}" class="mono" font-size="14" fill="${C.muted}">${esc(detail)}</text>`;
  }).join("");

  const bracket = (from, to, col, label, sub) => {
    const y0 = yOf(from) + 4, y1 = yOf(to) + rowH - 4, bx = x + rw + 22, my = (y0 + y1) / 2;
    return `
  <path d="M ${bx} ${y0} h 10 V ${y1} h -10" fill="none" stroke="${col}" stroke-opacity=".6" stroke-width="1.5"/>
  <text x="${bx + 28}" y="${my - 4}" class="mono" font-size="13" font-weight="700" letter-spacing="2" fill="${col}">${label}</text>
  <text x="${bx + 28}" y="${my + 18}" class="sans" font-size="13" fill="${C.dim}">${sub}</text>`;
  };

  const yA = yOf(0), yB = yOf(layers.length - 1), cyA = yA + rowH / 2, cyB = yB + rowH / 2;
  const ease = `calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"`;
  write(join(OUT, "layers.svg"), `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="My stack mapped onto the seven OSI layers: web development from L7 to L4, telecom engineering from L3 to L1">
  <title>The stack, layer by layer</title>
  <defs>
    <linearGradient id="scan" x1="0" x2="1">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${C.accent}" stop-opacity=".09"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bus" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.accent}"/><stop offset="1" stop-color="${C.telecom}"/>
    </linearGradient>
    <filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <style>${BASE_CSS}</style>
  ${panel(W, H, 36).replace("__BACKDROP__", "")}

  ${kickerPlate(x, 30, "THE STACK, LAYER BY LAYER")}
  <text x="${x}" y="88" class="sans" font-size="17" fill="${C.muted}">Telecom taught me how data moves underneath; the web is where I build on top of it.</text>

  <!-- packet bus: encapsulation down, decapsulation up -->
  <line x1="56" y1="${cyA}" x2="56" y2="${cyB}" stroke="url(#bus)" stroke-opacity=".3" stroke-width="2"/>
  ${layers.map(([, , , kind], i) => `<circle cx="56" cy="${yOf(i) + rowH / 2}" r="3" fill="${colOf(kind)}" fill-opacity=".45"/>`).join("")}
  <polygon points="${para(x, yA, rw, rowH, 10)}" fill="url(#scan)">
    <animateTransform attributeName="transform" type="translate" values="0 0;0 ${yB - yA};0 0" dur="7s" repeatCount="indefinite" ${ease}/>
  </polygon>
  ${rows}
  <circle cx="56" cy="${cyA}" r="7" fill="${C.accent}" filter="url(#glow)">
    <animate attributeName="cy" values="${cyA};${cyB};${cyA}" dur="7s" repeatCount="indefinite" ${ease}/>
    <animate attributeName="fill" values="${C.accent};${C.telecom};${C.accent}" dur="7s" repeatCount="indefinite" ${ease}/>
  </circle>
  <circle cx="56" cy="${cyA}" r="4" fill="#FFFFFF">
    <animate attributeName="cy" values="${cyA};${cyB};${cyA}" dur="7s" repeatCount="indefinite" ${ease}/>
  </circle>

  ${bracket(0, firstTel - 1, C.accent, "WEB DEVELOPER", "what I build &amp; ship")}
  ${bracket(firstTel, layers.length - 1, C.telecom, "TELECOM ENG.", "my engineering roots")}
</svg>`);
}

/* ------------------------------------------------------------ project data */
const config = JSON.parse(readFileSync(join(ROOT, "projects.config.json"), "utf8"));

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execSync("gh auth token", { encoding: "utf8" }).trim(); } catch { return null; }
}

const REPO_FIELDS = `name description url homepageUrl
  primaryLanguage { name }
  repositoryTopics(first: 6) { nodes { topic { name } } }
  languages(first: 4, orderBy: { field: SIZE, direction: DESC }) { nodes { name } }
  defaultBranchRef { target { ... on Commit { statusCheckRollup { state } } } }`;

async function fetchRepos() {
  const auth = token();
  if (!auth) throw new Error("No GitHub token: set GITHUB_TOKEN or run `gh auth login`.");
  const query = config.source === "manual"
    ? `{ ${config.repos.map((r, i) => `r${i}: repository(owner: "${USER}", name: "${r}") { ${REPO_FIELDS} }`).join("\n")} }`
    : `{ user(login: "${USER}") { pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { ${REPO_FIELDS} } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${auth}`, "Content-Type": "application/json", "User-Agent": USER },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const repos = config.source === "manual" ? Object.values(json.data).filter(Boolean) : json.data.user.pinnedItems.nodes;
  return repos.slice(0, config.max ?? 6);
}

// Greedy word wrap; the last line gets an ellipsis if the text doesn't fit.
function wrap(text, width, maxLines) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = (line + " " + word).trim();
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length)
    lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s,.;:—-]*\S*$/, "") + "…";
  return lines;
}

function toProject(repo) {
  const o = config.overrides?.[repo.name] ?? {};
  const langs = repo.languages?.nodes?.map((n) => n.name) ?? [];
  const topics = repo.repositoryTopics?.nodes?.map((n) => n.topic.name) ?? [];
  return {
    name: repo.name,
    slug: repo.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: o.title ?? repo.name.replace(/[-_]+/g, " "),
    kicker: (o.kicker ?? `${repo.primaryLanguage?.name ?? "Open"} project`).toUpperCase(),
    lines: wrap(o.description ?? repo.description ?? "", 60, 3),
    chips: (o.chips ?? (topics.length ? topics : langs)).slice(0, 4),
    // "ci" is only claimed while the default branch is actually green.
    status: o.status === "ci"
      ? (repo.defaultBranchRef?.target?.statusCheckRollup?.state === "SUCCESS" ? "ci" : "oss")
      : o.status ?? (repo.homepageUrl ? "live" : "oss"),
    link: o.link ?? repo.homepageUrl ?? repo.url,
  };
}

/* ---------------------------------------------------------- project cards */
// GitHub renders README images as <img>, so real :hover can't run there.
// Instead each card rests in a "lifted" state: a tight dark contact shadow plus
// a faint accent glow that breathes on a slow 6s ease-in-out loop (the calm,
// ~10 breaths/min rhythm of ambient status lights). Cards are offset in phase
// so the grid never pulses in lockstep.
const BREATHE_S = 6;
function card(p, i) {
  const M = { x: 30, top: 18, bottom: 46 };
  const cw = 600, ch = 280, cut = 22;
  const W = cw + M.x * 2, H = ch + M.top + M.bottom;
  const x0 = M.x, y0 = M.top, pad = 36;

  let cx = x0 + pad;
  const chips = p.chips.map((c) => {
    const w = c.length * 7.2 + 28;
    const g = `<polygon points="${para(cx, y0 + 226, w, 26, 7)}" fill="${C.raised}" stroke="${C.border}"/><text x="${f(cx + w / 2 + 3.5)}" y="${y0 + 243}" text-anchor="middle">${esc(c)}</text>`;
    cx += w + 8;
    return g;
  }).join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.title)}">
  <title>${esc(p.title)}</title>
  <defs>
    <filter id="contact" x="-5%" y="-5%" width="110%" height="120%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity=".4"/>
    </filter>
    <filter id="glow" x="-15%" y="-25%" width="130%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
    <radialGradient id="g" cx="100%" cy="0%" r="70%">
      <stop offset="0" stop-color="${C.accent}" stop-opacity=".08"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="c"><polygon points="${chamfer(x0, y0, cw, ch, cut)}"/></clipPath>
  </defs>
  <style>${BASE_CSS}${PULSE_CSS}
    .breathe { animation: breathe ${BREATHE_S}s cubic-bezier(.45,0,.55,1) infinite; animation-delay: -${f((i * BREATHE_S) / 6)}s; }
    @keyframes breathe { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
    @media (prefers-reduced-motion: reduce) { .breathe { animation: none; opacity: .6 } }
  </style>

  <polygon class="breathe" points="${chamfer(x0 + 8, y0 + 12, cw - 16, ch - 8, cut)}" fill="${C.accent}" fill-opacity=".13" filter="url(#glow)"/>
  <polygon points="${chamfer(x0, y0, cw, ch, cut)}" fill="${C.panel}" filter="url(#contact)"/>
  <g clip-path="url(#c)"><rect x="${x0}" y="${y0}" width="${cw}" height="${ch}" fill="url(#g)"/></g>
  <polygon points="${chamfer(x0 + 0.75, y0 + 0.75, cw - 1.5, ch - 1.5, cut)}" fill="none" stroke="${C.border}" stroke-width="1.5"/>
  ${cornerAccent(x0, y0, cw, cut, 34)}

  ${kickerPlate(x0 + pad, y0 + 34, p.kicker)}
  ${statusButton(x0 + cw - 52, y0 + 46, p.status)}

  <text transform="translate(${x0 + pad} ${y0 + 112}) skewX(-8)" class="sans" font-size="30" font-weight="700" letter-spacing="-.6" fill="${C.text}">${esc(p.title)}</text>
  ${slashBars(x0 + pad + 2, y0 + 124, 56)}

  <g class="sans" font-size="15" fill="${C.muted}">
    ${p.lines.map((l, i) => `<text x="${x0 + pad}" y="${y0 + 160 + i * 21}">${esc(l)}</text>`).join("\n    ")}
  </g>
  <g class="mono" font-size="12" fill="${C.text}" fill-opacity=".85">${chips}</g>
</svg>`;
}

const projects = (await fetchRepos()).map(toProject);
const keep = new Set(projects.map((p) => `${p.slug}.svg`));
for (const file of readdirSync(CARDS)) if (!keep.has(file)) unlinkSync(join(CARDS, file));
projects.forEach((p, i) => write(join(CARDS, `${p.slug}.svg`), card(p, i)));

// "Latest work" is the first pinned project with a live site.
const latest = projects.find((p) => p.status === "live") ?? projects[0];

// Rewrite the generated blocks between <!-- NAME:START --> / <!-- NAME:END -->.
{
  const readmePath = join(ROOT, "README.md");
  let readme = readFileSync(readmePath, "utf8");
  const replaceBlock = (name, lines) => {
    const START = `<!-- ${name}:START -->`, END = `<!-- ${name}:END -->`;
    const a = readme.indexOf(START), b = readme.indexOf(END);
    if (a === -1 || b === -1) throw new Error(`README.md is missing the ${name} markers.`);
    readme = readme.slice(0, a) + [START, ...lines, END].join("\n") + readme.slice(b + END.length);
  };
  replaceBlock("LATEST", [
    `  <a href="${latest.link}"><img src="assets/badge-work.svg" height="40" alt="Latest work: ${esc(latest.title)}" /></a>`,
  ]);
  replaceBlock("PROJECTS", [
    `<!-- Generated from your pinned repos by scripts/build-assets.mjs — edit projects.config.json, not this block. -->`,
    `<p align="center">`,
    ...projects.map((p) => `  <a href="${p.link}"><img src="assets/cards/${p.slug}.svg" width="49%" alt="${esc(p.title)} — ${esc(p.lines.join(" "))}" /></a>`),
    `</p>`,
  ]);
  writeFileSync(readmePath, readme);
  console.log(`README: ${projects.length} projects (${config.source}), latest work: ${latest.title}`);
}

/* ----------------------------------------------------------- link badges */
// Angular stand-ins for shields.io: accent label plate with a deep-cyan shadow.
const badges = [
  { file: "badge-linkedin.svg", label: "LINKEDIN", value: "/in/levi-oquendo" },
  { file: "badge-email.svg", label: "EMAIL", value: "levi.oquendo@gmail.com" },
  { file: "badge-work.svg", label: "LATEST WORK", value: `${latest.title} ↗` },
];
for (const b of badges) {
  const H = 40, h = 28, y = 4, slant = 9;
  const lw = plateWidth(b.label) + 2;
  const vw = b.value.length * 7.8 + 30;
  const W = Math.ceil(lw + vw + slant + 10);
  write(join(OUT, b.file), `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.label)}: ${esc(b.value)}">
  <title>${esc(b.label)}: ${esc(b.value)}</title>
  <style>${BASE_CSS}</style>
  <polygon points="${para(lw - 4, y, vw, h, slant)}" fill="${C.bg}" stroke="${C.border}" stroke-width="1.5"/>
  <polygon points="${para(4, y + 4, lw, h, slant)}" fill="${C.accentDeep}"/>
  <polygon points="${para(0, y, lw, h, slant)}" fill="${C.accent}"/>
  <text x="${f(lw / 2 + slant / 2)}" y="${y + 18.5}" text-anchor="middle" class="mono" font-size="11" font-weight="700" letter-spacing="1.4" fill="${C.bg}">${esc(b.label)}</text>
  <text x="${f(lw + vw / 2)}" y="${y + 18.5}" text-anchor="middle" class="mono" font-size="12" fill="${C.text}">${esc(b.value)}</text>
</svg>`);
}

/* ----------------------------------------------------------------- toolbox */
{
  const W = 1200, top = 44, rowH = 30, gap = 22, labelW = 230;
  const groups = [
    ["FRONTEND", ["TypeScript", "JavaScript", "React", "Next.js", "Astro", "Tailwind CSS", "GSAP", "Framer Motion"]],
    ["BACKEND", ["Node.js", "Express", "MongoDB", "REST APIs", "Socket.io", "Serverless"]],
    ["TOOLING", ["Vite", "Vercel", "Git", "GitHub Actions", "Playwright", "Claude Code"]],
    ["SYSTEMS & DESIGN", ["PowerShell", "Linux", "Figma", "Unity"]],
  ];
  const H = top * 2 + groups.length * rowH + (groups.length - 1) * gap;
  const rows = groups.map(([label, items], i) => {
    const y = top + i * (rowH + gap);
    let cx = 64 + labelW;
    const chips = items.map((t) => {
      const cw = t.length * 7.8 + 30;
      const g = `<polygon points="${para(cx, y, cw, rowH, 8)}" fill="${C.panel}" stroke="${C.border}"/><text x="${f(cx + cw / 2 + 4)}" y="${y + 20}" text-anchor="middle">${esc(t)}</text>`;
      cx += cw + 8;
      return g;
    }).join("");
    return `
  <polygon points="${para(64, y + 8, 4, rowH - 16, 4)}" fill="${C.accent}"/>
  <text x="82" y="${y + 20}" class="mono" font-size="12" font-weight="700" letter-spacing="1.6" fill="${C.muted}">${esc(label)}</text>
  <g class="mono" font-size="13" fill="${C.text}" fill-opacity=".9">${chips}</g>`;
  }).join("");
  write(join(OUT, "toolbox.svg"), `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Toolbox — ${esc(groups.map(([l, items]) => `${l}: ${items.join(", ")}`).join("; "))}">
  <title>Toolbox</title>
  <style>${BASE_CSS}</style>
  ${panel(W, H, 28).replace("__BACKDROP__", "")}
  ${rows}
</svg>`);
}

/* ------------------------------------------------------------------ footer */
// A quiet radio beacon: one point emitting soft rings that fade as they expand.
{
  const W = 1200, H = 240, cx = W / 2, cy = 70, dur = 4.8, rings = 3;
  const ease = "0.25 0.6 0.35 1";
  const ring = (i) => {
    const begin = f((dur / rings) * i);
    return `
  <circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="${C.accent}" stroke-width="1.5" opacity="0">
    <animate attributeName="r" values="6;58" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="${ease}"/>
    <animate attributeName="opacity" values="0.55;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="${ease}"/>
    <animate attributeName="stroke-width" values="1.5;0.5" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
  </circle>`;
  };
  const backdrop = `<rect width="${W}" height="${H}" fill="url(#glow)"/>`;
  write(join(OUT, "footer.svg"), `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Let's build something that ships — linkedin.com/in/levi-oquendo · levi.oquendo@gmail.com">
  <title>Let's build something that ships</title>
  <defs>
    <radialGradient id="glow" cx="50%" cy="29%" r="35%">
      <stop offset="0" stop-color="${C.accent}" stop-opacity=".09"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <style>${BASE_CSS}</style>
  ${panel(W, H, 28).replace("__BACKDROP__", backdrop)}
  ${Array.from({ length: rings }, (_, i) => ring(i)).join("")}
  <circle cx="${cx}" cy="${cy}" r="7" fill="${C.accent}" filter="url(#soft)">
    <animate attributeName="opacity" values=".35;.8;.35" dur="${dur / rings}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"/>
  </circle>
  <circle cx="${cx}" cy="${cy}" r="3.5" fill="#FFFFFF"/>
  <text x="${W / 2}" y="160" text-anchor="middle" class="sans" font-size="34" font-weight="700" letter-spacing="-1" fill="${C.text}">Let's build something that ships</text>
  ${slashBars(W / 2 - 50, 174)}
  <text x="${W / 2}" y="206" text-anchor="middle" class="mono" font-size="14" fill="${C.muted}">linkedin.com/in/levi-oquendo  ·  levi.oquendo@gmail.com  ·  EN / ES</text>
</svg>`);
}

await Promise.all(PENDING);
