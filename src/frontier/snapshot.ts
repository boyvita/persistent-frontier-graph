import { ancestorAtDepth } from "../core/tree.js";
import type { NodeId, TreeIndex } from "../core/types.js";
import { isRevealed } from "./visibility.js";

export interface FrontierSnapshot {
  readonly ancestorById: ReadonlyMap<NodeId, NodeId>;
  readonly frontier: number;
  readonly frontierNodeIds: ReadonlySet<NodeId>;
  readonly lowerLevel: number;
  readonly revealById: ReadonlyMap<NodeId, number>;
  readonly upperLevel: number;
  readonly visibleNodeIds: ReadonlySet<NodeId>;
}

export function clampFrontier(frontier: number, maximumDepth: number): number {
  if (!Number.isFinite(frontier)) return 0;
  return Math.min(Math.max(0, maximumDepth), Math.max(0, frontier));
}

export function deriveFrontierSnapshot<TData>(index: TreeIndex<TData>, requestedFrontier: number): FrontierSnapshot {
  const frontier = clampFrontier(requestedFrontier, index.maximumDepth);
  const lowerLevel = Math.floor(frontier);
  const upperLevel = Math.min(index.maximumDepth, Math.ceil(frontier));
  const blend = frontier - lowerLevel;
  const ancestorById = new Map<NodeId, NodeId>();
  const revealById = new Map<NodeId, number>();
  const visibleNodeIds = new Set<NodeId>();
  const frontierNodeIds = new Set<NodeId>();

  for (const id of index.orderedIds) {
    const depth = index.depthById.get(id) ?? 0;
    const reveal = depth <= lowerLevel ? 1 : depth === upperLevel ? blend : 0;
    const ancestor = ancestorAtDepth(id, lowerLevel, index);
    revealById.set(id, reveal);
    ancestorById.set(id, ancestor);
    if (isRevealed(reveal)) visibleNodeIds.add(id);
  }

  for (const id of visibleNodeIds) {
    const visibleChildren = (index.childrenById.get(id) ?? []).filter((child) => visibleNodeIds.has(child.id));
    if (visibleChildren.length === 0) frontierNodeIds.add(id);
  }
  return {
    ancestorById,
    frontier,
    frontierNodeIds,
    lowerLevel,
    revealById,
    upperLevel,
    visibleNodeIds,
  };
}
