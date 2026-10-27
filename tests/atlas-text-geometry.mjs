// Browser-side regression oracle. Pass this function to page.evaluate after render.
// No browser package dependency; measures actual SVG glyph bounds in world units.
export function measureTextGeometry() {
  const scene = window.projectAtlas.getLayout();
  const world = document.querySelector('#world');
  const inverse = world.getScreenCTM().inverse();
  const epsilon = 0.5;
  const within = (a, b) => a.x >= b.x - epsilon && a.y >= b.y - epsilon &&
    a.x + a.w <= b.x + b.w + epsilon && a.y + a.h <= b.y + b.h + epsilon;
  const overlap = (a, b) => a.x < b.x + b.w - epsilon && a.x + a.w > b.x + epsilon &&
    a.y < b.y + b.h - epsilon && a.y + a.h > b.y + epsilon;
  const texts = [...world.querySelectorAll('text')]
    .filter(e => !e.closest('[hidden]') && getComputedStyle(e).display !== 'none')
    .map(e => {
      const box = e.getBBox(), matrix = inverse.multiply(e.getScreenCTM());
      const corners = [[box.x, box.y], [box.x + box.width, box.y],
        [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
        .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
      const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
      return {id:e.dataset.textId, role:e.dataset.textRole, text:e.textContent, x, y,
        w:Math.max(...corners.map(p => p.x)) - x, h:Math.max(...corners.map(p => p.y)) - y};
    });
  const overlaps = [], outside = [], untracked = [], reservationOverflow = [];
  const frames = new Map(scene.frames.map(f => [f.id, f]));
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i], reserved = scene.texts.find(t => t.id === a.id && t.role === a.role);
    if (!reserved) untracked.push(a);
    else {
      if (!within(a, reserved)) reservationOverflow.push(a);
      for (const id of reserved.frames) if (!within(a, frames.get(id))) outside.push({id, text:a});
    }
    if (!within(a, {x:scene.bounds.x1,y:scene.bounds.y1,w:scene.bounds.w,h:scene.bounds.h}))
      outside.push({id:'scene', text:a});
    for (let j = i + 1; j < texts.length; j++) if (overlap(a, texts[j]))
      overlaps.push([a, texts[j]]);
  }
  const markerOverlaps=[],markerOutside=[],markerStyles=[];
  const luminance=color=>{const rgb=color.match(/[\d.]+/g)?.slice(0,3).map(Number);if(!rgb||rgb.length!==3)return NaN;return rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)};
  for(const element of world.querySelectorAll('[data-association-mark]')){
    const id=element.dataset.associationMark,box=element.getBBox(),m=inverse.multiply(element.getScreenCTM()),p=new DOMPoint(box.x,box.y).matrixTransform(m),r={x:p.x,y:p.y,w:box.width,h:box.height};
    const reserved=scene.markers.find(q=>q.node===id);
    if(!reserved)markerOutside.push({id,reason:'untracked'});
    else for(const frame of reserved.frames)if(!within(r,frames.get(frame)))markerOutside.push({id,frame});
    for(const t of texts)if(overlap(r,t))markerOverlaps.push([id,t.id]);
    const style=getComputedStyle(element.querySelector('circle'));
    const a=luminance(style.stroke),b=luminance(style.fill),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);markerStyles.push({id,stroke:style.stroke,fill:style.fill,width:parseFloat(style.strokeWidth),contrast});
  }
  const crossSegments=document.querySelectorAll('.cross,[data-cross],[data-cross-from],#cross-arrow').length+scene.edges.filter(e=>e.kind==='cross').length;
  return {pass:!overlaps.length && !outside.length && !untracked.length && !reservationOverflow.length&&!markerOverlaps.length&&!markerOutside.length&&!crossSegments&&markerStyles.every(s=>s.stroke!=='none'&&s.stroke!==s.fill&&s.width>=1.5&&s.contrast>=4.5),
    textCount:texts.length, roles:[...new Set(texts.map(t=>t.role))], overlaps, outside,
    untracked, reservationOverflow,markerOverlaps,markerOutside,markerStyles,crossSegments};
}
