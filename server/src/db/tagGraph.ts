/** Implication edges: tag id → the tag ids it directly implies. */
export type ImplicationGraph = Map<number, number[]>;

export function buildGraph(edges: Array<{ tagId: number; impliedTagId: number }>): ImplicationGraph {
  const graph: ImplicationGraph = new Map();
  for (const { tagId, impliedTagId } of edges) {
    const list = graph.get(tagId);
    if (list) list.push(impliedTagId);
    else graph.set(tagId, [impliedTagId]);
  }
  return graph;
}

/** Every tag reachable from `start` (not including it), following implications transitively. */
export function impliedBy(start: number, graph: ImplicationGraph): Set<number> {
  const seen = new Set<number>();
  const stack = [...(graph.get(start) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (next === start || seen.has(next)) continue;
    seen.add(next);
    stack.push(...(graph.get(next) ?? []));
  }
  return seen;
}

/** Adding `from → to` would loop back if `from` is already implied by `to`. */
export function wouldCreateCycle(from: number, to: number, graph: ImplicationGraph): boolean {
  return from === to || impliedBy(to, graph).has(from);
}
