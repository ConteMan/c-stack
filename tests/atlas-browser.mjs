// Optional actual-browser suite. Pass an ego-browser Page already showing a built fixture.
// Script tests remain dependency-free; this suite uses the host's existing browser.
import {measureTextGeometry} from './atlas-text-geometry.mjs';

export async function runTextMatrix(page, {partial}) {
  const rows = [];
  for (const style of ['default','mono']) for (const edges of ['curve','orthogonal'])
    for (const direction of ['balanced','right']) {
      if (await page.evaluate(() => document.querySelector('#display-menu').hidden))
        await page.click('#display-toggle');
      for (const [key,value] of Object.entries({style,edges,direction}))
        await page.click(`[data-option="${key}"][data-value="${value}"]`);
      await page.click('#display-toggle');
      for (const state of ['default','partial','all']) {
        if (state === 'default') await page.click('#collapse');
        else if (state === 'partial') await page.click(`[data-toggle="${partial}"]`);
        else await page.click('#expand');
        await page.mouse.move(5,5);
        const result = await page.evaluate(probe => {
          const measure = (0,eval)('('+probe+')');
          const base = measure(), revealed = [], scene = projectAtlas.getLayout();
          // Exercise every endpoint's actual pointer handler; do not force hidden styles.
          for (const id of new Set(scene.crosses.flatMap(c=>[c.from,c.to]))) {
            const node = document.querySelector(`[data-node="${id}"]`);
            node.dispatchEvent(new PointerEvent('pointerenter'));
            revealed.push({endpoint:id,...measure()});
            node.dispatchEvent(new PointerEvent('pointerleave'));
          }
          return {pass:base.pass && revealed.every(r=>r.pass),base,revealed,
            count:scene.nodes.length,diagnostics:scene.diagnostics};
        }, measureTextGeometry.toString());
        rows.push({style,edges,direction,state,...result});
      }
    }
  return rows;
}
