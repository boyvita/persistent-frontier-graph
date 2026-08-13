import type {
  FrontierProjection,
  FrontierTree,
  NodeId,
  Point,
  ProjectedNode,
  TreeIndex,
} from "../core/types.js";
import type { FrontierSnapshot } from "../frontier/snapshot.js";
import { edgesFromPositions, interpolatePoint } from "./shared.js";

export interface RadialLayoutOptions {
  readonly minimumRingGap?: number;
  readonly nodePitch?: number;
  readonly seamPadding?: number;
}

export interface RadialLayoutResult<TData> extends FrontierProjection<TData> {
  readonly anglesById: ReadonlyMap<NodeId, number>;
  readonly maximumRadius: number;
  readonly radiiByDepth: readonly number[];
}

function canonicalRadialPositions<TData>(
  index: TreeIndex<TData>,
  options: Required<RadialLayoutOptions>,
): {
  anglesById: ReadonlyMap<NodeId, number>;
  positions: ReadonlyMap<NodeId, Point>;
  radiiByDepth: readonly number[];
} {
  const leaves: NodeId[] = [];
  const stack = [index.orderedIds[0]!];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    const children = index.childrenById.get(id) ?? [];
    if (children.length === 0) {
      leaves.push(id);
      continue;
    }
    for (let cursor = children.length - 1; cursor >= 0; cursor -= 1) {
      const child = children[cursor];
      if (child) stack.push(child.id);
    }
  }
  const anglesById = new Map<NodeId, number>();
  for (let rank = 0; rank < leaves.length; rank += 1) {
    const amount = leaves.length <= 1 ? 0.5 : rank / (leaves.length - 1);
    const angle = -Math.PI + options.seamPadding + amount * (Math.PI * 2 - options.seamPadding * 2);
    const id = leaves[rank];
    if (id) anglesById.set(id, leaves.length <= 1 ? 0 : angle);
  }
  for (let cursor = index.orderedIds.length - 1; cursor >= 0; cursor -= 1) {
    const id = index.orderedIds[cursor];
    if (!id || anglesById.has(id)) continue;
    const children = index.childrenById.get(id) ?? [];
    const angles = children.map((child) => anglesById.get(child.id)).filter((angle): angle is number => angle !== undefined);
    anglesById.set(id, angles.length > 0 ? (Math.min(...angles) + Math.max(...angles)) / 2 : 0);
  }

  const countsByDepth = new Map<number, number>();
  for (const depth of index.depthById.values()) countsByDepth.set(depth, (countsByDepth.get(depth) ?? 0) + 1);
  const radiiByDepth = [0];
  for (let depth = 1; depth <= index.maximumDepth; depth += 1) {
    const densityRadius = ((countsByDepth.get(depth) ?? 1) * options.nodePitch) / (Math.PI * 2);
    radiiByDepth[depth] = Math.max((radiiByDepth[depth - 1] ?? 0) + options.minimumRingGap, densityRadius);
  }

  const positions = new Map<NodeId, Point>();
  for (const id of index.orderedIds) {
    const depth = index.depthById.get(id) ?? 0;
    const radius = radiiByDepth[depth] ?? 0;
    const angle = anglesById.get(id) ?? 0;
    positions.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return { anglesById, positions, radiiByDepth };
}

export function layoutRadial<TData>(
  tree: FrontierTree<TData>,
  index: TreeIndex<TData>,
  snapshot: FrontierSnapshot,
  suppliedOptions: RadialLayoutOptions = {},
): RadialLayoutResult<TData> {
  const options: Required<RadialLayoutOptions> = {
    minimumRingGap: suppliedOptions.minimumRingGap ?? 132,
    nodePitch: suppliedOptions.nodePitch ?? 44,
    seamPadding: suppliedOptions.seamPadding ?? 0.12,
  };
  const canonical = canonicalRadialPositions(index, options);
  const positions = new Map<NodeId, Point>();
  const nodes: ProjectedNode<TData>[] = [];
  const blend = snapshot.frontier - snapshot.lowerLevel;

  for (const id of index.orderedIds) {
    const node = index.byId.get(id);
    if (!node) continue;
    const depth = index.depthById.get(id) ?? 0;
    const own = canonical.positions.get(id) ?? { x: 0, y: 0 };
    const ancestorId = snapshot.ancestorById.get(id) ?? tree.rootId;
    const ancestor = canonical.positions.get(ancestorId) ?? { x: 0, y: 0 };
    let position = own;
    if (depth > snapshot.lowerLevel) {
      position = depth === snapshot.upperLevel ? interpolatePoint(ancestor, own, blend) : ancestor;
    }
    positions.set(id, position);
    nodes.push({
      canonicalPosition: own,
      depth,
      frontierAncestorId: ancestorId,
      isFrontier: snapshot.frontierNodeIds.has(id),
      node,
      position,
      reveal: snapshot.revealById.get(id) ?? 0,
    });
  }

  return {
    anglesById: canonical.anglesById,
    edges: edgesFromPositions(index, positions, snapshot.revealById),
    frontier: snapshot.frontier,
    maximumDepth: index.maximumDepth,
    maximumRadius: Math.max(0, ...canonical.radiiByDepth),
    nodes,
    radiiByDepth: canonical.radiiByDepth,
    visibleNodeIds: snapshot.visibleNodeIds,
  };
}
