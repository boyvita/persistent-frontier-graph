import type { NodeId, Point, ProjectedEdge, TreeIndex } from "../core/types.js";

export function interpolatePoint(from: Point, to: Point, amount: number): Point {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function edgesFromPositions<TData>(
  index: TreeIndex<TData>,
  positions: ReadonlyMap<NodeId, Point>,
  revealById: ReadonlyMap<NodeId, number>,
): readonly ProjectedEdge[] {
  const edges: ProjectedEdge[] = [];
  for (const id of index.orderedIds) {
    const parentId = index.parentById.get(id);
    if (parentId === null || parentId === undefined) continue;
    const source = positions.get(parentId);
    const target = positions.get(id);
    if (!source || !target) continue;
    edges.push({
      id: `${parentId}:${id}`,
      reveal: Math.min(revealById.get(parentId) ?? 0, revealById.get(id) ?? 0),
      source,
      sourceId: parentId,
      target,
      targetId: id,
    });
  }
  return edges;
}

export function lcaDepth<TData>(leftId: NodeId, rightId: NodeId, index: TreeIndex<TData>): number {
  let left = leftId;
  let right = rightId;
  let leftDepth = index.depthById.get(left) ?? 0;
  let rightDepth = index.depthById.get(right) ?? 0;
  while (leftDepth > rightDepth) {
    left = index.parentById.get(left) ?? left;
    leftDepth -= 1;
  }
  while (rightDepth > leftDepth) {
    right = index.parentById.get(right) ?? right;
    rightDepth -= 1;
  }
  while (left !== right && leftDepth > 0) {
    left = index.parentById.get(left) ?? left;
    right = index.parentById.get(right) ?? right;
    leftDepth -= 1;
  }
  return leftDepth;
}
