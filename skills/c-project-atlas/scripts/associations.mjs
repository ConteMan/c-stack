// MIT. Derive a reversible relation preview without mutating the reader's expansion set.
export function associationState(root, {expanded = [], selected = null, hovered = null} = {}) {
  const nodes = new Map(), parents = new Map(), neighbors = new Map();
  function collect(node, parent) {
    nodes.set(node.id, node);
    if (parent) parents.set(node.id, parent.id);
    neighbors.set(node.id, new Set());
    for (const child of node.children) collect(child, node);
  }
  collect(root);
  for (const node of nodes.values()) for (const link of node.links || []) {
    if (link.kind !== 'cross' || !nodes.has(link.target) || link.target === node.id) continue;
    neighbors.get(node.id).add(link.target);
    neighbors.get(link.target).add(node.id);
  }
  const focus = neighbors.get(hovered)?.size ? hovered : neighbors.get(selected)?.size ? selected : null;
  const related = focus ? [...neighbors.get(focus)] : [];
  const highlighted = focus ? [focus, ...related] : [];
  const effective = new Set(expanded);
  // Selection navigation and relation preview reveal ancestors, never persist them.
  for (const id of new Set([selected, ...highlighted])) {
    for (let parent = parents.get(id); parent; parent = parents.get(parent)) effective.add(parent);
  }
  return {focus, related, highlighted, expanded:[...effective],
    neighbors:Object.fromEntries([...neighbors].filter(([,ids])=>ids.size).map(([id,ids])=>[id,[...ids]]))};
}
