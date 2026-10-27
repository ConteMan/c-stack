// Fictional shared fixture for script and actual SVG text regression tests.
import {BRANCHES} from '../skills/c-project-atlas/scripts/atlas.mjs';
export const item=(title,id,meta={},indent=0)=>`${'  '.repeat(indent)}- ${title} {#${id}}\n${'  '.repeat(indent)}<!-- atlas-meta ${JSON.stringify({detail:'虚构书目记录。',sources:['README.md:1'],...meta})} -->\n`;
const branch=(id,body,meta={})=>`## ${BRANCHES[id]} {#${id}}\n<!-- atlas-meta ${JSON.stringify({detail:'虚构的项目入口。',sources:['README.md'],layout:'tree',...meta})} -->\n${body}`;
export const source=`---\nschema: atlas/2\nproject: paper-garden\ntitle: 纸园概览\n---\n# Paper Garden {#project}\n<!-- atlas-meta {"detail":"本地书目工具。","sources":["README.md"]} -->\n`+
branch('position',item('个人书目','purpose',{legacy_ids:['old-purpose'],links:[{target:'catalog',label:'使用目录',kind:'cross'}]})+item('使用边界','boundary'))+
branch('features',item('图书登记','catalog',{links:[{target:'choice',label:'遵循决定'}]})+item('借阅','loans')+item('读者','readers',{},1))+
branch('technology',item('从书目登记到保存与查询','pipeline',{layout:'flow',subtitle:'按顺序登记书目'})+item('录入','intake',{},1)+item('校验','verify',{},1)+item('保存','store',{},1)+item('查询','query',{},1))+
branch('versions',item('版本未记录','no-version',{date_status:'unknown'})+item('本地目录已可用','shipped',{type:'done',date:'2026-01-02',date_kind:'record'}),{layout:'timeline'})+
branch('planning',item('下一步未定','next',{type:'next'}))+
branch('decisions',item('先保持本地','choice',{type:'decision',group:'已决定',date:'2026-01-02',date_kind:'decision',reason:'先验证个人整理。',links:[{target:'catalog',label:'本地登记',kind:'cross'}]})+item('同步方式待定','open',{type:'open',group:'待定'}),{layout:'group'});
