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

/** Delay coordinate expansion until the camera has crossed half of the next depth band. */
export function adaptiveFrontier(capacity: number, maximumDepth: number): number {
  const bounded = clampFrontier(capacity, maximumDepth);
  const lowerLevel = Math.floor(bounded);
  const progress = bounded - lowerLevel;
  if (progress <= 0.5) return lowerLevel;
  return clampFrontier(lowerLevel + (progress - 0.5) * 2, maximumDepth);
}

/** Derive the coordinate frontier from the radial world interval visible to the cone camera. */
export function deriveAutomaticFrontier(
  radialOffset: number,
  radialSpan: number,
  maximumDepth: number,
  nodeWidth: number,
  depthSlot: number,
): number {
  const outerRadius = Math.max(0, radialOffset) + Math.max(0, radialSpan);
  const capacity = (outerRadius - nodeWidth / 2) / Math.max(1, depthSlot);
  return adaptiveFrontier(capacity, maximumDepth);
}

export function deriveFrontierSnapshot<TData>(index: TreeIndex<TData>, requestedFrontier: number): FrontierSnapshot {
  const frontier = clampFrontier(requestedFrontier, index.maximumDepth);
  const lowerLevel = Math.floor(frontier);
  const upperLevel = Math.min(index.maximumDepth, Math.ceil(frontier));
  const ancestorById = new Map<NodeId, NodeId>();
  const revealById = new Map<NodeId, number>();
  const visibleNodeIds = new Set<NodeId>();
  const frontierNodeIds = new Set<NodeId>();

  for (const id of index.orderedIds) {
    const reveal = 1;
    const ancestor = ancestorAtDepth(id, lowerLevel, index);
    revealById.set(id, reveal);
    ancestorById.set(id, ancestor);
    if (isRevealed(reveal)) visibleNodeIds.add(id);
  }

  for (const id of index.orderedIds) {
    const depth = index.depthById.get(id) ?? 0;
    const children = index.childrenById.get(id) ?? [];
    if (depth === lowerLevel || (depth < lowerLevel && children.length === 0)) frontierNodeIds.add(id);
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
