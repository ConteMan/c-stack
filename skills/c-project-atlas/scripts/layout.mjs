// MIT. Pure deterministic hybrid block layout, shared by CLI, browser and geometry tests.
export function layoutTree(root, options = {}) {
const view={style:'default',edges:'curve',direction:'balanced',...(options.view||{})};
const expanded=new Set(options.expanded||[]);
if(!options.expanded){const visit=n=>{if(n.depth<2)expanded.add(n.id);n.children.forEach(visit)};visit(root)}
const palette=['0','1','2','3','4','5'];
function textWidth(text,font){return [...text].reduce((sum,c)=>sum+(/[^\x00-\x7f]/.test(c)?font:/[MW@#]/.test(c)?font:/[A-Z]/.test(c)?font*.78:font*.64),0)}
function size(n){const font=n.depth===0?30:n.depth===1?19:n.depth===2?15:14;
const width=textWidth(n.title,font);
return {w:Math.ceil(width)+28,h:n.depth===0?66:n.depth===1?43:36,font}}
function emptyBlock(){return {nodes:[],edges:[],frames:[],decor:[]}}
function put(b,child,dx,dy){for(const n of child.nodes)b.nodes.push({...n,x:n.x+dx,y:n.y+dy});for(const e of child.edges)b.edges.push({...e,x1:e.x1+dx,y1:e.y1+dy,x2:e.x2+dx,y2:e.y2+dy});for(const f of child.frames)b.frames.push({...f,x:f.x+dx,y:f.y+dy});for(const t of child.decor)b.decor.push({...t,x:t.x+dx,y:t.y+dy,y2:t.y2===undefined?undefined:t.y2+dy})}
function bounds(b){let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;for(const n of b.nodes){const marker=n.n.children.length&&n.n.depth>0?Math.max(38,textWidth(String(n.n.children.length),11)+17):0;x1=Math.min(x1,n.x-n.w/2-(n.side<0?marker:0));x2=Math.max(x2,n.x+n.w/2+(n.side>0?marker:0));y1=Math.min(y1,n.y-n.h/2);y2=Math.max(y2,n.y+n.h/2)}for(const f of b.frames){x1=Math.min(x1,f.x);x2=Math.max(x2,f.x+f.w);y1=Math.min(y1,f.y);y2=Math.max(y2,f.y+f.h)}for(const t of b.decor){x1=Math.min(x1,t.x-3);x2=Math.max(x2,t.x+(t.width||0));y1=Math.min(y1,t.y-13);y2=Math.max(y2,(t.y2??t.y)+5)}return {x1,y1,x2,y2,w:x2-x1,h:y2-y1}}
function nodeBlock(n,side,minWidth=0){const b=emptyBlock(),s=size(n);s.w=Math.max(s.w,minWidth);b.nodes.push({n,x:0,y:0,...s,side});if(!expanded.has(n.id)||!n.children.length){b.bounds=bounds(b);return b}const mode=n.layout||'tree',gap=52;
 if(mode==='flow'){
  // The container's own node is the only heading. Steps start below its left edge.
  // Reserve the first step's hit area to keep its centre to the right in right mode,
  // while its actual text stays aligned with the heading (no rightward empty gutter).
  const left=-s.w/2,top=s.h/2+(n.subtitle?34:10);
  const children=n.children.map((c,i)=>nodeBlock(c,side,side>0&&i===0?s.w+2:0));let x=left;
  children.forEach((c,i)=>{c.nodes[0].align='start';const dx=x-c.bounds.x1,dy=top-c.bounds.y1;put(b,c,dx,dy);if(i){const prev=b.nodes.find(q=>q.n.id===n.children[i-1].id),cur=b.nodes.find(q=>q.n.id===n.children[i].id);const x1=prev.x+prev.w/2+4,x2=cur.x-cur.w/2-4;b.edges.push({x1,y1:prev.y,x2,y2:cur.y,kind:'flow',depth:3})}x+=c.bounds.w+33});
  if(n.subtitle)b.decor.push({kind:'subtitle',node:n.id,x:left+14,y:s.h/2+15,text:n.subtitle,width:textWidth(n.subtitle,11)});
  const cb=bounds(b);b.frames.push({id:n.id+':flow',members:b.nodes.map(q=>q.n.id),x:cb.x1-12,y:cb.y1-12,w:cb.w+24,h:cb.h+24,kind:'flow'});
 }else if(mode==='timeline'){
  const children=n.children.map(c=>nodeBlock(c,side)),total=children.reduce((a,c)=>a+c.bounds.h,0)+(children.length-1)*30;let y=-total/2;const bar=s.w/2+gap,ix=bar+91;
  b.decor.push({kind:'line',x:bar,y:-total/2+18,y2:total/2-18});
  for(const c of children){const dy=y-c.bounds.y1,dx=ix-c.bounds.x1;put(b,c,dx,dy);const cn=c.nodes[0];const cy=dy+cn.y;b.decor.push({kind:'date',node:c.nodes[0].n.id,x:bar+14,y:cy+4,text:c.nodes[0].n.date?.slice(5)||'未记录',width:65});b.decor.push({kind:'dot',x:bar,y:cy});y+=c.bounds.h+30}b.edges.push({x1:s.w/2,y1:0,x2:bar,y2:0,depth:2,kind:'curve'});
 }else if(mode==='group'){
  const groups=new Map();for(const c of n.children){const k=c.group||'';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(nodeBlock(c,side))}const groupBlocks=[];
  for(const [name,items] of groups){const gb=emptyBlock();let y=name?35:12;for(const c of items){put(gb,c,18-c.bounds.x1,y-c.bounds.y1);y+=c.bounds.h+13}const cb=bounds(gb);gb.frames.push({id:n.id+':group:'+groupBlocks.length,members:gb.nodes.map(q=>q.n.id),x:0,y:0,w:Math.max(cb.x2+12,name?textWidth(name,10)+28:0),h:cb.y2+12,label:name,kind:'group'});gb.bounds=bounds(gb);groupBlocks.push(gb)}
  const total=groupBlocks.reduce((a,c)=>a+c.bounds.h,0)+(groupBlocks.length-1)*15;let y=-total/2;for(const c of groupBlocks){const dx=Math.max(s.w/2,n.subtitle?-s.w/2+14+textWidth(n.subtitle,11):0)+gap-c.bounds.x1,dy=y-c.bounds.y1;put(b,c,dx,dy);b.edges.push({x1:s.w/2,y1:0,x2:dx,y2:dy+c.bounds.h/2,depth:2,kind:'curve'});y+=c.bounds.h+15}
  if(n.subtitle)b.decor.push({kind:'subtitle',node:n.id,x:-s.w/2+14,y:s.h/2+15,text:n.subtitle,width:textWidth(n.subtitle,11)});
 }else{
  const children=n.children.map(c=>nodeBlock(c,side)),total=children.reduce((a,c)=>a+c.bounds.h,0)+(children.length-1)*14;let y=-total/2;
  for(const c of children){const dx=side>0?s.w/2+gap-c.bounds.x1:-s.w/2-gap-c.bounds.x2,dy=y-c.bounds.y1;put(b,c,dx,dy);const child=c.nodes[0];b.edges.push({x1:side*(s.w/2+(n.depth>1&&n.children.length?33:0)),y1:0,x2:dx-side*child.w/2,y2:dy,depth:child.n.depth,kind:'curve'});y+=c.bounds.h+16}
 }
 b.bounds=bounds(b);return b}
function makeLayout(){const out=emptyBlock(),rs=size(root);out.nodes.push({n:root,x:0,y:0,...rs,side:0});const regions=[];
 for(const side of (view.direction==='right'?[1]:[-1,1])){const branches=root.children.filter((n,i)=>view.direction==='right'||(side<0?i<Math.ceil(root.children.length/2):i>=Math.ceil(root.children.length/2))),blocks=branches.map(n=>nodeBlock(n,side)),total=blocks.reduce((a,c)=>a+c.bounds.h,0)+(blocks.length-1)*36;let y=-total/2;
 blocks.forEach((b,i)=>{const branch=branches[i],color=palette[['position','features','technology','versions','planning','decisions'].indexOf(branch.id)],dx=side*(rs.w/2+80+size(branch).w/2),dy=y-b.bounds.y1+b.nodes[0].y;const before=out.nodes.length;put(out,b,dx,dy);for(let j=before;j<out.nodes.length;j++)out.nodes[j].color=color;out.edges.slice(out.edges.length-b.edges.length).forEach(e=>e.color=color);out.frames.slice(out.frames.length-b.frames.length).forEach(f=>f.color=color);out.decor.slice(out.decor.length-b.decor.length).forEach(t=>t.color=color);out.edges.push({x1:side*rs.w/2,y1:0,x2:dx-side*size(branch).w/2,y2:dy,depth:1,color,kind:'curve'});regions.push({id:branch.id,x1:b.bounds.x1+dx,y1:b.bounds.y1+dy,x2:b.bounds.x2+dx,y2:b.bounds.y2+dy,w:b.bounds.w,h:b.bounds.h});y+=b.bounds.h+36});
 }
 out.bounds=bounds(out);out.regions=regions;out.texts=textBoxes(out);out.crosses=[];out.diagnostics=[];const byId=new Map(out.nodes.map(n=>[n.n.id,n]));
 for(const sn of out.nodes)for(const l of sn.n.links||[]){if(l.kind==='cross'&&byId.has(l.target)){const tn=byId.get(l.target);const route=routeCross(sn,tn,out.nodes);if(route)out.crosses.push({from:sn.n.id,to:tn.n.id,label:l.label,points:route});else out.diagnostics.push({code:'unroutable-cross',node:sn.n.id,message:`No clear route for ${sn.n.id} → ${tn.n.id}; relation remains in details`})}}
 for(const c of out.crosses){const w=[...c.label].reduce((v,ch)=>v+(/[^\x00-\x7f]/.test(ch)?10:7),16),candidates=[];for(let i=1;i<c.points.length;i++){const a=c.points[i-1],b=c.points[i],x=(a.x+b.x)/2,y=(a.y+b.y)/2;if(a.y===b.y)candidates.push({x:x-w/2,y:y-25,w,h:18},{x:x-w/2,y:y+8,w,h:18});else candidates.push({x:x+10,y:y-9,w,h:18},{x:x-w-10,y:y-9,w,h:18})}c.labelBox=candidates.find(r=>r.x>=out.bounds.x1&&r.x+r.w<=out.bounds.x2&&r.y>=out.bounds.y1&&r.y+r.h<=out.bounds.y2&&!out.nodes.some(n=>r.x<n.x+n.w/2+6&&r.x+r.w>n.x-n.w/2-6&&r.y<n.y+n.h/2+6&&r.y+r.h>n.y-n.h/2-6)&&!out.texts.some(t=>overlap(r,t,3))&&!out.frames.some(f=>overlap(r,f)&&!(r.x>=f.x&&r.y>=f.y&&r.x+r.w<=f.x+f.w&&r.y+r.h<=f.y+f.h)));if(c.labelBox)out.texts.push({...c.labelBox,id:c.from+'→'+c.to,role:'cross-label',text:c.label,frames:[]});if(!c.labelBox)out.diagnostics.push({code:'cross-label-unplaced',node:c.from,message:`Relation label ${c.from} → ${c.to} cannot fit; see details`})}
 for(const e of out.edges){if(e.kind==='flow'){e.points=[{x:e.x1,y:e.y1},{x:e.x2,y:e.y2}]}else{const m=(e.x1+e.x2)/2;e.points=[{x:e.x1,y:e.y1},{x:m,y:e.y1},{x:m,y:e.y2},{x:e.x2,y:e.y2}];e.curve=view.edges==='curve'}}return out}
function overlap(a,b,pad=0){return a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y}
function textBoxes(scene){
 const result=[];
 function add(id,role,text,x,baseline,font,anchor='start',frames=[]){const w=textWidth(text,font);result.push({id,role,text,x:x-(anchor==='middle'?w/2:0),y:baseline-font*1.15,w,h:font*1.55,frames})}
 const membership=id=>scene.frames.filter(f=>f.members.includes(id)).map(f=>f.id);
 for(const q of scene.nodes){const {n,x,y,w,font,side}=q,frames=membership(n.id);add(n.id,'title',n.title,q.align==='start'?x-w/2+14:x,y+font*.35,font,q.align==='start'?'start':'middle',frames);if(n.children.length&&n.depth>0)add(n.id,'count',String(n.children.length),x+side*(w/2+21),y+4,11,'middle',frames)}
 for(const f of scene.frames)if(f.label)add(f.id,'frame-label',f.label,f.x+14,f.y+20,10,'start',[f.id,...scene.frames.filter(p=>p!==f&&f.members.every(id=>p.members.includes(id))).map(p=>p.id)]);
 for(const t of scene.decor)if(t.kind==='date'||t.kind==='subtitle')add(t.node||t.text,t.kind,t.text,t.x,t.y,t.kind==='date'?10:11,'start',t.node?membership(t.node):[]);
 return result;
}
function routeCross(a,b,nodes){
 if(a.n.id===b.n.id)return null;
 const portA=a.side>0?-1:1,portB=b.side>0?-1:1,start={x:a.x+portA*(a.w/2+10),y:a.y},end={x:b.x+portB*(b.w/2+10),y:b.y};
 const boxes=nodes.map(n=>({x1:n.x-n.w/2-6,x2:n.x+n.w/2+6,y1:n.y-n.h/2-6,y2:n.y+n.h/2+6}));
 const inside=p=>boxes.some(r=>p.x>r.x1&&p.x<r.x2&&p.y>r.y1&&p.y<r.y2);
 const clear=(p,q)=>!boxes.some(r=>p.x===q.x?p.x>r.x1&&p.x<r.x2&&Math.max(p.y,q.y)>r.y1&&Math.min(p.y,q.y)<r.y2:p.y>r.y1&&p.y<r.y2&&Math.max(p.x,q.x)>r.x1&&Math.min(p.x,q.x)<r.x2);
 const xs=[...new Set([start.x,end.x,...boxes.flatMap(r=>[r.x1-12,r.x2+12])])].sort((a,b)=>a-b),ys=[...new Set([start.y,end.y,...boxes.flatMap(r=>[r.y1-12,r.y2+12])])].sort((a,b)=>a-b),ny=ys.length,id=(x,y)=>x*ny+y,point=i=>({x:xs[Math.floor(i/ny)],y:ys[i%ny]});
 const sid=id(xs.indexOf(start.x),ys.indexOf(start.y)),eid=id(xs.indexOf(end.x),ys.indexOf(end.y));let heap=[],dist=new Map([[sid,0]]),prev=new Map(),closed=new Set();
 function push(v){heap.push(v);let i=heap.length-1;while(i){let p=(i-1)>>1;if(heap[p][0]<=v[0])break;heap[i]=heap[p];i=p}heap[i]=v}
 function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c}heap[i]=last}return first}
 push([0,sid]);while(heap.length){const [,u]=pop();if(closed.has(u))continue;if(u===eid){const path=[];for(let k=u;k!==undefined;k=prev.get(k))path.push(point(k));path.reverse();const clean=[path[0]];for(let i=1;i<path.length-1;i++){const p=clean.at(-1),q=path[i],r=path[i+1];if(!(p.x===q.x&&q.x===r.x)&&!(p.y===q.y&&q.y===r.y))clean.push(q)}clean.push(path.at(-1));return clean}closed.add(u);const ix=Math.floor(u/ny),iy=u%ny,p=point(u);for(const [nx,nyp] of [[ix-1,iy],[ix+1,iy],[ix,iy-1],[ix,iy+1]]){if(nx<0||nx>=xs.length||nyp<0||nyp>=ys.length)continue;const v=id(nx,nyp),q=point(v);if(closed.has(v)||inside(q)||!clear(p,q))continue;const nd=dist.get(u)+Math.abs(p.x-q.x)+Math.abs(p.y-q.y);if(nd<(dist.get(v)??Infinity)){dist.set(v,nd);prev.set(v,u);push([nd+Math.abs(q.x-end.x)+Math.abs(q.y-end.y),v])}}}
 return null;
}

return makeLayout();
}
