#!/usr/bin/env node
// MIT. Self-contained project atlas compiler; Node.js 20+, no packages.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const FORMAT = 1;
const ID = /^[a-z][a-z0-9-]*$/;
const TYPES = ['fact', 'done', 'next', 'decision', 'open'];
const own = (o, k) => Object.hasOwn(o, k);
const fail = (line, message) => { throw new Error(`L${line}: ${message}`); };
const hash = text => createHash('sha256').update(text).digest('hex');

function scalar(value, line) {
  if (value.startsWith('"')) {
    try { const v = JSON.parse(value); if (typeof v === 'string') return v; } catch { /* error below */ }
    fail(line, 'invalid quoted string');
  }
  if (!value || /^[\[\]{}&*!>|]/.test(value) || /[\u0000-\u0008]/.test(value)) fail(line, 'expected plain text or JSON string');
  return value;
}

function list(value, line) {
  if (value.startsWith('[')) {
    try {
      const v = JSON.parse(value);
      if (Array.isArray(v) && v.every(x => typeof x === 'string' && x.trim())) return v;
    } catch { /* error below */ }
    fail(line, 'expected JSON string array');
  }
  const v = value.split(/[,，]/).map(x => x.trim());
  if (v.some(x => !x)) fail(line, 'empty list item');
  return v;
}

function links(value, line) {
  return value.split(/\s*,\s*(?=(?:[^"\\]|\\.|"(?:[^"\\]|\\.)*")*$)/).map(item => {
    const m = /^([a-z][a-z0-9-]*)(?:\s+("(?:[^"\\]|\\.)*"))?$/.exec(item.trim());
    if (!m) fail(line, 'links must be target "label", target');
    return { target: m[1], label: m[2] ? JSON.parse(m[2]) : '' };
  });
}

export function sourceRef(value, line) {
  const m = /^(.*?)(?::([1-9]\d*))?$/.exec(value);
  const p = m?.[1];
  if (!p || p.startsWith('/') || p.includes('\\') || /[:\x00-\x1f?#]/.test(p) || p.split('/').some(x => x === '..' || !x)) fail(line, 'sources must be project-relative paths, optionally :positive-line');
  return { path: p, ...(m[2] ? { line: Number(m[2]) } : {}) };
}

/** Strict Markdown subset, not a general YAML or Markdown parser. */
export function parse(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') fail(1, 'frontmatter must start with ---');
  let i = 1;
  const meta = {};
  for (; i < lines.length && lines[i] !== '---'; i++) {
    if (!lines[i].trim()) continue;
    const m = /^(project|title):\s+(.+)$/.exec(lines[i]);
    if (!m || own(meta, m[1])) fail(i + 1, 'invalid or duplicate frontmatter field');
    meta[m[1]] = scalar(m[2].trim(), i + 1);
  }
  if (i === lines.length || !meta.project || !meta.title) fail(i + 1, 'project and title frontmatter required');
  const sections = [], cards = [], ids = new Set(), sectionIds = new Set();
  let section;
  for (i++; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const heading = /^## (.+?) \{#([a-z][a-z0-9-]*) layout=(grid|flow)\}$/.exec(lines[i]);
    if (heading) {
      if (sectionIds.has(heading[2])) fail(i + 1, 'duplicate section ID');
      sectionIds.add(heading[2]);
      section = { id: heading[2], title: heading[1], layout: heading[3], cards: [] };
      sections.push(section); continue;
    }
    const start = /^```card id=([a-z][a-z0-9-]*)$/.exec(lines[i]);
    if (!start || !section) fail(i + 1, 'expected section or card fence');
    const card = { id: start[1], section: section.id, type: 'fact', tags: [], sources: [], commits: [], links: [], startLine: i + 1 };
    if (ids.has(card.id) || card.id === 'overall') fail(i + 1, 'duplicate or reserved card ID');
    ids.add(card.id);
    const fields = new Set();
    for (i++; i < lines.length && lines[i] !== '```'; i++) {
      if (!lines[i].trim()) continue;
      const m = /^(title|summary|detail|tags|sources|commits|links|type|date|reason):\s+(.+)$/.exec(lines[i]);
      if (!m || fields.has(m[1])) fail(i + 1, 'invalid or duplicate card field (coordinates are not supported)');
      const [, key, raw] = m, line = i + 1;
      fields.add(key);
      if (key === 'detail' && raw.trim() === '|') {
        const content = [];
        while (i + 1 < lines.length && /^  /.test(lines[i + 1])) content.push(lines[++i].slice(2));
        card.detail = content.join('\n');
      } else if (key === 'sources') card.sources = list(raw, line).map(v => sourceRef(v, line));
      else if (key === 'tags') card.tags = list(raw, line);
      else if (key === 'commits') { card.commits = list(raw, line); if (card.commits.some(v => !/^[0-9a-f]{7,40}$/.test(v))) fail(line, 'commits must be Git hexadecimal object IDs'); }
      else if (key === 'links') card.links = links(raw, line);
      else card[key] = scalar(raw.trim(), line);
    }
    if (i === lines.length) fail(card.startLine, 'unclosed card fence');
    card.endLine = i + 1;
    for (const key of ['title', 'summary', 'detail']) if (!card[key]?.trim()) fail(card.startLine, `${key} is required`);
    if (!card.sources.length) fail(card.startLine, 'sources required for every card');
    if (!TYPES.includes(card.type)) fail(card.startLine, 'unknown card type');
    if (card.date && (!/^\d{4}-\d{2}-\d{2}$/.test(card.date) || !Number.isFinite(Date.parse(card.date)) || new Date(card.date).toISOString().slice(0, 10) !== card.date)) fail(card.startLine, 'date must be a valid YYYY-MM-DD');
    if (card.type === 'decision' && (!card.date || !card.reason)) fail(card.startLine, 'decision requires date and reason (use 原因未记录 when unknown)');
    section.cards.push(card.id); cards.push(card);
  }
  if (!cards.length || sections.some(s => !s.cards.length)) fail(1, 'each atlas and section must contain cards');
  return { ...meta, sections, cards };
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function context(cwd, src = 'docs/atlas.md', out = 'docs/project-overview.html') {
  const root = git(cwd, 'rev-parse', '--show-toplevel');
  const source = path.resolve(root, src), output = path.resolve(root, out);
  if (source === output) throw new Error('source and output must differ');
  // Existing ancestors are resolved too, so output/source symlinks cannot escape.
  for (const p of [source, output]) {
    let existing = p;
    while (!fs.existsSync(existing)) existing = path.dirname(existing);
    if (!inside(root, p) || !inside(root, fs.realpathSync(existing))) throw new Error('source/output must stay inside project');
  }
  const text = fs.readFileSync(source, 'utf8');
  const data = parse(text), sourceHash = hash(text);
  const revision = git(root, 'rev-parse', '--short=12', 'HEAD');
  const generated = git(root, 'show', '-s', '--format=%cI', 'HEAD');
  const sourceBase = path.relative(path.dirname(output), root).split(path.sep).join('/') || '.';
  return { root, source, output, data: { ...data, format: FORMAT, sourceHash, version: `atlas-1-${sourceHash.slice(0, 12)}`, revision, generated, sourceBase } };
}

function inside(root, p) { const rel = path.relative(root, p); return !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); }
const issue = (code, message, card) => ({ code, message, ...(card ? { card: card.id, line: card.startLine } : {}) });

export function inspect(ctx, { artifact = true } = {}) {
  const { root, data, output } = ctx, errors = [], warnings = [];
  const ids = new Set(data.cards.map(c => c.id));
  for (const c of data.cards) {
    for (const revision of c.commits) {
      try { git(root, 'show', '-s', '--format=%H', `${revision}^{commit}`); }
      catch { errors.push(issue('missing-commit', `Git commit ${revision} is unavailable`, c)); }
    }
    for (const l of c.links) if (!ids.has(l.target)) errors.push(issue('unknown-link', `link target ${l.target} does not exist`, c));
    for (const s of c.sources) {
      const p = path.resolve(root, s.path);
      try {
        if (!inside(root, p) || !inside(root, fs.realpathSync(p)) || !fs.statSync(p).isFile()) throw Error('not a project file');
        if (s.line) {
          const body = fs.readFileSync(p, 'utf8');
          const count = body ? body.split('\n').length - Number(body.endsWith('\n')) : 0;
          if (s.line > count) errors.push(issue('source-line', `${s.path}:${s.line} exceeds ${count} lines`, c));
        }
      } catch { errors.push(issue('missing-source', `${s.path} is missing or outside project`, c)); }
    }
    const sentences = c.detail.split(/[。！？!?]+|\.(?=\s|$)/u).filter(s => s.trim()).length;
    const han = (c.detail.match(/\p{Script=Han}/gu) || []).length;
    if (sentences > 3 || han > 120) warnings.push(issue('dense-detail', `detail has ${sentences} sentences / ${han} Han characters (limit 3 / 120)`, c));
  }
  if (!data.sections.some(s => s.id === 'status')) warnings.push(issue('missing-status', 'missing 现状与决策 section (#status)'));
  if (artifact) {
    let built;
    try { built = readArtifact(fs.readFileSync(output, 'utf8')); } catch { /* warning below */ }
    if (!built || built.sourceHash !== data.sourceHash || built.format !== FORMAT) warnings.push(issue('stale-html', 'HTML missing, invalid, or not built from current source'));
    if (built) {
      try {
        if (!/^[0-9a-f]{7,40}$/.test(built.revision)) throw Error('invalid revision');
        git(root, 'merge-base', '--is-ancestor', built.revision, 'HEAD');
        const count = Number(git(root, 'rev-list', '--count', `${built.revision}..HEAD`));
        if (count) {
          const changed = git(root, 'log', '--format=', '--name-only', '-z', `${built.revision}..HEAD`).split('\0');
          const affected = [...new Set(data.cards.flatMap(c => c.sources.map(s => s.path)))].filter(p => changed.includes(p)).map(p => ({ path: p, cards: data.cards.filter(c => c.sources.some(s => s.path === p)).map(c => c.id) }));
          warnings.push({ ...issue('new-commits', `${count} commits since overview revision`), count, affected });
        }
      } catch { warnings.push(issue('revision-unavailable', 'overview revision unavailable or not an ancestor of HEAD; fetch missing history; after squash/rebase merge, run build on the main branch and commit HTML separately (or rebuild with the next overview update)')); }
    }
  }
  return { errors, warnings };
}

export function readArtifact(html) {
  const match = /<script id="atlas-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('atlas metadata not found');
  const data = JSON.parse(match[1]);
  if (!data || typeof data.sourceHash !== 'string' || typeof data.revision !== 'string') throw new Error('invalid atlas metadata');
  return data;
}

// Shared by the page and the CLI tests: one feedback wire format.
export function feedbackText(data, comments) {
  return '# 项目概览反馈\nATLAS-FEEDBACK/1\n```json\n' + JSON.stringify({ schema_version: 1, overview_version: data.version, revision: data.revision, comments }, null, 2) + '\n```\n';
}

export function feedback(text, ctx) {
  const m = /^# 项目概览反馈\r?\nATLAS-FEEDBACK\/1\r?\n```json\r?\n([\s\S]*)\r?\n```\s*$/.exec(text.trim());
  if (!m) throw new Error('invalid feedback envelope; expected ATLAS-FEEDBACK/1');
  const value = JSON.parse(m[1]);
  if (value.schema_version !== 1 || typeof value.overview_version !== 'string' || !/^[0-9a-f]{7,40}$/.test(value.revision) || !Array.isArray(value.comments)) throw new Error('invalid feedback metadata');
  const warnings = [], cards = new Map(ctx.data.cards.map(c => [c.id, c]));
  if (value.overview_version !== ctx.data.version) warnings.push('overview version differs from current source');
  if (value.revision !== ctx.data.revision) warnings.push('feedback revision differs from HEAD');
  const comments = value.comments.map(c => {
    if (!c || typeof c.id !== 'string' || (!ID.test(c.id)) || typeof c.text !== 'string' || !c.text.trim()) throw new Error('invalid feedback comment');
    const card = cards.get(c.id);
    if (!card && c.id !== 'overall') warnings.push(`card ${c.id} no longer exists`);
    return { id: c.id, text: c.text, lines: card ? [card.startLine, card.endLine] : null };
  });
  return { schema_version: 1, overview_version: value.overview_version, revision: value.revision, comments, warnings };
}

// Routing is compiled with layout so the browser and geometry tests use the same paths.
function segments(points) { return points.slice(1).map((p, i) => [points[i], p]); }
function hitsBox([a, b], r) {
  if (a.x === b.x) return a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h;
  return a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w;
}
function crosses([a, b], [c, d]) {
  if (a.x === b.x && c.x === d.x) return Math.abs(a.x - c.x) < 10 && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) < Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
  if (a.y === b.y && c.y === d.y) return Math.abs(a.y - c.y) < 10 && Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) < Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
  const [v, h] = a.x === b.x ? [[a, b], [c, d]] : [[c, d], [a, b]];
  return v[0].x >= Math.min(h[0].x, h[1].x) && v[0].x <= Math.max(h[0].x, h[1].x) && h[0].y >= Math.min(v[0].y, v[1].y) && h[0].y <= Math.max(v[0].y, v[1].y);
}
function compact(points) {
  const result = [];
  for (const p of points) {
    if (result.length && result.at(-1).x === p.x && result.at(-1).y === p.y) continue;
    while (result.length > 1) {
      const a = result.at(-2), b = result.at(-1);
      if ((a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) >= 0) || (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) >= 0)) result.pop();
      else break;
    }
    result.push(p);
  }
  return result;
}

export function routeEdges(nodes, regions) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = nodes.flatMap(n => n.links.map(l => ({ from: n.id, to: l.target, label: l.label })));
  const routes = [], omitted = [], occupied = [], labelBoxes = [];
  const right = Math.max(...nodes.map(n => n.x + n.w)), bottom = Math.max(...regions.map(r => r.y + r.h));
  const headings = regions.map(r => ({ x: r.x + 12, y: r.y + 12, w: Math.min(r.w - 24, [...r.title].length * 20 + 100), h: 36 }));
  const padded = nodes.map(n => ({ x: n.x - 8, y: n.y - 8, w: n.w + 16, h: n.h + 16 }));
  // Adjacent flow links get the short, horizontal channels before other edges.
  const adjacent = link => {
    const a = byId.get(link.from), b = byId.get(link.to), r = regions.find(r => r.id === a.section);
    return a.section === b.section && r.layout === 'flow' && Math.abs(r.cards.indexOf(a.id) - r.cards.indexOf(b.id)) === 1;
  };
  const ordered = links.map((l, index) => ({ ...l, index })).sort((a, b) => Number(adjacent(b)) - Number(adjacent(a)) || a.index - b.index);
  for (const link of ordered) {
    const a = byId.get(link.from), b = byId.get(link.to), candidates = [];
    const obstacles = [...nodes.map((n, i) => n.id === a.id || n.id === b.id ? n : padded[i]), ...headings];
    if (a.id !== b.id && adjacent(link)) {
      const y = a.y + a.h / 2 + link.index / (links.length + 1) * 4;
      candidates.push([{ x: a.x + (b.x > a.x ? a.w : 0), y }, { x: b.x + (b.x > a.x ? 0 : b.w), y }]);
    }
    const fraction = .32 + .36 * (link.index + 1) / (links.length + 1);
    const ports = n => [
      { p: { x: n.x + n.w * fraction, y: n.y }, dx: 0, dy: -1 },
      { p: { x: n.x + n.w * fraction, y: n.y + n.h }, dx: 0, dy: 1 },
      { p: { x: n.x, y: n.y + n.h * fraction }, dx: -1, dy: 0 },
      { p: { x: n.x + n.w, y: n.y + n.h * fraction }, dx: 1, dy: 0 },
    ];
    if (a.id !== b.id) for (const ap of ports(a)) for (const bp of ports(b)) for (const offset of [18, 30, 42, 54]) {
      const distance = offset + 5 * (link.index + 1) / (links.length + 1);
      const s = { x: ap.p.x + ap.dx * distance, y: ap.p.y + ap.dy * distance };
      const t = { x: bp.p.x + bp.dx * distance, y: bp.p.y + bp.dy * distance };
      candidates.push([ap.p, s, { x: t.x, y: s.y }, t, bp.p], [ap.p, s, { x: s.x, y: t.y }, t, bp.p]);
      const gutter = right + 28 + link.index * 12;
      candidates.push([ap.p, s, { x: gutter, y: s.y }, { x: gutter, y: t.y }, t, bp.p]);
      const floor = bottom + 24 + link.index * 12;
      candidates.push([ap.p, s, { x: s.x, y: floor }, { x: t.x, y: floor }, t, bp.p]);
    }
    let best, cost = Infinity;
    for (const candidate of candidates) {
      const points = compact(candidate), lines = segments(points);
      if (!lines.length || points.some(p => p.x < 8 || p.y < 8)) continue;
      if (lines.some(line => [...obstacles, ...labelBoxes].some(r => hitsBox(line, r)) || occupied.some(other => crosses(line, other)))) continue;
      // A route must not double back over or intersect itself either.
      if (lines.some((line, i) => lines.slice(i + 2).some(other => crosses(line, other)))) continue;
      const length = lines.reduce((sum, [p, q]) => sum + Math.abs(q.x - p.x) + Math.abs(q.y - p.y), 0) + lines.length * 28;
      if (length < cost) { best = points; cost = length; }
    }
    if (!best) { omitted.push({ from: link.from, to: link.to, label: link.label }); continue; }
    const route = { from: link.from, to: link.to, label: link.label, points: best };
    if (link.label) {
      // Conservative width also covers wide Latin glyphs and the text outline.
      const w = [...link.label].length * 14 + 12;
      const positions = segments(best).filter(([p, q]) => p.y === q.y).flatMap(([p, q]) => {
        const x = (p.x + q.x - w) / 2;
        return [{ x, y: p.y - 25, w, h: 18 }, { x, y: p.y + 8, w, h: 18 }, ...(best.length === 2 && adjacent(link) ? [{ x, y: a.y - 28, w, h: 18 }] : [])];
      });
      route.labelBox = positions.find(r => r.x > 8 && r.y > 8 && ![...padded, ...headings, ...labelBoxes].some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) && ![...occupied, ...segments(best)].some(line => hitsBox(line, r)));
      if (route.labelBox) labelBoxes.push(route.labelBox);
    }
    routes.push(route); occupied.push(...segments(best));
  }
  return { routes, omitted };
}

export function layout(data) {
  const flowWidth = Math.max(0, ...data.sections.filter(s => s.layout === 'flow').map(s => s.cards.length * 280 + Math.max(0, s.cards.length - 1) * 40));
  const gridCardWidth = Math.min(600, Math.max(340, (flowWidth - 80) / 3));
  const h = 210, gap = 40, rowGap = 80, nodes = [], sections = [];
  let y = 26;
  for (const section of data.sections) {
    const flow = section.layout === 'flow', cols = flow ? section.cards.length : Math.min(3, section.cards.length);
    const w = flow ? 280 : gridCardWidth, rows = Math.ceil(section.cards.length / cols);
    const width = cols * w + (cols - 1) * gap + 40, height = 80 + rows * h + (rows - 1) * rowGap + 40;
    sections.push({ ...section, x: 20, y, w: width, h: height });
    section.cards.forEach((id, i) => {
      nodes.push({ ...data.cards.find(c => c.id === id), x: 40 + (i % cols) * (w + gap), y: y + 80 + Math.floor(i / cols) * (h + rowGap), w, h });
    });
    y += height + 32;
  }
  const geometry = routeEdges(nodes, sections);
  const points = geometry.routes.flatMap(r => r.points);
  const width = Math.max(...sections.map(s => s.x + s.w), ...points.map(p => p.x)) + 32;
  const height = Math.max(y, ...points.map(p => p.y + 32));
  return { ...data, nodes, regions: sections, width, height, ...geometry };
}

// A reading view can crop a wide canvas; fitting the entire atlas is explicit.
export function readingCamera(region, width) {
  const z = Math.min(1, Math.max(.6, (width - 64) / region.w));
  return { z, x: 32 - region.x * z, y: 28 - region.y * z };
}

const escapeHTML = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function render(data) {
  const json = JSON.stringify(layout(data)).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<!doctype html>
<html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHTML(data.project)} · ${escapeHTML(data.title)}</title><style>${CSS}</style></head>
<body><header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">◈</span><div><h1 id="project"></h1><small>PROJECT ATLAS</small></div></div><div class="page-heading"><span id="page-title"></span><small id="snapshot"></small></div><div class="search-wrap"><input id="search" type="search" placeholder="搜索概览…" aria-label="搜索概览卡片" aria-controls="search-results" aria-expanded="false"><div id="search-results" hidden></div></div><button id="theme-toggle" aria-label="切换明暗模式">◐</button><button id="open-feedback">批注 <span id="feedback-count">0</span></button></header>
<main><aside class="sidebar"><div class="eyebrow">READ THE PROJECT</div><h2>从全貌，<br>走进项目。</h2><p>看清用途与主线，<br>了解进展与尚待决定的事。</p><nav id="routes" aria-label="画布分区"></nav><p class="hint">拖动平移 · 滚轮移动<br>Ctrl / ⌘ + 滚轮缩放<br>批注临时保留，刷新前请复制。</p></aside><section id="viewport" aria-label="可平移缩放的项目画布" tabindex="0"><div id="world"><svg id="edges" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10Z" fill="var(--green)"/></marker></defs></svg></div><div class="toolbar" aria-label="画布工具"><button id="zoom-out" aria-label="缩小">−</button><output id="zoom-value"></output><button id="zoom-in" aria-label="放大">＋</button><button id="fit-all">返回全貌</button><button id="actual-size">1:1</button></div><div class="map-wrap"><small>你在这里</small><svg id="minimap" aria-label="画布位置示意" role="img"></svg></div></section><div id="mobile-list"></div><aside id="drawer" aria-label="卡片详情" hidden><div class="drawer-top"><span class="eyebrow">深入一层</span><button id="close-detail" aria-label="关闭卡片详情">✕</button></div><div id="detail-content" class="drawer-scroll"></div><div class="note-compose"><label for="node-note">给这张卡片留个批注</label><textarea id="node-note" placeholder="哪里没看懂？" maxlength="2000"></textarea><button id="add-note">加入反馈</button><small>输入中的批注也会包含在复制结果中。</small></div></aside></main>
<dialog id="feedback-dialog" aria-labelledby="feedback-title"><div class="dialog-head"><h2 id="feedback-title">交给 Agent 的反馈</h2><button id="close-feedback" aria-label="关闭反馈">✕</button></div><div class="dialog-body"><p class="hint">批注仅在当前页面临时保留。复制后粘贴给 Agent，继续调整概览。</p><div id="feedback-items"></div><label for="overall-note">整体意见</label><textarea id="overall-note" maxlength="2000"></textarea><div id="copy-fallback" hidden><p>浏览器未允许自动复制，请全选下方文本并复制。</p><textarea id="copy-text" readonly aria-label="待手动复制的完整反馈"></textarea><button id="select-copy-text">全选反馈文本</button></div></div><div class="dialog-footer"><small id="feedback-status"></small><button id="copy-feedback" class="primary">复制全部反馈</button></div></dialog><div id="toast" role="status" hidden></div>
<script id="atlas-data" type="application/json">${json}</script><script>'use strict';\n${feedbackText.toString()}\n${readingCamera.toString()}\n(${browser.toString()})();</script></body></html>\n`;
}

const CSS = `
:root{--bg:#f5f4f0;--card:#fff;--ink:#252a28;--muted:#69736e;--border:#dcdfd8;--green:#256d57;--green-bg:#e9f2eb;--orange:#b9612b;--orange-bg:#fff0e4;--grid:#dcded6;--shadow:0 12px 35px #27362d0d;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
:root[data-theme=dark]{--bg:#171e1b;--card:#222c27;--ink:#edf0e8;--muted:#b2bdb4;--border:#3c4940;--green:#92cbb1;--green-bg:#293e32;--orange:#edb183;--orange-bg:#3d3026;--grid:#354139;--shadow:0 12px 35px #0002}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 var(--sans);overflow:hidden}button,input,textarea{font:inherit;color:inherit}button{cursor:pointer;border:1px solid var(--border);border-radius:9px;padding:8px 12px;background:var(--card)}button:hover{border-color:var(--green)}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--green);outline-offset:3px}a{color:var(--green);overflow-wrap:anywhere}.primary{background:var(--green);color:var(--card)}:root[data-theme=dark] .primary{color:#17251c}small,.hint,.eyebrow{color:var(--muted)}.eyebrow{font-size:10px;letter-spacing:1.6px}.topbar{height:84px;display:flex;align-items:center;gap:18px;padding:0 26px;border-bottom:1px solid var(--border);background:var(--card);position:relative;z-index:5}.brand{display:flex;gap:12px;align-items:center;min-width:0}.brand-mark{background:var(--green);color:var(--card);border-radius:12px;width:38px;height:38px;display:grid;place-items:center;font-size:24px}.brand h1{font-size:20px;line-height:1.25;margin:0;overflow:hidden;text-overflow:ellipsis;max-width:240px}.brand small{font-size:9px;letter-spacing:1.6px}.page-heading{border-left:1px solid var(--border);padding-left:18px;min-width:0}.page-heading span,.page-heading small{display:block}.page-heading small{font-size:10px}.search-wrap{margin-left:auto;position:relative;width:220px;flex-shrink:1}input{width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg)}#search-results{position:absolute;right:0;top:45px;width:min(320px,90vw);max-height:360px;overflow:auto;background:var(--card);padding:8px;border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow)}#search-results button{width:100%;text-align:left;border:0}#feedback-count{font-size:11px;color:var(--green);background:var(--green-bg);padding:2px 5px;border-radius:4px}.topbar>button{flex-shrink:0;white-space:nowrap}main{display:flex;height:calc(100dvh - 84px);position:relative}.sidebar{width:210px;flex-shrink:0;padding:28px 20px;background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:auto}.sidebar h2{font-size:22px;line-height:1.6;margin:10px 0}.sidebar p{font-size:12px;color:var(--muted);margin:0 0 24px}.sidebar .hint{margin-top:auto;padding-top:25px;font-size:10px}#routes button{display:block;text-align:left;width:100%;border:0;margin:4px 0;padding:12px;background:transparent}#routes button.active{background:var(--green-bg);color:var(--green)}#viewport{position:relative;flex:1;min-width:0;overflow:hidden;touch-action:none;cursor:grab;background-image:radial-gradient(var(--grid) .85px,transparent .85px);background-size:22px 22px}#viewport.dragging{cursor:grabbing}#world{position:absolute;left:0;top:0;transform-origin:0 0}#edges{position:absolute;inset:0;overflow:visible;pointer-events:none}#edges .edge{fill:none;stroke:var(--green);stroke-width:2;opacity:.7}#edges text{font-size:12px;fill:var(--green);paint-order:stroke;stroke:var(--bg);stroke-width:7px;stroke-linejoin:round}.zone{position:absolute;border:1px solid var(--border);border-radius:18px;pointer-events:none;background:color-mix(in srgb,var(--green-bg) 25%,transparent)}.zone h2{font-size:18px;margin:17px 20px;color:var(--muted);font-weight:500}.node{position:absolute;text-align:left;padding:22px;display:flex;flex-direction:column;gap:10px;user-select:none;border-radius:14px;background:var(--card);box-shadow:var(--shadow)}.node h3{font-size:23px;line-height:1.35;margin:0;letter-spacing:-.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.node p{font-size:17px;line-height:1.6;color:var(--muted);margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.node.wide h3{font-size:27px}.node.wide p{font-size:19px}.relations button{display:block;text-align:left;width:100%;margin:8px 0;font-size:12px}.node.selected{outline:3px solid var(--green);outline-offset:4px}.node .badge{position:absolute;right:-10px;top:-10px;background:var(--orange);color:var(--card);border:3px solid var(--bg);border-radius:9px;min-width:27px;text-align:center;font-size:13px}.toolbar{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:3px;background:var(--card);padding:6px;border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);white-space:nowrap}.toolbar button{border:0;background:transparent}.toolbar output{width:42px;font-size:11px;text-align:center}.map-wrap{position:absolute;bottom:24px;right:18px;width:116px;padding:8px;background:var(--card);border:1px solid var(--border);border-radius:10px;pointer-events:none}.map-wrap small{font-size:9px}#minimap{width:100%;max-height:170px}#mobile-list{display:none}#drawer{width:370px;flex-shrink:0;background:var(--card);border-left:1px solid var(--border);display:flex;flex-direction:column;min-height:0;z-index:4}.drawer-top{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 10px}.drawer-top button{border:0}.drawer-scroll{flex:1;overflow:auto;padding:0 26px 24px}.drawer-scroll h2{font-size:25px;line-height:1.45;letter-spacing:-.6px;margin:12px 0}.detail-intro{font-size:14px;line-height:1.9;white-space:pre-line}.tags{display:flex;gap:5px;flex-wrap:wrap}.tag{font-size:10px;padding:3px 7px;background:var(--green-bg);color:var(--green);border-radius:5px}.sources{border-top:1px solid var(--border);margin-top:20px;padding-top:14px}.sources h3{font-size:12px}.sources a{display:block;font:11px/1.8 ui-monospace,monospace;margin:8px 0}.metadata{font:11px/1.8 ui-monospace,monospace;margin-top:18px;color:var(--muted)}.note-compose{padding:18px 22px;border-top:1px solid var(--border)}label{display:block;font-size:12px;margin:0 0 8px}.note-compose button{display:block;margin-top:10px}.note-compose small{font-size:10px}textarea{width:100%;resize:vertical;min-height:80px;max-height:180px;border:1px solid var(--border);border-radius:8px;background:var(--bg);padding:10px;font-size:13px;line-height:1.7}.note{background:var(--orange-bg);padding:12px;border-radius:9px;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0}dialog{width:min(680px,calc(100vw - 24px));max-height:calc(100dvh - 40px);border:1px solid var(--border);border-radius:18px;background:var(--card);color:var(--ink);padding:0;box-shadow:0 30px 100px #0003}dialog::backdrop{background:#14251bbb;backdrop-filter:blur(4px)}.dialog-head,.dialog-footer{display:flex;align-items:center;gap:14px;padding:18px 24px}.dialog-head{border-bottom:1px solid var(--border)}.dialog-head h2{font-size:19px;margin:0;flex:1}.dialog-body{padding:18px 24px;max-height:calc(100dvh - 220px);overflow:auto}.dialog-body>.hint{font-size:12px}.dialog-footer{border-top:1px solid var(--border)}.dialog-footer small{flex:1;font-size:10px}.feedback-item{border:1px solid var(--border);padding:12px;border-radius:9px;margin-bottom:12px}.feedback-item strong{font-size:13px}.feedback-item button{float:right;font-size:10px;padding:3px 8px}.feedback-item p{white-space:pre-wrap;overflow-wrap:anywhere}#copy-fallback{padding:12px;background:var(--green-bg);border-radius:10px;margin-top:15px}#copy-fallback p{font-size:12px}#copy-text{min-height:150px;font:11px/1.7 ui-monospace,monospace}#toast{position:fixed;left:50%;bottom:95px;transform:translateX(-50%);padding:12px 20px;max-width:90vw;border-radius:9px;background:var(--ink);color:var(--card);font-size:12px;z-index:20}
@media(max-width:1100px){.page-heading{display:none}.sidebar{width:170px;padding:22px 14px}.map-wrap{display:none}#drawer{width:340px}.topbar{padding:0 18px;gap:12px}}
@media(min-width:641px) and (max-width:800px){.sidebar{width:130px}.brand-mark{display:none}.search-wrap{width:160px}#drawer{position:absolute;right:0;top:0;bottom:0;width:340px;box-shadow:-20px 0 60px #0002}}
@media(max-width:640px){body{overflow:auto}.topbar{height:auto;min-height:110px;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;position:sticky;top:0}.brand{gap:8px}.brand h1{max-width:none;font-size:18px}.brand-mark{width:30px;height:30px;font-size:20px}.brand small{font-size:8px}.search-wrap{grid-row:2;grid-column:1/-1;width:100%;margin:0}.topbar>button{padding:7px 10px;font-size:12px}.page-heading,.sidebar,#viewport{display:none}main{display:block;height:auto}#mobile-list{display:block;padding:10px 16px 40px}#mobile-list section>h2{font-size:18px;font-weight:500;margin:25px 0 12px;color:var(--muted)}#mobile-list .node{position:relative;width:100%;height:auto;min-height:135px;margin:12px 0;padding:19px;border-radius:12px;user-select:auto}#mobile-list .node h3{font-size:20px;-webkit-line-clamp:unset}#mobile-list .node p{font-size:14px;-webkit-line-clamp:unset}#drawer{position:fixed;inset:0;width:100%;height:100dvh;border:0;z-index:8}.drawer-scroll{padding:0 24px 20px}.drawer-scroll h2{font-size:24px}.dialog-head,.dialog-body,.dialog-footer{padding:16px}.dialog-head h2{font-size:17px}.dialog-footer{gap:8px}.dialog-footer small{font-size:9px}.dialog-footer button{font-size:12px}#toast{bottom:22px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;

function browser() {
  const D = JSON.parse(document.getElementById('atlas-data').textContent);
  const $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
  const nodes = new Map(D.nodes.map(n => [n.id, n])), cards = new Map(), mobileCards = new Map();
  const vp = $('viewport'), world = $('world'), drawer = $('drawer');
  const state = { x: 0, y: 0, z: 1, selected: null, view: D.regions[0].id, comments: [], drafts: Object.create(null), overall: '', changed: 0, copied: -1 };
  const types = { fact: '项目能力', done: '已完成', next: '进行中 / 下一步', decision: '关键决策', open: '悬而未决' };
  let toastTimer, fitPending = true, lastFocus;
  const mobile = () => matchMedia('(max-width:640px)').matches;
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function svg(tag, attrs) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
  function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200); }
  $('project').textContent = D.project; $('page-title').textContent = D.title;
  $('snapshot').textContent = D.revision + ' · ' + D.generated.slice(0, 10);
  if (matchMedia('(prefers-color-scheme:dark)').matches) document.documentElement.dataset.theme = 'dark';
  world.style.width = D.width + 'px'; world.style.height = D.height + 'px';
  $('edges').setAttribute('width', D.width); $('edges').setAttribute('height', D.height);
  $('minimap').setAttribute('viewBox', `0 0 ${D.width} ${D.height}`);
  function draw() {
    world.style.transform = `translate(${state.x}px,${state.y}px) scale(${state.z})`;
    $('zoom-value').textContent = Math.round(state.z * 100) + '%';
    $('map-view').setAttribute('x', -state.x / state.z); $('map-view').setAttribute('y', -state.y / state.z);
    $('map-view').setAttribute('width', vp.clientWidth / state.z); $('map-view').setAttribute('height', vp.clientHeight / state.z);
  }
  function fitRect(r) {
    if (mobile()) return;
    state.z = Math.max(.05, Math.min(1.1, (vp.clientWidth - 56) / r.w, (vp.clientHeight - 100) / r.h));
    state.x = (vp.clientWidth - r.w * state.z) / 2 - r.x * state.z;
    state.y = (vp.clientHeight - r.h * state.z) / 2 - r.y * state.z - 20; draw();
  }
  function zoom(z, x = vp.clientWidth / 2, y = vp.clientHeight / 2) {
    z = Math.max(.05, Math.min(2.5, z)); const ratio = z / state.z;
    state.x = x - (x - state.x) * ratio; state.y = y - (y - state.y) * ratio; state.z = z; fitPending = false; draw();
  }
  function closeDetail() { drawer.hidden = true; state.selected = null; for (const c of [...cards.values(), ...mobileCards.values()]) c.classList.remove('selected'); lastFocus?.focus({ preventScroll: true }); }
  function setView(id) {
    closeDetail(); state.view = id; fitPending = true;
    for (const b of $('routes').children) { b.classList.toggle('active', b.dataset.view === id); b.setAttribute('aria-pressed', String(b.dataset.view === id)); }
    if (id === null) fitRect({ x: 0, y: 0, w: D.width, h: D.height });
    else { Object.assign(state, readingCamera(D.regions.find(s => s.id === id), vp.clientWidth)); draw(); }
  }
  for (const [index, s] of D.regions.entries()) {
    const zone = el('div', 'zone'); Object.assign(zone.style, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' }); zone.append(el('h2', '', `${String(index + 1).padStart(2, '0')} / ${s.title}`)); world.prepend(zone);
    const b = el('button', '', s.title); b.dataset.view = s.id; b.onclick = () => setView(s.id); $('routes').append(b);
    const section = el('section'); section.id = 'mobile-' + s.id; section.append(el('h2', '', s.title)); $('mobile-list').append(section);
  }
  for (const n of D.nodes) {
    function card(isMobile) {
      const b = el('button', 'node' + (n.w > 400 ? ' wide' : '')); b.type = 'button'; b.dataset.id = n.id;
      b.setAttribute('aria-label', n.title + '，查看说明和批注'); b.append(el('h3', '', n.title), el('p', '', n.summary));
      const badge = el('span', 'badge'); badge.hidden = true; b.append(badge);
      if (!isMobile) Object.assign(b.style, { left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px' });
      b.onclick = e => { if (isMobile || e.detail === 0) openNode(n.id); };
      return b;
    }
    const c = card(false), m = card(true); world.append(c); cards.set(n.id, c); $('mobile-' + n.section).append(m); mobileCards.set(n.id, m);
    $('minimap').append(svg('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 9, fill: 'var(--green)', opacity: '.4' }));
  }
  for (const route of D.routes) {
    const d = route.points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
    $('edges').append(svg('path', { d, class: 'edge', 'marker-end': 'url(#arrow)' }));
    if (route.labelBox) {
      const r = route.labelBox, label = svg('text', { x: r.x + r.w / 2, y: r.y + 14, 'text-anchor': 'middle' });
      label.textContent = route.label; $('edges').append(label);
    }
  }
  $('minimap').append(svg('rect', { id: 'map-view', fill: 'var(--green)', 'fill-opacity': '.06', stroke: 'var(--orange)', 'stroke-width': 10 }));
  function renderDetail() {
    const n = nodes.get(state.selected), content = $('detail-content'); content.replaceChildren();
    content.append(el('small', '', types[n.type]), el('h2', '', n.title), el('p', 'detail-intro', n.detail));
    if (n.reason) content.append(el('p', 'detail-intro', (n.date ? n.date + ' · ' : '') + '原因：' + n.reason));
    const relations = D.nodes.flatMap(a => a.links.filter(l => a.id === n.id || l.target === n.id).map(l => ({ id: a.id === n.id ? l.target : a.id, label: l.label, outgoing: a.id === n.id })));
    if (relations.length) {
      const section = el('section', 'sources relations'); section.append(el('h3', '', '关联'));
      for (const r of relations) { const b = el('button', '', (r.outgoing ? '→ ' : '← ') + nodes.get(r.id).title + (r.label ? ' · ' + r.label : '')); b.onclick = () => openNode(r.id); section.append(b); }
      content.append(section);
    }
    const tags = el('div', 'tags'); for (const t of n.tags) tags.append(el('span', 'tag', t)); content.append(tags);
    const sources = el('section', 'sources'); sources.append(el('h3', '', '继续看来源'));
    for (const s of n.sources) { const a = el('a', '', s.path + (s.line ? ':' + s.line : '') + ' ↗'); a.href = D.sourceBase + '/' + s.path.split('/').map(encodeURIComponent).join('/') + (s.line ? '#L' + s.line : ''); a.target = '_blank'; a.rel = 'noopener'; sources.append(a); }
    for (const revision of n.commits) sources.append(el('p', 'metadata', 'Git ' + revision + ' · 在仓库历史中查看'));
    content.append(sources);
    const meta = el('details', 'metadata'); meta.append(el('summary', '', '概览信息'), el('p', '', n.id + ' · ' + D.version + ' · ' + D.revision)); content.append(meta);
    for (const note of state.comments.filter(c => c.id === n.id)) content.append(el('p', 'note', note.text));
    $('node-note').value = state.drafts[n.id] || '';
  }
  function openNode(id) {
    lastFocus = mobile() ? mobileCards.get(id) : cards.get(id); state.selected = id; drawer.hidden = false;
    for (const [key, c] of cards) c.classList.toggle('selected', key === id);
    renderDetail(); $('detail-content').scrollTop = 0; fitPending = false;
    if (!mobile()) { const n = nodes.get(id); fitRect({ x: n.x - 25, y: n.y - 30, w: n.w + 50, h: n.h + 60 }); }
    $('close-detail').focus({ preventScroll: true });
  }
  $('close-detail').onclick = () => { closeDetail(); if (!mobile()) setView(state.view); };
  $('fit-all').onclick = () => setView(null); $('zoom-in').onclick = () => zoom(state.z * 1.22); $('zoom-out').onclick = () => zoom(state.z / 1.22); $('actual-size').onclick = () => zoom(1);
  $('theme-toggle').onclick = () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; };
  vp.addEventListener('wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoom(state.z * Math.exp(-e.deltaY * .008), e.clientX - r.left, e.clientY - r.top); else { state.x -= e.deltaX; state.y -= e.deltaY; fitPending = false; draw(); } }, { passive: false });
  let gesture;
  vp.addEventListener('pointerdown', e => { if (e.target.closest('.toolbar') || e.button !== 0) return; gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: state.x, ty: state.y, node: e.target.closest('.node')?.dataset.id, moved: false }; vp.setPointerCapture(e.pointerId); });
  vp.addEventListener('pointermove', e => { if (!gesture || gesture.id !== e.pointerId) return; const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y; if (Math.hypot(dx, dy) > 5) gesture.moved = true; if (gesture.moved) { state.x = gesture.tx + dx; state.y = gesture.ty + dy; fitPending = false; vp.classList.add('dragging'); draw(); } });
  vp.addEventListener('pointerup', e => { if (!gesture || gesture.id !== e.pointerId) return; const g = gesture; gesture = null; vp.classList.remove('dragging'); if (!g.moved && g.node) openNode(g.node); });
  vp.addEventListener('pointercancel', () => { gesture = null; vp.classList.remove('dragging'); });
  document.addEventListener('keydown', e => { if (e.target.closest('input,textarea') || $('feedback-dialog').open) return; if (e.key === 'Escape') { closeDetail(); setView(state.view); } if (e.key === '0') setView(null); if (e.key === '+' || e.key === '=') zoom(state.z * 1.22); if (e.key === '-') zoom(state.z / 1.22); if (document.activeElement === vp && e.key.startsWith('Arrow')) { const delta = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[e.key]; if (delta) { e.preventDefault(); state.x += delta[0]; state.y += delta[1]; fitPending = false; draw(); } } });
  $('search').addEventListener('input', () => {
    const q = $('search').value.trim().toLocaleLowerCase(), box = $('search-results'); box.replaceChildren(); box.hidden = !q; $('search').setAttribute('aria-expanded', String(!!q)); if (!q) return;
    const found = D.nodes.filter(n => [n.title, n.summary, n.detail, n.reason || '', ...n.tags].join(' ').toLocaleLowerCase().includes(q));
    for (const n of found) { const b = el('button', '', n.title); b.onclick = () => { openNode(n.id); box.hidden = true; $('search').setAttribute('aria-expanded', 'false'); }; box.append(b); } if (!found.length) box.append(el('p', 'hint', '没有匹配的卡片。'));
  });
  $('search').addEventListener('keydown', e => { if (e.key === 'Enter') $('search-results').querySelector('button')?.click(); if (e.key === 'Escape') { $('search-results').hidden = true; $('search').setAttribute('aria-expanded', 'false'); } });
  function allFeedback() { return [...state.comments, ...Object.entries(state.drafts).filter(([, t]) => t.trim()).map(([id, text]) => ({ id, text: text.trim() })), ...(state.overall.trim() ? [{ id: 'overall', text: state.overall.trim() }] : [])]; }
  function changed() {
    state.changed++; $('copy-fallback').hidden = true; const all = allFeedback(); $('feedback-count').textContent = all.length;
    $('feedback-status').textContent = all.length + ' 条批注 · ' + D.revision;
    for (const [id, c] of [...cards, ...mobileCards]) { const count = all.filter(c => c.id === id).length, b = c.querySelector('.badge'); b.hidden = !count; b.textContent = count; }
  }
  $('node-note').addEventListener('input', () => { if (state.selected) { state.drafts[state.selected] = $('node-note').value; changed(); } });
  $('add-note').onclick = () => { const text = $('node-note').value.trim(); if (!text) return; state.comments.push({ id: state.selected, text }); delete state.drafts[state.selected]; changed(); renderDetail(); toast('已加入反馈'); };
  $('overall-note').addEventListener('input', () => { state.overall = $('overall-note').value; changed(); });
  function renderFeedback() {
    const box = $('feedback-items'); box.replaceChildren();
    state.comments.forEach((c, i) => {
      const item = el('article', 'feedback-item'), remove = el('button', '', '移除'), edit = el('button', '', '编辑');
      remove.onclick = () => { state.comments.splice(i, 1); changed(); renderFeedback(); if (state.selected) renderDetail(); };
      edit.onclick = () => {
        const area = el('textarea'); area.value = c.text; area.maxLength = 2000; area.setAttribute('aria-label', '编辑批注'); item.querySelector('p').replaceWith(area); edit.textContent = '完成';
        area.oninput = () => { if (area.value.trim()) { c.text = area.value.trim(); changed(); } };
        edit.onclick = () => { if (!area.value.trim()) { toast('批注不能为空；不需要时请移除'); return; } c.text = area.value.trim(); changed(); renderFeedback(); if (state.selected) renderDetail(); }; area.focus();
      };
      item.append(el('strong', '', nodes.get(c.id)?.title || '整体意见'), remove, edit, el('p', '', c.text)); box.append(item);
    });
    const pending = Object.values(state.drafts).filter(t => t.trim()).length;
    if (pending) box.append(el('p', 'hint', `还有 ${pending} 条输入中的卡片批注，将一并复制。`));
    $('feedback-status').textContent = allFeedback().length + ' 条批注 · ' + D.revision;
  }
  $('open-feedback').onclick = () => { renderFeedback(); $('feedback-dialog').showModal(); };
  $('close-feedback').onclick = () => $('feedback-dialog').close();
  $('copy-feedback').onclick = async () => {
    const text = feedbackText(D, allFeedback()), at = state.changed;
    try { if (!navigator.clipboard?.writeText) throw Error('unavailable'); await navigator.clipboard.writeText(text); state.copied = at; toast('反馈已复制，可以粘贴给 Agent'); }
    catch { $('copy-fallback').hidden = false; $('copy-text').value = text; $('copy-text').focus(); $('copy-text').select(); toast('请手动复制反馈'); }
  };
  $('select-copy-text').onclick = () => { $('copy-text').focus(); $('copy-text').select(); };
  $('copy-text').addEventListener('copy', () => { state.copied = state.changed; toast('反馈已复制'); });
  window.addEventListener('beforeunload', e => { if (allFeedback().length && state.copied !== state.changed) { e.preventDefault(); e.returnValue = ''; } });
  new ResizeObserver(() => { if (mobile()) return; if (fitPending) setView(state.view); else draw(); }).observe(vp);
  setView(D.regions[0].id);
}

function options(args) {
  const result = { src: 'docs/atlas.md', out: 'docs/project-overview.html', json: false, strict: false, positional: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') result.json = true;
    else if (a === '--strict') result.strict = true;
    else if (a === '--src' || a === '--out') { if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`${a} requires a path`); result[a.slice(2)] = args[++i]; }
    else if (a.startsWith('-') && a !== '-') throw Error(`unknown option ${a}`);
    else result.positional.push(a);
  }
  return result;
}

export function main(args = process.argv.slice(2)) {
  let opt;
  try {
    const [command, ...rest] = args;
    if (command === '--help' || command === 'help' || !command) { console.log('atlas build|check|feedback [file|-] [--src docs/atlas.md] [--out docs/project-overview.html] [--json] [--strict]\nRun from a Git project. Node.js 20+; no dependencies.'); return 0; }
    if (!['build', 'check', 'feedback'].includes(command)) throw Error('unknown command');
    opt = options(rest);
    if ((command !== 'feedback' && opt.positional.length) || opt.positional.length > 1) throw Error('unexpected positional arguments');
    const ctx = context(process.cwd(), opt.src, opt.out);
    if (command === 'feedback') {
      const file = opt.positional[0] || '-', input = fs.readFileSync(file === '-' ? 0 : file, 'utf8');
      const result = feedback(input, ctx);
      if (opt.json) console.log(JSON.stringify(result, null, 2));
      else { for (const w of result.warnings) console.log(`WARNING: ${w}`); for (const c of result.comments) console.log(`[${c.id}] ${c.lines ? `L${c.lines[0]}–L${c.lines[1]}` : '(no card range)'}\n${c.text}\n`); }
      return 0;
    }
    const result = inspect(ctx, { artifact: command === 'check' });
    if (command === 'build' && !result.errors.length) { fs.mkdirSync(path.dirname(ctx.output), { recursive: true }); fs.writeFileSync(ctx.output, render(ctx.data)); }
    if (opt.json) console.log(JSON.stringify({ ...result, revision: ctx.data.revision, version: ctx.data.version, output: path.relative(ctx.root, ctx.output) }, null, 2));
    else {
      for (const [label, items] of [['ERROR', result.errors], ['WARNING', result.warnings]]) for (const item of items) { console.log(`${label} ${item.code}${item.card ? ` [${item.card}] L${item.line}` : ''}: ${item.message}`); for (const a of item.affected || []) console.log(`  ${a.path} → ${a.cards.join(', ')}`); }
      console.log(`${result.errors.length} errors, ${result.warnings.length} warnings${command === 'build' && !result.errors.length ? `; built ${path.relative(ctx.root, ctx.output)}` : ''}`);
    }
    return result.errors.length || (opt.strict && result.warnings.length) ? 1 : 0;
  } catch (error) {
    if (opt?.json || args.includes('--json')) console.log(JSON.stringify({ errors: [{ code: 'invalid-format', message: error.message }], warnings: [] }, null, 2));
    else console.error(`ERROR: ${error.message}`);
    return 1;
  }
}

export function isMain(entry = process.argv[1]) {
  if (!entry) return false;
  const resolve = file => {
    try { return fs.realpathSync(file); }
    catch { return path.resolve(file); }
  };
  return resolve(entry) === resolve(fileURLToPath(import.meta.url));
}

if (isMain()) process.exitCode = main();
