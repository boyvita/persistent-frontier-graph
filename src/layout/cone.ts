import type {
  FrontierProjection,
  FrontierTree,
  NodeId,
  Point,
  ProjectedNode,
  Size,
  TreeIndex,
} from "../core/types.js";
import type { FrontierSnapshot } from "../frontier/snapshot.js";
import { isRevealed } from "../frontier/visibility.js";
import { edgesFromPositions, interpolatePoint, lcaDepth } from "./shared.js";

export interface ConeLayoutOptions {
  readonly columnGap?: number;
  readonly hierarchyGap?: number;
  readonly localGap?: number;
  readonly maximumHierarchyGap?: number;
  readonly nodeSize?: Size;
}

export interface ConeLayoutResult<TData> extends FrontierProjection<TData> {
  readonly bounds: {
    readonly height: number;
    readonly maximumY: number;
    readonly minimumY: number;
    readonly width: number;
  };
}

const DEFAULT_NODE_SIZE: Size = { height: 64, width: 208 };

function boundaryAtLevel<TData>(index: TreeIndex<TData>, level: number): readonly NodeId[] {
  const result: NodeId[] = [];
  const stack = [index.orderedIds[0]!];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    const depth = index.depthById.get(id) ?? 0;
    const children = index.childrenById.get(id) ?? [];
    if (depth >= level || children.length === 0) {
      result.push(id);
      continue;
    }
    for (let cursor = children.length - 1; cursor >= 0; cursor -= 1) {
      const child = children[cursor];
      if (child) stack.push(child.id);
    }
  }
  return result;
}

function coordinateSet<TData>(
  index: TreeIndex<TData>,
  level: number,
  options: Required<ConeLayoutOptions>,
): ReadonlyMap<NodeId, Point> {
  const boundary = boundaryAtLevel(index, level);
  const centers = new Map<NodeId, number>();
  let cursorY = 0;
  for (let rank = 0; rank < boundary.length; rank += 1) {
    const id = boundary[rank];
    if (!id) continue;
    if (rank > 0) {
      const previous = boundary[rank - 1]!;
      const sharedDepth = lcaDepth(previous, id, index);
      const divergentGenerations = Math.max(
        (index.depthById.get(previous) ?? 0) - sharedDepth,
        (index.depthById.get(id) ?? 0) - sharedDepth,
      );
      const gap = Math.min(
        options.maximumHierarchyGap,
        options.localGap + Math.max(0, divergentGenerations - 1) * options.hierarchyGap,
      );
      cursorY += options.nodeSize.height + gap;
    }
    centers.set(id, cursorY);
  }
  const first = boundary[0] ? centers.get(boundary[0]) ?? 0 : 0;
  const last = boundary.at(-1) ? centers.get(boundary.at(-1)!) ?? first : first;
  const midpoint = (first + last) / 2;
  for (const id of boundary) centers.set(id, (centers.get(id) ?? 0) - midpoint);

  for (let cursor = index.orderedIds.length - 1; cursor >= 0; cursor -= 1) {
    const id = index.orderedIds[cursor];
    if (!id || centers.has(id)) continue;
    const children = index.childrenById.get(id) ?? [];
    const childCenters = children.map((child) => centers.get(child.id)).filter((value): value is number => value !== undefined);
    if (childCenters.length > 0) centers.set(id, (Math.min(...childCenters) + Math.max(...childCenters)) / 2);
  }

  const positions = new Map<NodeId, Point>();
  for (const id of index.orderedIds) {
    const depth = index.depthById.get(id) ?? 0;
    let centerId = id;
    while (!centers.has(centerId)) {
      const parent = index.parentById.get(centerId);
      if (parent === null || parent === undefined) break;
      centerId = parent;
    }
    positions.set(id, {
      x: depth * (options.nodeSize.width + options.columnGap),
      y: centers.get(centerId) ?? 0,
    });
  }
  return positions;
}

export function layoutCone<TData>(
  tree: FrontierTree<TData>,
  index: TreeIndex<TData>,
  snapshot: FrontierSnapshot,
  suppliedOptions: ConeLayoutOptions = {},
): ConeLayoutResult<TData> {
  const options: Required<ConeLayoutOptions> = {
    columnGap: suppliedOptions.columnGap ?? 74,
    hierarchyGap: suppliedOptions.hierarchyGap ?? 12,
    localGap: suppliedOptions.localGap ?? 12,
    maximumHierarchyGap: suppliedOptions.maximumHierarchyGap ?? 112,
    nodeSize: suppliedOptions.nodeSize ?? DEFAULT_NODE_SIZE,
  };
  const lower = coordinateSet(index, snapshot.lowerLevel, options);
  const upper = coordinateSet(index, snapshot.upperLevel, options);
  const canonical = coordinateSet(index, index.maximumDepth, options);
  const blend = snapshot.frontier - snapshot.lowerLevel;
  const positions = new Map<NodeId, Point>();
  const nodes: ProjectedNode<TData>[] = [];

  for (const id of index.orderedIds) {
    const from = lower.get(id) ?? { x: 0, y: 0 };
    const to = upper.get(id) ?? from;
    const position = interpolatePoint(from, to, blend);
    positions.set(id, position);
    const node = index.byId.get(id);
    if (!node) continue;
    nodes.push({
      canonicalPosition: canonical.get(id) ?? position,
      depth: index.depthById.get(id) ?? 0,
      frontierAncestorId: snapshot.ancestorById.get(id) ?? tree.rootId,
      isFrontier: snapshot.frontierNodeIds.has(id),
      node,
      position,
      reveal: snapshot.revealById.get(id) ?? 0,
    });
  }

  const visible = nodes.filter((node) => isRevealed(node.reveal));
  const minimumY = Math.min(0, ...visible.map((node) => node.position.y - options.nodeSize.height / 2));
  const maximumY = Math.max(0, ...visible.map((node) => node.position.y + options.nodeSize.height / 2));
  return {
    bounds: {
      height: maximumY - minimumY,
      maximumY,
      minimumY,
      width: index.maximumDepth * (options.nodeSize.width + options.columnGap) + options.nodeSize.width,
    },
    edges: edgesFromPositions(index, positions, snapshot.revealById),
    frontier: snapshot.frontier,
    maximumDepth: index.maximumDepth,
    nodes,
    visibleNodeIds: snapshot.visibleNodeIds,
  };
}
