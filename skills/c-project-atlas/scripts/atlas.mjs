#!/usr/bin/env node
// MIT. Node.js 20+, no runtime packages.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { layoutTree } from './layout.mjs';
import { associationState } from './associations.mjs';
export { associationState } from './associations.mjs';
export { layoutTree as layout } from './layout.mjs';
export const FORMAT = 2;
export const RENDERER = '0.3.0-r3';
export const BRANCHES = {position:'定位',features:'功能模块',technology:'技术栈',versions:'版本',planning:'规划',decisions:'决策与待定'};
const ID=/^[a-z][a-z0-9-]*$/;
const TYPES=['fact','done','next','decision','open'];
const LAYOUTS=['tree','flow','timeline','group'];
const DATE_KINDS=['decision','record','release','implementation','latest-merge'];
const own=(o,k)=>Object.hasOwn(o,k);
const fail=(line,message)=>{throw new Error(`L${line}: ${message}`)};
const hash=text=>createHash('sha256').update(text).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function viewOptions(input={}) {
  if(!(input!==null&&typeof input==='object'&&!Array.isArray(input))||Object.keys(input).some(k=>!['style','edges','direction'].includes(k)))throw Error('view must contain only style, edges, direction');
  const result={style:'default',edges:'curve',direction:'balanced',...input};
  for(const [key,values] of Object.entries({style:['default','mono'],edges:['curve','orthogonal'],direction:['balanced','right']}))if(!values.includes(result[key]))throw Error(`invalid view ${key}`);
  return result;
}
export function sourceRef(value,line) {
  if(typeof value!=='string')fail(line,'source must be a string');
  const m=/^(.*?)(?::([1-9]\d*))?$/.exec(value),p=m?.[1];
  if(!p||p.startsWith('/')||p.includes('\\')||/[:\x00-\x1f?#]/.test(p)||p.split('/').some(x=>x==='..'||!x))fail(line,'sources must be project-relative paths, optionally :positive-line');
  return {path:p,...(m[2]?{line:Number(m[2])}:{})};
}
function stringValue(raw,line) {
  if(raw.startsWith('"')){try{const s=JSON.parse(raw);if(typeof s==='string')return s}catch{}fail(line,'invalid JSON string')}
  if(/[\x00-\x08]/.test(raw)||/^[\[\]{}&*!>|]/.test(raw))fail(line,'expected plain text or JSON string');return raw;
}
export function parse(text) {
  const lines=text.replace(/\r\n/g,'\n').split('\n');
  const migrate='v1 is not supported; rewrite headings/lists and JSON metadata as atlas/2; see references/format.md#迁移-v1';
  if(/(^|\n)```card\b|\{#[^}]+ layout=grid\}/.test(text))fail(1,migrate);
  if(lines[0]!=='---')fail(1,'frontmatter must start with ---');
  let i=1;const meta={};
  for(;i<lines.length&&lines[i]!=='---';i++){
    if(!lines[i].trim())continue;const m=/^(schema|project|title|view):\s*(.*)$/.exec(lines[i]);
    if(!m||own(meta,m[1]))fail(i+1,'invalid or duplicate frontmatter field');
    try{meta[m[1]]=m[1]==='view'?viewOptions(JSON.parse(m[2])):stringValue(m[2],i+1)}catch(e){fail(i+1,e.message)}
  }
  if(meta.schema!=='atlas/2')fail(1,migrate);
  if(i===lines.length)fail(i+1,'unclosed frontmatter');
  const nodes=[],stack=[],ids=new Set();let root;
  for(i++;i<lines.length;i++){
    if(!lines[i].trim())continue;
    let depth,title,id,indent='';const heading=/^(#{1,2}) (.+?) \{#([a-z][a-z0-9-]*)\}$/.exec(lines[i]),list=/^( *)- (.+?) \{#([a-z][a-z0-9-]*)\}$/.exec(lines[i]);
    if(heading){depth=heading[1].length-1;title=heading[2];id=heading[3]}
    else if(list){indent=list[1];if(indent.length%2)fail(i+1,'list indentation must use two spaces');depth=indent.length/2+2;title=list[2];id=list[3]}
    else fail(i+1,'expected # root, ## fixed branch, or nested list node with stable ID');
    if(!title.trim()||/[\x00-\x1f]/.test(title))fail(i+1,'invalid node title');
    if(ids.has(id)||id==='overall')fail(i+1,'duplicate or reserved node ID');ids.add(id);
    if(depth===0){if(root)fail(i+1,'only one root allowed')}
    else if(!stack[depth-1])fail(i+1,'node cannot skip a level');
    if(depth===1&&BRANCHES[id]!==title)fail(i+1,'first-level branches must use fixed IDs and names: '+Object.entries(BRANCHES).map(([k,v])=>`${k}=${v}`).join(', '));
    const startLine=i+1;const next=lines[++i];
    const mm=next&&/^( *)<!-- atlas-meta (\{.*\}) -->$/.exec(next);
    if(!mm||mm[1]!==indent)fail(i+1,'node requires one adjacent JSON atlas-meta comment at matching indentation');
    let fields;try{fields=JSON.parse(mm[2])}catch{fail(i+1,'invalid metadata JSON')}
    const allowed=['subtitle','summary','detail','sources','commits','tags','links','type','date','date_kind','date_status','date_note','reason','layout','group','legacy_ids'];
    if(!object(fields)||Object.keys(fields).some(k=>!allowed.includes(k)))fail(i+1,'unknown metadata field; coordinates and arbitrary HTML are not supported');
    for(const k of ['subtitle','summary','detail','reason','date_note','group'])if(own(fields,k)&&(typeof fields[k]!=='string'||!fields[k].trim()))fail(i+1,`${k} must be nonempty text`);
    if(fields.subtitle&&/[\r\n]/.test(fields.subtitle))fail(i+1,'subtitle must be a single line');
    if(!fields.detail)fail(startLine,'detail required');
    for(const k of ['sources','commits','tags','legacy_ids'])if(own(fields,k)&&(!Array.isArray(fields[k])||fields[k].some(s=>typeof s!=='string'||!s.trim())))fail(i+1,`${k} must be a string array`);
    if(!fields.sources?.length)fail(startLine,'sources required for every node');
    const n={...fields,id,title,depth,startLine,endLine:i+1,children:[],type:own(fields,'type')?fields.type:'fact',sources:fields.sources.map(s=>sourceRef(s,i+1)),commits:fields.commits||[],tags:fields.tags||[],links:fields.links||[],legacy_ids:fields.legacy_ids||[]};
    if(!TYPES.includes(n.type))fail(startLine,'unknown node type');
    if(own(fields,'layout')&&!LAYOUTS.includes(n.layout))fail(startLine,'layout must be tree, flow, timeline, or group');
    if(n.commits.some(c=>!/^[0-9a-f]{7,40}$/.test(c)))fail(startLine,'commits must be Git hexadecimal object IDs');
    if(n.legacy_ids.some(s=>!ID.test(s)||s==='overall'))fail(startLine,'invalid legacy ID');
    if(!Array.isArray(n.links)||n.links.some(l=>!object(l)||Object.keys(l).some(k=>!['target','label','kind'].includes(k))||typeof l.target!=='string'||!ID.test(l.target)||(own(l,'label')&&typeof l.label!=='string')||(own(l,'kind')&&l.kind!=='cross')))fail(startLine,'links must contain target, optional label and kind: cross');
    if(n.links.some(l=>l.kind==='cross'&&!l.label?.trim()))fail(startLine,'cross relation requires a meaningful label');
    if(n.date){if(typeof n.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(n.date)||!Number.isFinite(Date.parse(n.date))||new Date(n.date).toISOString().slice(0,10)!==n.date)fail(startLine,'date must be a valid YYYY-MM-DD');if(!DATE_KINDS.includes(n.date_kind))fail(startLine,'date requires an explicit date_kind')}
    else if(own(n,'date')||own(n,'date_kind'))fail(startLine,'date and date_kind must appear together');
    if(own(n,'date_status')&&(n.date_status!=='unknown'||n.date))fail(startLine,'date_status only accepts unknown without a date');
    if(n.type==='decision'&&(!n.date||!n.reason))fail(startLine,'decision requires date, date_kind and reason');
    if(depth===0)root=n;else {n.parent=stack[depth-1].id;stack[depth-1].children.push(n)}
    stack.length=depth;stack.push(n);nodes.push(n);
  }
  if(!root||!root.children.length)fail(1,'a root and at least one fixed branch are required');
  const aliases=new Map();for(const n of nodes)for(const alias of n.legacy_ids){if(aliases.has(alias)||(ids.has(alias)&&alias!==n.id))fail(n.startLine,'ambiguous legacy ID');aliases.set(alias,n.id)}
  for(const n of nodes){n.layout=n.layout||(n.parent?nodes.find(p=>p.id===n.parent).layout:'tree');if(n.subtitle&&!['flow','group'].includes(n.layout))fail(n.startLine,'subtitle requires a flow or group container');if(n.layout==='timeline')for(const c of n.children)if(!c.date&&c.date_status!=='unknown')fail(c.startLine,'timeline child requires date/date_kind or date_status: unknown')}
  return {project:meta.project||'',title:meta.title||root.title,view:meta.view||viewOptions(),root,nodes};
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
  return { root, source, output, data: { ...data, format: FORMAT, renderer: RENDERER, sourceHash, version: `atlas-2-${sourceHash.slice(0, 12)}`, revision, generated, sourceBase } };
}

function inside(root, p) { const rel = path.relative(root, p); return !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); }
const issue = (code, message, card) => ({ code, message, ...(card ? { node: card.id, line: card.startLine } : {}) });

export function inspect(ctx, { artifact = true } = {}) {
  const { root, data, output } = ctx, errors = [], warnings = [];
  const ids = new Set(data.nodes.map(c => c.id));
  for (const c of data.nodes) {
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
  for (const type of ['done','next','decision','open']) if (!data.nodes.some(n => n.type===type)) warnings.push(issue('missing-state', `no ${type} node; explicitly record unknown plans or open questions`));
  if (artifact) {
    let built;
    try { built = readArtifact(fs.readFileSync(output, 'utf8')); } catch { /* warning below */ }
    if (!built || built.sourceHash !== data.sourceHash || built.format !== FORMAT || built.renderer !== RENDERER) warnings.push(issue('stale-html', 'HTML missing, invalid, or not built from current source'));
    if (built) {
      try {
        if (!/^[0-9a-f]{7,40}$/.test(built.revision)) throw Error('invalid revision');
        git(root, 'merge-base', '--is-ancestor', built.revision, 'HEAD');
        const count = Number(git(root, 'rev-list', '--count', `${built.revision}..HEAD`));
        if (count) {
          const changed = git(root, 'log', '--format=', '--name-only', '-z', `${built.revision}..HEAD`).split('\0');
          const affected = [...new Set(data.nodes.flatMap(c => c.sources.map(s => s.path)))].filter(p => changed.includes(p)).map(p => ({ path: p, nodes: data.nodes.filter(c => c.sources.some(s => s.path === p)).map(c => c.id) }));
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



// The page and CLI use the same wire serializer. Version 1 envelopes are read only
// for legacy ID migration; content format 1 is never parsed.
export function feedbackText(data,comments){
 return '# 项目概览反馈\nATLAS-FEEDBACK/2\n```json\n'+JSON.stringify({schema_version:2,overview_version:data.version,revision:data.revision,comments},null,2)+'\n```\n';
}
export function feedback(text,ctx){
 const m=/^# 项目概览反馈\r?\nATLAS-FEEDBACK\/(1|2)\r?\n```json\r?\n([\s\S]*)\r?\n```\s*$/.exec(text.trim());
 if(!m)throw Error('invalid feedback envelope; expected ATLAS-FEEDBACK/2');
 const v=JSON.parse(m[2]);
 if(!object(v)||Object.keys(v).some(k=>!['schema_version','overview_version','revision','comments'].includes(k))||v.schema_version!==Number(m[1])||typeof v.overview_version!=='string'||typeof v.revision!=='string'||!/^[0-9a-f]{7,40}$/.test(v.revision)||!Array.isArray(v.comments))throw Error('invalid feedback metadata');
 const warnings=[],nodes=new Map(ctx.data.nodes.map(n=>[n.id,n])),aliases=new Map(ctx.data.nodes.flatMap(n=>n.legacy_ids.map(id=>[id,n])));
 if(v.schema_version===1)warnings.push('legacy feedback envelope; IDs mapped to atlas/2 nodes');
 if(v.overview_version!==ctx.data.version)warnings.push('overview version differs from current source');
 if(v.revision!==ctx.data.revision)warnings.push('feedback revision differs from HEAD');
 const comments=v.comments.map(c=>{
  if(!object(c)||Object.keys(c).some(k=>!['id','text'].includes(k))||typeof c.id!=='string'||!ID.test(c.id)||typeof c.text!=='string'||!c.text.trim())throw Error('invalid feedback comment');
  const n=nodes.get(c.id)||aliases.get(c.id);if(!n&&c.id!=='overall')warnings.push(`node ${c.id} no longer exists`);
  return {id:n?.id||c.id,...(n&&n.id!==c.id?{legacy_id:c.id}:{}),text:c.text,lines:n?[n.startLine,n.endLine]:null};
 });
 return {schema_version:2,overview_version:v.overview_version,revision:v.revision,comments,warnings};
}
export function render(data){
 const template=fs.readFileSync(new URL('../assets/page.html',import.meta.url),'utf8');
 const json=JSON.stringify(data).replace(/</g,'\\u003c');
 return template.replace('__ATLAS_DATA__',()=>json).replace('__ATLAS_LAYOUT__',()=>layoutTree.toString()).replace('__ATLAS_ASSOCIATIONS__',()=>associationState.toString()).replace('__ATLAS_VIEW__',()=>viewOptions.toString()).replace('__ATLAS_FEEDBACK__',()=>feedbackText.toString());
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
      else { for (const w of result.warnings) console.log(`WARNING: ${w}`); for (const c of result.comments) console.log(`[${c.id}] ${c.lines ? `L${c.lines[0]}–L${c.lines[1]}` : '(no node range)'}\n${c.text}\n`); }
      return 0;
    }
    const result = inspect(ctx, { artifact: command === 'check' });
    if (command === 'build' && !result.errors.length) { fs.mkdirSync(path.dirname(ctx.output), { recursive: true }); fs.writeFileSync(ctx.output, render(ctx.data)); }
    if (opt.json) console.log(JSON.stringify({ ...result, revision: ctx.data.revision, version: ctx.data.version, output: path.relative(ctx.root, ctx.output) }, null, 2));
    else {
      for (const [label, items] of [['ERROR', result.errors], ['WARNING', result.warnings]]) for (const item of items) { console.log(`${label} ${item.code}${item.node ? ` [${item.node}] L${item.line}` : ''}: ${item.message}`); for (const a of item.affected || []) console.log(`  ${a.path} → ${a.nodes.join(', ')}`); }
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
