import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, context, inspect, layout, readingCamera, render, readArtifact, feedbackText, feedback, isMain } from '../skills/c-project-atlas/scripts/atlas.mjs';

const cli = fileURLToPath(new URL('../skills/c-project-atlas/scripts/atlas.mjs', import.meta.url));
// Fictional project. No production data, accounts, or network services.
const source = `---
project: paper-garden
title: 项目概览
---

## 全貌 {#overview layout=grid}

\`\`\`card id=purpose
title: 整理纸质书的借阅
summary: 记录书在哪里，借给了谁。
detail: |
  这是一个虚构的本地书目工具。
tags: 本地, 书目
sources: README.md:1
links: catalog "归档, 查询"
\`\`\`

## 数据主线 {#flow layout=flow}

\`\`\`card id=catalog
title: 书目
summary: 将录入的书保存下来。
detail: 数据保存在本地。
sources: ["src/catalog.js:2", "docs/design notes.md"]
\`\`\`

## 现状与决策 {#status layout=grid}

\`\`\`card id=choice
type: decision
title: 先做好本地书目
summary: 暂时只支持单人使用。
detail: 团队共享还没有实现。
date: 2026-01-02
reason: 先验证个人整理需求。
sources: README.md:2
\`\`\`
`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'docs')); fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'README.md'), '# Paper Garden\n先验证个人整理需求。\n');
  fs.writeFileSync(path.join(root, 'src/catalog.js'), '// fictional catalog\nexport const books = [];\n');
  fs.writeFileSync(path.join(root, 'docs/design notes.md'), '虚构项目的设计。\n');
  fs.writeFileSync(path.join(root, 'docs/atlas.md'), source);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2026-01-02T03:04:05+00:00', GIT_COMMITTER_DATE: '2026-01-02T03:04:05+00:00' } }).trim();
  git('init', '-q'); git('config', 'user.name', 'Atlas Tests'); git('config', 'user.email', 'atlas-tests');
  git('add', '.'); git('commit', '-qm', 'Initialize fictional garden');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  const write = text => fs.writeFileSync(path.join(root, 'docs/atlas.md'), text);
  return { root, git, run, write, ctx: () => context(root) };
}

test('parse preserves text, source line ranges, commas in link labels and JSON path lists', () => {
  const d = parse(source), c = d.cards[0];
  assert.equal(d.sections[1].layout, 'flow'); assert.equal(c.detail, '这是一个虚构的本地书目工具。');
  assert.deepEqual(c.links, [{ target: 'catalog', label: '归档, 查询' }]);
  assert.equal(d.cards[1].sources[1].path, 'docs/design notes.md');
  assert.deepEqual(parse(source.replace('links: catalog "归档, 查询"', 'links: catalog "归档, 查询", choice "决定"')).cards[0].links, [{ target: 'catalog', label: '归档, 查询' }, { target: 'choice', label: '决定' }]);
  const lines = source.split('\n'); assert.equal(lines[c.startLine - 1], '```card id=purpose'); assert.equal(lines[c.endLine - 1], '```');
});

test('invalid grammar, duplicate IDs, missing evidence, dates and coordinates fail', () => {
  for (const input of [
    source.replace('id=catalog', 'id=purpose'), source.replace('id=purpose', 'id=overall'),
    source.replace('layout=grid', 'layout=manual'), source.replace('title: 书目', 'x: 300'),
    source.replace('sources: README.md:1', 'sources: ../secret'), source.replace('sources: README.md:1', 'sources: README.md:0'),
    source.replace('sources: README.md:1', 'sources: https://example.invalid'),
    source.replace('sources: README.md:1', ''), source.replace('date: 2026-01-02', 'date: 2026-02-30'),
    source.replace('reason: 先验证个人整理需求。', ''), source.replace('type: decision', 'type: mystery'),
    source.replace('title: 书目', 'title: 书目\ntitle: duplicate'), source.replace('project: paper-garden', 'project: [garden]'),
    source.replace('## 数据主线 {#flow layout=flow}', '## 数据主线 {#overview layout=flow}'),
    source.replace('links: catalog "归档, 查询"', 'links: catalog garbage'), source.slice(0, -5),
  ]) assert.throws(() => parse(input), /L\d+:/);
});

test('check reports every graph/source error and refuses to build invalid content', t => {
  const f = fixture(t);
  f.write(source.replace('links: catalog', 'links: absent').replace('README.md:1', 'README.md:99').replace('src/catalog.js:2', 'src/missing.js'));
  const r = f.run('check', '--json'); assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout).errors.map(e => e.code).sort(), ['missing-source', 'source-line', 'unknown-link']);
  assert.equal(f.run('build').status, 1); assert.equal(fs.existsSync(path.join(f.root, 'docs/project-overview.html')), false);
  f.write(source.replace('id=catalog', 'id=purpose'));
  assert.equal(JSON.parse(f.run('check', '--json').stdout).errors[0].code, 'invalid-format');
  f.write(source.replace('title: 书目', 'title: 书目\ncommits: 0000000'));
  assert.equal(inspect(f.ctx()).errors[0].code, 'missing-commit');
  f.write(source.replace('title: 书目', 'title: 书目\ncommits: main'));
  assert.throws(() => f.ctx(), /commits must/);
});

test('sources cannot escape through symlinks; empty-file line one is invalid', t => {
  const f = fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-external-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.writeFileSync(path.join(external, 'private.md'), 'private');
  fs.symlinkSync(path.join(external, 'private.md'), path.join(f.root, 'outside.md'));
  f.write(source.replace('README.md:1', 'outside.md'));
  assert.equal(inspect(f.ctx()).errors[0].code, 'missing-source');
  fs.writeFileSync(path.join(f.root, 'empty.md'), ''); f.write(source.replace('README.md:1', 'empty.md:1'));
  assert.equal(inspect(f.ctx()).errors[0].code, 'source-line');
  assert.equal(f.run('build', '--out', '../outside.html').status, 1);
  assert.equal(f.run('build', '--out', 'docs/atlas.md').status, 1);
});

test('detail/status/artifact warnings, warning exit code, strict exit code', t => {
  const f = fixture(t);
  f.write(source.replace('这是一个虚构的本地书目工具。', '一。二。三。四。').replace('#status', '#progress'));
  let r = f.run('check', '--json'); assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout).warnings.map(w => w.code), ['dense-detail', 'missing-status', 'stale-html']);
  assert.equal(f.run('check', '--strict').status, 1);
  f.write(source.replace('这是一个虚构的本地书目工具。', '书'.repeat(121)));
  assert.equal(inspect(f.ctx()).warnings[0].code, 'dense-detail');
  f.write(source); assert.equal(f.run('build').status, 0);
  f.write(source.replace('记录书在哪里', '记录图书在哪里'));
  assert.equal(inspect(f.ctx()).warnings[0].code, 'stale-html');
});

test('new commits identify changed referenced files and only affected cards', t => {
  const f = fixture(t); assert.equal(f.run('build').status, 0);
  fs.appendFileSync(path.join(f.root, 'src/catalog.js'), '// changed\n'); f.git('add', 'src/catalog.js'); f.git('commit', '-qm', 'Extend catalog');
  fs.writeFileSync(path.join(f.root, 'other.txt'), 'not referenced'); f.git('add', 'other.txt'); f.git('commit', '-qm', 'Unrelated change');
  const result = JSON.parse(f.run('check', '--json').stdout), w = result.warnings.find(w => w.code === 'new-commits');
  assert.equal(w.count, 2); assert.deepEqual(w.affected, [{ path: 'src/catalog.js', cards: ['catalog'] }]);
  f.git('checkout', 'HEAD~2', '--', 'src/catalog.js'); f.git('commit', '-qm', 'Restore catalog');
  const restored = inspect(f.ctx()).warnings.find(w => w.code === 'new-commits');
  assert.equal(restored.count, 3); assert.deepEqual(restored.affected, w.affected);
  const p = path.join(f.root, 'docs/project-overview.html'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/"revision":"[a-f0-9]+"/, '"revision":"0000000"'));
  assert.equal(inspect(f.ctx()).warnings[0].code, 'revision-unavailable');
});

test('build is byte identical; commit date, short revision and source hash are embedded', t => {
  const f = fixture(t); assert.equal(f.run('build').status, 0);
  const p = path.join(f.root, 'docs/project-overview.html'), first = fs.readFileSync(p);
  assert.equal(f.run('build').status, 0); assert.deepEqual(fs.readFileSync(p), first);
  const d = readArtifact(first.toString()); assert.equal(d.generated, f.git('show', '-s', '--format=%cI', 'HEAD')); assert.equal(d.revision, f.git('rev-parse', '--short=12', 'HEAD')); assert.match(d.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(f.run('check', '--strict').status, 0);
  assert.deepEqual(layout(d), layout(d));
  const changed = parse(source.replace('记录书在哪里', '查看书在哪里'));
  assert.deepEqual(layout(changed).nodes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })), layout(parse(source)).nodes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
});

test('non-ancestor revision explains squash/rebase recovery and rebuilding restores history checks', t => {
  const f = fixture(t);
  f.git('checkout', '-qb', 'topic');
  fs.writeFileSync(path.join(f.root, 'other.txt'), 'topic work');
  f.git('add', 'other.txt'); f.git('commit', '-qm', 'Topic work');
  assert.equal(f.run('build').status, 0);
  f.git('checkout', '-q', '--detach', 'HEAD~1');
  const result = JSON.parse(f.run('check', '--json').stdout);
  const warning = result.warnings.find(w => w.code === 'revision-unavailable');
  assert.ok(warning); assert.match(warning.message, /squash\/rebase/);
  assert.match(warning.message, /build on the main branch.*commit HTML separately/);
  assert.equal(f.run('build').status, 0);
  assert.equal(f.run('check', '--strict').status, 0);
});

test('renderer escapes untrusted content and embeds executable JavaScript, no external resource tags', t => {
  const f = fixture(t); const ctx = f.ctx(); ctx.data.cards[0].detail = '</script><img src=x onerror=alert(1)>';
  const html = render(ctx.data); assert.ok(!html.includes('<img src=x')); assert.ok(!/<(?:script|link|img)[^>]+(?:src|href)=/i.test(html));
  const script = html.match(/<script>'use strict';([\s\S]*?)<\/script>/)[1]; assert.doesNotThrow(() => new vm.Script(script));
  assert.equal(readArtifact(html).cards[0].detail, ctx.data.cards[0].detail);
});

test('actual renderer feedback serializer round-trips multiline, fence-like text, overall and source ranges', t => {
  const f = fixture(t), ctx = f.ctx(), html = render(ctx.data);
  // Execute the serializer shipped inside HTML, not a separate handwritten sample.
  const serializer = html.match(/(function feedbackText[\s\S]*?)\n\(function browser/)[1];
  const comments = [{ id: 'purpose', text: '请解释\n```\n## 看起来像标题\n"保留引号"' }, { id: 'overall', text: '先看进展。' }];
  const text = vm.runInNewContext(serializer + '\nfeedbackText', {})(ctx.data, comments);
  assert.equal(text, feedbackText(ctx.data, comments));
  const r = feedback(text, ctx); assert.deepEqual(r.comments[0], { ...comments[0], lines: [8, 16] }); assert.equal(r.comments[1].lines, null); assert.deepEqual(r.warnings, []);
  const cmd = spawnSync(process.execPath, [cli, 'feedback', '-', '--json'], { cwd: f.root, input: text, encoding: 'utf8' }); assert.equal(cmd.status, 0); assert.deepEqual(JSON.parse(cmd.stdout).comments, r.comments);
  const file = path.join(f.root, 'feedback.txt'); fs.writeFileSync(file, text); assert.equal(f.run('feedback', file).status, 0);
  const stale = feedbackText({ version: 'old', revision: '0000000' }, [{ id: 'removed', text: '仍然能读' }]); assert.equal(feedback(stale, ctx).warnings.length, 3);
  for (const bad of ['ATLAS-FEEDBACK/2', text.replace('"schema_version": 1', '"schema_version": 2'), text.replace('"id": "purpose"', '"id": "../escape"')]) assert.throws(() => feedback(bad, ctx));
});

test('CLI diagnoses bad commands and options and works from project subdirectories', t => {
  const f = fixture(t);
  assert.equal(f.run('--help').status, 0);
  for (const args of [['oops'], ['build', '--src'], ['check', '--oops'], ['check', 'unexpected']]) assert.equal(f.run(...args).status, 1);
  const r = spawnSync(process.execPath, [cli, 'build'], { cwd: path.join(f.root, 'docs'), encoding: 'utf8' }); assert.equal(r.status, 0);
});

test('CLI check runs through file and chained directory symlinks with correct exit codes', t => {
  const f = fixture(t);
  const links = path.join(f.root, 'links'); fs.mkdirSync(links);
  const fileLink = path.join(links, 'atlas.mjs');
  fs.symlinkSync(cli, fileLink);
  const library = path.join(links, 'library'), client = path.join(links, 'client');
  fs.symlinkSync(path.dirname(path.dirname(cli)), library, 'dir');
  fs.symlinkSync(library, client, 'dir');
  for (const entry of [fileLink, path.join(client, 'scripts/atlas.mjs')]) {
    const run = (...args) => spawnSync(process.execPath, [entry, 'check', '--json', ...args], { cwd: f.root, encoding: 'utf8' });
    let r = run(); assert.equal(r.status, 0); assert.equal(r.stderr, '');
    assert.notEqual(r.stdout.trim(), '', 'symlink invocation must execute check');
    assert.deepEqual(JSON.parse(r.stdout).errors, []);
    assert.ok(JSON.parse(r.stdout).warnings.some(w => w.code === 'stale-html'));
    assert.equal(run('--strict').status, 1);
    f.write(source.replace('links: catalog', 'links: absent'));
    r = run(); assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).errors[0].code, 'unknown-link');
    f.write(source);
  }
});

test('entry detection falls back to resolved paths when realpath fails, and imports stay inert', t => {
  assert.equal(isMain(cli), true); assert.equal(isMain(''), false);
  t.mock.method(fs, 'realpathSync', () => { throw new Error('path unavailable'); });
  assert.equal(isMain(cli), true);
  assert.equal(isMain(path.join(path.dirname(cli), 'other.mjs')), false);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(cli)})`], { encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.equal(r.stderr, '');
});

// Fictional library workflow, with enough cards and feedback edges to exercise routing.
function routingFixture() {
  const groups = [
    ['overview', 'grid', ['purpose', 'experience', 'boundary']],
    ['flow', 'flow', ['intake', 'parse', 'catalog', 'query', 'page', 'reader']],
    ['controls', 'grid', ['account', 'writer', 'schedule', 'preferences', 'limits']],
    ['status', 'grid', ['shipped', 'next', 'decision', 'open']],
  ];
  const edges = {
    parse: [['catalog', '整理书目']], catalog: [['query', '查询']], query: [['page', '结果']], page: [['reader', '阅读']],
    reader: [['writer', '登记借阅']], account: [['parse', '授权']], writer: [['catalog', '更新']], schedule: [['writer', '提醒']],
    purpose: [['reader', '访问'], ['reader', '再次访问'], ['purpose', '自身关联']],
    intake: [['parse', '录入'], ['reader', '跳过中间卡片的较长关联标签']],
    open: [['boundary', '待确认']], limits: [['experience', '边界']],
  };
  const titles = { purpose: '把书目与借阅放在一起', experience: '录入、借阅和查询', boundary: '只处理个人书目', intake: '录入图书', parse: '识别书目信息', catalog: '保存书目', query: '查询借阅', page: '本机页面', reader: '读者', account: '借阅身份', writer: '借阅登记', schedule: '归还提醒', preferences: '阅读偏好', limits: '使用边界', shipped: '书目登记已可用', next: '下一阶段待确认', decision: '先验证本地整理', open: '共享方式仍待确定' };
  return {
    project: 'paper-garden', title: '虚构书目项目',
    sections: groups.map(([id, kind, cards], i) => ({ id, title: ['全貌', '数据主线', '运行与边界', '现状与决策'][i], layout: kind, cards })),
    cards: groups.flatMap(([section, , ids]) => ids.map(id => ({ id, section, title: titles[id], summary: '虚构书目的记录与借阅。', detail: '仅供测试的虚构内容。', sources: [{ path: 'README.md', line: 1 }], commits: [], tags: [], type: 'fact', links: (edges[id] || []).map(([target, label]) => ({ target, label })) }))),
  };
}

// Independent open-rectangle clipping, including diagonal segments if a regression adds one.
function intersectsInterior(a, b, r) {
  let low = 0, high = 1;
  for (const [p, delta, min, max] of [[a.x, b.x - a.x, r.x, r.x + r.w], [a.y, b.y - a.y, r.y, r.y + r.h]]) {
    if (delta === 0) { if (p <= min || p >= max) return false; }
    else { const u = (min - p) / delta, v = (max - p) / delta; low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v)); }
  }
  return low < high && high > 0 && low < 1;
}

test('flow is one left-to-right row; grid remains multiple columns, independent of prose', () => {
  const input = routingFixture(), d = layout(input);
  const flow = d.nodes.filter(n => n.section === 'flow');
  assert.equal(new Set(flow.map(n => n.y)).size, 1);
  assert.ok(flow.every((n, i) => !i || n.x > flow[i - 1].x + flow[i - 1].w));
  const grid = d.nodes.filter(n => n.section === 'controls');
  assert.equal(new Set(grid.map(n => n.x)).size, 3); assert.equal(new Set(grid.map(n => n.y)).size, 2);
  const shorter = structuredClone(input); shorter.cards.forEach(n => { n.summary = '另一句摘要'; n.title = '更长的标题也不能改变坐标'; });
  const boxes = data => layout(data).nodes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
  assert.deepEqual(boxes(input), boxes(shorter)); assert.deepEqual(d, layout(input));
});

test('all compiled edge segments avoid non-endpoint cards; labels avoid every card', () => {
  const d = layout(routingFixture());
  assert.ok(d.routes.length > 5, 'exercise more than adjacent flow arrows');
  const allLinks = d.nodes.flatMap(n => n.links.map(l => [n.id, l.target, l.label]));
  assert.deepEqual([...d.routes, ...d.omitted].map(r => [r.from, r.to, r.label]).sort(), allLinks.sort());
  assert.ok(d.omitted.some(r => r.from === r.to), 'unroutable relations survive in details');
  for (const edge of d.routes) {
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1], b = edge.points[i];
      assert.ok(a.x === b.x || a.y === b.y, 'only horizontal or vertical line segments');
      for (const n of d.nodes.filter(n => n.id !== edge.from && n.id !== edge.to)) assert.equal(intersectsInterior(a, b, { x: n.x - 1, y: n.y - 1, w: n.w + 2, h: n.h + 2 }), false, `${edge.from} → ${edge.to} touches ${n.id}`);
      // Endpoints may touch their own card borders, never pass through their interiors.
      for (const n of d.nodes.filter(n => n.id === edge.from || n.id === edge.to)) assert.equal(intersectsInterior(a, b, n), false);
    }
    if (edge.labelBox) for (const n of d.nodes) {
      const r = edge.labelBox;
      assert.equal(r.x < n.x + n.w && r.x + r.w > n.x && r.y < n.y + n.h && r.y + r.h > n.y, false, 'label overlaps a card');
    }
  }
  const flowIds = d.regions.find(r => r.id === 'flow').cards;
  for (let i = 0; i < flowIds.length - 1; i++) {
    const edge = d.routes.find(r => r.from === flowIds[i] && r.to === flowIds[i + 1]);
    assert.ok(edge); assert.equal(edge.points.length, 2); assert.equal(edge.points[0].y, edge.points[1].y);
  }
  // Parallel edges use separate tracks rather than hiding behind each other.
  const lines = d.routes.flatMap(edge => edge.points.slice(1).map((p, i) => ({ edge, a: edge.points[i], b: p })));
  for (const l of lines) for (const r of lines) if (l.edge !== r.edge) {
    if (l.a.y === l.b.y && r.a.y === r.b.y && Math.abs(l.a.y - r.a.y) < 10) assert.ok(Math.max(Math.min(l.a.x, l.b.x), Math.min(r.a.x, r.b.x)) >= Math.min(Math.max(l.a.x, l.b.x), Math.max(r.a.x, r.b.x)));
    if (l.a.x === l.b.x && r.a.x === r.b.x && Math.abs(l.a.x - r.a.x) < 10) assert.ok(Math.max(Math.min(l.a.y, l.b.y), Math.min(r.a.y, r.b.y)) >= Math.min(Math.max(l.a.y, l.b.y), Math.max(r.a.y, r.b.y)));
  }
});

test('initial reading camera keeps titles legible even on very wide canvases', () => {
  const d = layout(routingFixture());
  for (const width of [420, 600, 1230, 1700]) for (const region of [...d.regions, { x: 20, y: 26, w: 20000 }]) {
    const camera = readingCamera(region, width);
    assert.ok(23 * camera.z >= 12); assert.equal(camera.x + region.x * camera.z, 32);
    assert.equal(camera.y + region.y * camera.z, 28);
  }
});
