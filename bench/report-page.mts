import { scenarios } from './scenarios.mts'

/** A page to explore one run: a ranked bar chart per question, with a table under it. */
import type { Calibration } from './calibrate.mts'
import type { Point } from './report.mts'
import type { Results } from './run.mts'

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function page(results: Results, calibration: Calibration | null, points: Point[]): string {
  const env = results.environment
  const data = {
    points,
    scenarios: Object.fromEntries(
      scenarios.map((s) => [s.id, { title: s.title, measures: s.measures.replaceAll('`', '') }]),
    ),
    calibration,
  }
  // `</script>` cannot occur in JSON.stringify output once `<` is escaped.
  const json = JSON.stringify(data).replaceAll('<', '\\u003c')
  const subtitle = `${env.cpu}, ${env.cores} cores · ${env.os} · Node.js ${env.node} · Bun ${env.bun} · ${new Date(results.startedAt).toLocaleDateString('en-CA')}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Navios benchmark</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e;
  --muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --navios: #2a78d6; --navios1: #86b6ef; --nest: #eb6834; --library: #1baf7a; --floor: #898781;
  --warn: #fab219;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --page: #0d0d0d; --surface-1: #1a1a19; --text-primary: #f0efec; --text-secondary: #c3c2b7;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --navios: #3987e5; --navios1: #1c5cab; --nest: #d95926; --library: #199e70; --floor: #6d6c67;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface-1: #1a1a19; --text-primary: #f0efec; --text-secondary: #c3c2b7;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
  --navios: #3987e5; --navios1: #1c5cab; --nest: #d95926; --library: #199e70; --floor: #6d6c67;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--text-primary);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
.viz-root { background: var(--page); color: var(--text-primary); min-height: 100vh; padding: 24px 16px 48px; }
main { max-width: 980px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; font-weight: 600; }
.sub { color: var(--text-secondary); margin: 0 0 20px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: end; margin-bottom: 16px; }
label { display: grid; gap: 2px; font-size: 12px; color: var(--text-secondary); }
select { font: inherit; color: var(--text-primary); background: var(--surface-1);
  border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; min-width: 120px; }
.card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.card h2 { font-size: 15px; margin: 0; font-weight: 600; }
.card p { margin: 2px 0 12px; color: var(--text-secondary); font-size: 13px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
svg { display: block; width: 100%; height: auto; overflow: visible; }
svg text { fill: var(--text-secondary); font-size: 12px; }
svg .value { fill: var(--text-primary); font-variant-numeric: tabular-nums; }
svg .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.row:hover .bar, .row:focus .bar { filter: brightness(1.12); }
.row:focus { outline: none; }
.row:focus .hit { stroke: var(--text-primary); stroke-width: 1; }
#tip { position: fixed; pointer-events: none; background: var(--surface-1); color: var(--text-primary);
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12); opacity: 0; transition: opacity .08s; max-width: 300px; z-index: 2; }
#tip b { font-weight: 600; }
#tip .muted { color: var(--text-secondary); }
details { margin-top: 12px; }
summary { cursor: pointer; color: var(--text-secondary); font-size: 13px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 8px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--grid); }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
.empty { color: var(--text-secondary); padding: 24px 0; }
.note { color: var(--text-secondary); font-size: 12px; margin-top: 16px; }
.flag { color: var(--text-primary); }
.flag::before { content: "⚠ "; color: var(--warn); }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <h1>Navios benchmark</h1>
  <p class="sub">${escape(subtitle)}</p>
  <div class="filters" role="group" aria-label="What to show">
    <label>Question <select id="suite"></select></label>
    <label>Measure <select id="metric"></select></label>
    <label><span id="variant-label">Scenario</span> <select id="variant"></select></label>
    <label>Validation <select id="mode"></select></label>
    <label>Runtime <select id="runtime">
      <option value="all">Node.js and Bun</option><option value="node">Node.js</option><option value="bun">Bun</option>
    </select></label>
  </div>
  <section class="card" aria-labelledby="title">
    <h2 id="title"></h2>
    <p id="explain"></p>
    <div class="legend" id="legend"></div>
    <div id="chart"></div>
    <details><summary>Table</summary><div id="table"></div></details>
  </section>
  <p class="note">Bars are medians of the rounds; the whisker spans the lowest and the highest round. ⚠ marks a measurement with a warning: a server that was not saturated, a driver that might have been, or an unexpected status.</p>
</main>
</div>
<div id="tip" role="tooltip"></div>
<script>
const DATA = ${json};
const FAMILIES = [
  ['navios', 'Navios 2'], ['navios1', 'Navios 1'], ['nest', 'Nest'], ['library', 'Libraries'], ['floor', 'No framework'],
];
const SUITES = {
  throughput: { title: 'Throughput', variant: 'Scenario', metrics: { rps: 'Requests per second', cpu: 'CPU per request', p99: 'p99 latency at saturation' } },
  latency: { title: 'Latency at a fixed rate', variant: 'Rate', metrics: { p50: 'p50 latency', p99: 'p99 latency', p999: 'p99.9 latency', cpu: 'CPU per request' } },
  connections: { title: 'Connections', variant: 'Connections', metrics: { rps: 'Requests per second', p99: 'p99 latency' } },
  startup: { title: 'Startup', variant: 'Packaging', metrics: { ms: 'Time to the first answer' } },
  memory: { title: 'Memory', variant: 'Load', metrics: { idleMiB: 'Idle', peakMiB: 'Peak under load', settledMiB: 'After load' } },
};
const $ = (id) => document.getElementById(id);
const nf = (v, d) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const fmt = (v) => v === 0 ? '0' : v >= 100000 ? nf(v / 1000, 0) + 'k' : v >= 10000 ? nf(v / 1000, 1) + 'k' : v >= 100 ? nf(v, 0) : v >= 10 ? nf(v, 1) : nf(v, 2);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
const runtimeName = (r) => r === 'node' ? 'Node.js' : 'Bun';

function options(select, values, keep) {
  const current = keep ?? select.value;
  select.innerHTML = values.map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + '</option>').join('');
  if (values.some(([v]) => v === current)) select.value = current;
}
function variantName(suite, v) {
  if (suite === 'throughput') return v === 'mix' ? 'The weighted mix' : (DATA.scenarios[v]?.title ?? v);
  if (suite === 'latency' || suite === 'memory') return Number(v) / 1000 + 'k requests/s';
  if (suite === 'connections') return v + (v === '1' ? ' connection' : ' connections');
  return v;
}
function variantOrder(suite, values) {
  if (suite === 'throughput') {
    const order = Object.keys(DATA.scenarios).concat('mix');
    return values.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  if (suite === 'startup') return values.sort((a, b) => ['modules', 'bundle', 'executable'].indexOf(a) - ['modules', 'bundle', 'executable'].indexOf(b));
  return values.sort((a, b) => Number(a) - Number(b));
}

function refresh(changed) {
  const suite = $('suite').value;
  const here = DATA.points.filter((p) => p.suite === suite);
  const metrics = Object.entries(SUITES[suite].metrics).filter(([m]) => here.some((p) => p.metric === m));
  options($('metric'), metrics, changed === 'suite' ? metrics[0][0] : undefined);
  const variants = variantOrder(suite, [...new Set(here.map((p) => p.variant))]);
  options($('variant'), variants.map((v) => [v, variantName(suite, v)]), changed === 'suite' ? (variants.includes('param') ? 'param' : variants[0]) : undefined);
  $('variant-label').textContent = SUITES[suite].variant;
  const modes = ['full', 'request'].filter((m) => here.some((p) => p.mode === m));
  options($('mode'), modes.map((m) => [m, m === 'full' ? 'Requests and responses' : 'Requests only']), changed === 'suite' ? modes[0] : undefined);
  $('mode').disabled = modes.length < 2;
  draw();
}

function draw() {
  const suite = $('suite').value, metric = $('metric').value, variant = $('variant').value;
  const mode = $('mode').value, runtime = $('runtime').value;
  const rows = DATA.points.filter((p) => p.suite === suite && p.metric === metric && p.variant === variant
    && (suite === 'startup' || suite === 'memory' || p.mode === mode) && (runtime === 'all' || p.runtime === runtime));
  const first = rows[0];
  const better = first?.better ?? 'higher';
  rows.sort((a, b) => better === 'higher' ? b.median - a.median : a.median - b.median);
  $('title').textContent = SUITES[suite].metrics[metric] + ' · ' + variantName(suite, variant);
  $('explain').textContent = first ? first.unit + ', ' + (better === 'higher' ? 'higher' : 'lower') + ' is better.' + (suite === 'throughput' && DATA.scenarios[variant] ? ' ' + DATA.scenarios[variant].measures + '.' : '') : '';
  const present = new Set(rows.map((r) => r.family));
  $('legend').innerHTML = FAMILIES.filter(([f]) => present.has(f)).map(([f, t]) => '<span><i style="background:var(--' + f + ')"></i>' + t + '</span>').join('');
  if (!rows.length) { $('chart').innerHTML = '<p class="empty">Nothing was measured for this choice.</p>'; $('table').innerHTML = ''; return; }

  const W = 940, left = 250, right = 70, rowH = 28, bar = 16, top = 4, axisH = 24;
  const H = top + rows.length * rowH + axisH;
  const max = Math.max(...rows.map((r) => r.max)) * 1.04;
  const step = niceStep(max / 5);
  const x = (v) => left + (v / (Math.ceil(max / step) * step)) * (W - left - right);
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc($('title').textContent) + '">';
  for (let t = 0; t <= Math.ceil(max / step) * step + 1e-9; t += step) {
    svg += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="' + top + '" y2="' + (H - axisH) + '" stroke="var(--grid)" stroke-width="1"/>';
    svg += '<text class="tick" x="' + x(t) + '" y="' + (H - 6) + '" text-anchor="middle">' + fmt(t) + '</text>';
  }
  svg += '<line x1="' + left + '" x2="' + left + '" y1="' + top + '" y2="' + (H - axisH) + '" stroke="var(--axis)" stroke-width="1"/>';
  rows.forEach((r, i) => {
    const y = top + i * rowH + (rowH - bar) / 2, mid = y + bar / 2, w = Math.max(x(r.median) - left, 1);
    const name = r.title + (runtime === 'all' ? ' · ' + runtimeName(r.runtime) : '');
    svg += '<g class="row" tabindex="0" data-i="' + i + '" aria-label="' + esc(name + ': ' + fmt(r.median) + ' ' + r.unit) + '">';
    svg += '<rect class="hit" x="0" y="' + (top + i * rowH) + '" width="' + W + '" height="' + rowH + '" fill="transparent"/>';
    svg += '<text x="' + (left - 10) + '" y="' + (mid + 4) + '" text-anchor="end">' + (r.flags.length ? '⚠ ' : '') + esc(name) + '</text>';
    svg += '<path class="bar" fill="var(--' + r.family + ')" d="M' + left + ' ' + y + 'h' + Math.max(w - 4, 0) + 'a4 4 0 0 1 4 4v' + (bar - 8) + 'a4 4 0 0 1 -4 4h' + (-Math.max(w - 4, 0)) + 'z"/>';
    if (r.n > 1 && r.max > r.min) {
      svg += '<path d="M' + x(r.min) + ' ' + mid + 'H' + x(r.max) + 'M' + x(r.min) + ' ' + (mid - 4) + 'v8M' + x(r.max) + ' ' + (mid - 4) + 'v8" stroke="var(--text-primary)" stroke-opacity=".55" stroke-width="1.5" fill="none"/>';
    }
    svg += '<text class="value" x="' + (Math.max(x(r.max), x(r.median)) + 8) + '" y="' + (mid + 4) + '">' + fmt(r.median) + '</text></g>';
  });
  $('chart').innerHTML = svg + '</svg>';
  $('chart').querySelectorAll('.row').forEach((g) => {
    const r = rows[Number(g.dataset.i)];
    const show = (ev) => tip(ev, r, g);
    g.addEventListener('mousemove', show); g.addEventListener('focus', show);
    g.addEventListener('mouseleave', hide); g.addEventListener('blur', hide);
  });
  $('table').innerHTML = '<table><thead><tr><th>Contender</th><th>Runtime</th><th class="n">Median</th><th class="n">Lowest</th><th class="n">Highest</th><th class="n">Rounds</th><th>Warnings</th></tr></thead><tbody>'
    + rows.map((r) => '<tr><td>' + esc(r.title) + '</td><td>' + runtimeName(r.runtime) + '</td><td class="n">' + fmt(r.median) + '</td><td class="n">' + fmt(r.min) + '</td><td class="n">' + fmt(r.max) + '</td><td class="n">' + r.n + '</td><td>' + esc(r.flags.join('; ')) + '</td></tr>').join('')
    + '</tbody></table>';
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function tip(ev, r, g) {
  const t = $('tip');
  t.innerHTML = '<b>' + esc(r.title) + '</b> <span class="muted">' + runtimeName(r.runtime) + '</span><br>'
    + fmt(r.median) + ' <span class="muted">' + esc(r.unit) + '</span><br>'
    + '<span class="muted">rounds: ' + r.n + ', from ' + fmt(r.min) + ' to ' + fmt(r.max) + '</span>'
    + r.flags.map((f) => '<br><span class="flag">' + esc(f) + '</span>').join('');
  const box = ev.type === 'focus' ? g.getBoundingClientRect() : null;
  const px = ev.clientX ?? box.left + 260, py = ev.clientY ?? box.top;
  t.style.left = Math.min(px + 14, innerWidth - t.offsetWidth - 8) + 'px';
  t.style.top = Math.min(py + 14, innerHeight - t.offsetHeight - 8) + 'px';
  t.style.opacity = 1;
}
function hide() { $('tip').style.opacity = 0; }

const suites = Object.keys(SUITES).filter((s) => DATA.points.some((p) => p.suite === s));
options($('suite'), suites.map((s) => [s, SUITES[s].title]));
$('suite').addEventListener('change', () => refresh('suite'));
['metric', 'variant', 'mode', 'runtime'].forEach((id) => $(id).addEventListener('change', id === 'metric' ? () => refresh('metric') : draw));
refresh('suite');
</script>
</body>
</html>
`
}
