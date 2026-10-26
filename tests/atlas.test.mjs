import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, context, inspect, layout, render, readArtifact, feedbackText, feedback } from '../skills/c-project-atlas/scripts/atlas.mjs';

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
