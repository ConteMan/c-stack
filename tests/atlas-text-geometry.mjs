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
  return {pass:!overlaps.length && !outside.length && !untracked.length && !reservationOverflow.length,
    textCount:texts.length, roles:[...new Set(texts.map(t=>t.role))], overlaps, outside,
    untracked, reservationOverflow};
}
