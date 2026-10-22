(function (root) {
  'use strict';
  function unit(id) {
    let hash = 2166136261;
    for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return (hash >>> 0) / 4294967296;
  }
  function solve(entities, associations, previous = new Map()) {
    const nodes = [...entities].sort((a, b) => a.id.localeCompare(b.id)).map((node, i) => {
      const angle = unit(node.id) * Math.PI * 2, radius = 100 + Math.sqrt(i) * 65;
      const old = previous.get(node.id);
      return { id: node.id, kind: node.kind, x: old?.x ?? Math.cos(angle) * radius,
        y: old?.y ?? Math.sin(angle) * radius, size: node.kind === 'repository' ? 14 : 22 };
    });
    const byId = new Map(nodes.map(node => [node.id, node])), pairs = new Map();
    for (const edge of associations) {
      if (edge.source === edge.target || !byId.has(edge.source) || !byId.has(edge.target)) continue;
      const key = JSON.stringify([edge.source, edge.target].sort());
      const weight = edge.type === 'under-umbrella' ? 0.025 : edge.type === 'foundational-offering' ? 0.3 : 1;
      const old = pairs.get(key);
      if (!old || old.weight < weight) pairs.set(key, { source: byId.get(edge.source), target: byId.get(edge.target), weight });
    }
    const edges = [...pairs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, edge]) => edge);
    for (let step = 0; step < 260; step++) {
      const forces = new Map(nodes.map(n => {
        const old = previous.get(n.id);
        return [n.id, { x: -n.x * 0.004 + (old ? (old.x - n.x) * 0.03 : 0),
          y: -n.y * 0.004 + (old ? (old.y - n.y) * 0.03 : 0) }];
      }));
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        if (Math.hypot(dx, dy) < 0.01) { dx = Math.cos(unit(a.id + b.id) * 6.28); dy = Math.sin(unit(a.id + b.id) * 6.28); }
        const distance = Math.max(1, Math.hypot(dx, dy)), minimum = a.size + b.size + 28;
        const push = 1500 / (distance * distance) + Math.max(0, minimum - distance) * 0.45;
        const fx = dx / distance * push, fy = dy / distance * push;
        forces.get(a.id).x -= fx; forces.get(a.id).y -= fy;
        forces.get(b.id).x += fx; forces.get(b.id).y += fy;
      }
      for (const { source: a, target: b, weight } of edges) {
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
        const pull = (distance - 115) * 0.025 * weight;
        const fx = dx / distance * pull, fy = dy / distance * pull;
        forces.get(a.id).x += fx; forces.get(a.id).y += fy;
        forces.get(b.id).x -= fx; forces.get(b.id).y -= fy;
      }
      for (const node of nodes) {
        const f = forces.get(node.id), scale = Math.min(1, 8 / Math.max(1, Math.hypot(f.x, f.y)));
        node.x += f.x * scale; node.y += f.y * scale;
      }
    }
    return new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]));
  }
  function interpolate(from, target, progress, reducedMotion = false) {
    const t = reducedMotion ? 1 : Math.max(0, Math.min(1, progress));
    const eased = t * t * (3 - 2 * t);
    return { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased };
  }
  const api = { solve, interpolate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanopyConnectionLayout = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
