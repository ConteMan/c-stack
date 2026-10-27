// Optional actual-browser suite; reuse the host Page without adding a browser dependency.
import {measureTextGeometry} from './atlas-text-geometry.mjs';
export async function runTextMatrix(page, {partial}) {
  return page.evaluate(({probe,partial})=>{
    const measure=(0,eval)('('+probe+')'),rows=[];
    const state=()=>projectAtlas.getState();
    const node=id=>document.querySelector(`[data-node="${id}"]`);
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const leave=()=>{if(state().hovered)node(state().hovered)?.dispatchEvent(new PointerEvent('pointerleave'))};
    const close=()=>{leave();if(!document.querySelector('#panel').hidden)document.querySelector('#close').click()};
    function highlightCheck(endpoint){
      const s=state(),expected=s.association.neighbors[endpoint]||[];
      const related=expected.map(id=>({id,visible:s.visible.includes(id),highlighted:node(id)?.classList.contains('association-related'),stroke:node(id)?getComputedStyle(node(id).querySelector('.label rect')).strokeWidth:null}));
      const faded=[...document.querySelectorAll('[data-node]')].every(n=>s.association.highlighted.includes(n.dataset.node)||parseFloat(getComputedStyle(n).opacity)<1);
      return {pass:s.association.focus===endpoint&&related.every(n=>n.visible&&n.highlighted&&parseFloat(n.stroke)>=2.5)&&faded,related,faded};
    }
    for(const style of ['default','mono'])for(const edges of ['curve','orthogonal'])for(const direction of ['balanced','right']){
      close();
      for(const [key,value]of Object.entries({style,edges,direction}))document.querySelector(`[data-option="${key}"][data-value="${value}"]`).click();
      for(const expansion of ['default','partial','all']){
        close();
        if(expansion==='default')document.querySelector('#collapse').click();
        else if(expansion==='partial')document.querySelector(`[data-toggle="${partial}"]`).dispatchEvent(new MouseEvent('click',{bubbles:true}));
        else document.querySelector('#expand').click();
        const base=measure(),before=state(),previews=[];
        const endpoints=Object.keys(before.association.neighbors).filter(id=>before.visible.includes(id));
        for(const endpoint of endpoints){
          node(endpoint).dispatchEvent(new PointerEvent('pointerenter'));
          const geometry=measure(),highlight=highlightCheck(endpoint),manualPreserved=same(state().expanded,before.expanded);
          leave();
          const restored=same(state().visible,before.visible)&&same(state().expanded,before.expanded)&&!state().association.focus;
          previews.push({endpoint,pass:geometry.pass&&highlight.pass&&manualPreserved&&restored,geometry,highlight,manualPreserved,restored});
        }
        let selected=null;
        if(endpoints.length){
          const endpoint=endpoints[0];document.querySelector(`[data-label="${endpoint}"]`).dispatchEvent(new MouseEvent('click',{bubbles:true}));
          const geometry=measure(),highlight=highlightCheck(endpoint),button=document.querySelector('#panel-body [data-relation-target]');
          const target=button?.dataset.relationTarget;if(button)button.click();
          const jumped=!!target&&state().selected===target&&state().visible.includes(target);
          close();
          const restored=same(state().expanded,before.expanded)&&same(state().visible,before.visible)&&!state().association.focus;
          selected={pass:geometry.pass&&highlight.pass&&jumped&&restored,geometry,highlight,jumped,restored};
        }
        rows.push({style,edges,direction,state:expansion,pass:base.pass&&previews.every(p=>p.pass)&&!!selected?.pass,base,previews,selected});
      }
    }
    return rows;
  },{probe:measureTextGeometry.toString(),partial});
}
