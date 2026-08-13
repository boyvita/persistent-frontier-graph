import type { FrontierNode } from "../core/types.js";
import { seededRandom, stableUnit } from "./random.js";
import type {
  GeneratedNodeContext,
  GeneratedNodeData,
  GenerateTreeOptions,
  GenerationResult,
} from "./types.js";

const MAX_NODE_COUNT = 1000;

interface MutableNode<TData> {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly data: TData;
  childCount: number;
  subtreeSize: number;
}

export function treeCapacity(maxBranches: number, maxDepth: number, ceiling = MAX_NODE_COUNT): number {
  if (!Number.isInteger(maxBranches) || maxBranches < 1 || !Number.isInteger(maxDepth) || maxDepth < 0) return 0;
  let capacity = 1;
  let levelSize = 1;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    levelSize = Math.min(ceiling, levelSize * maxBranches);
    capacity = Math.min(ceiling, capacity + levelSize);
    if (capacity >= ceiling) return ceiling;
  }
  return capacity;
}

function validateOptions(options: GenerateTreeOptions): string | null {
  if (!Number.isInteger(options.nodeCount) || options.nodeCount < 1 || options.nodeCount > MAX_NODE_COUNT) {
    return `nodeCount must be an integer from 1 to ${MAX_NODE_COUNT}.`;
  }
  if (!Number.isInteger(options.maxBranches) || options.maxBranches < 1 || options.maxBranches > 64) {
    return "maxBranches must be an integer from 1 to 64.";
  }
  if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0 || options.maxDepth > 64) {
    return "maxDepth must be an integer from 0 to 64.";
  }
  if (!Number.isFinite(options.breadthDepthBias)
    || options.breadthDepthBias < 0
    || options.breadthDepthBias > 1) {
    return "breadthDepthBias must be a finite number from 0 to 1.";
  }
  return null;
}

function rootBranchOf<TData>(node: MutableNode<TData>, byId: ReadonlyMap<string, MutableNode<TData>>): string | null {
  let current = node;
  let parent = current.parentId === null ? undefined : byId.get(current.parentId);
  while (parent && parent.parentId !== null) {
    current = parent;
    parent = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return current.parentId === null ? null : current.id;
}

function chooseUniformParent<TData>(
  candidates: readonly MutableNode<TData>[],
  nodesById: ReadonlyMap<string, MutableNode<TData>>,
  options: GenerateTreeOptions,
  step: number,
  seed: string,
): MutableNode<TData> {
  const directionPhase = stableUnit(seed, `direction:${step}`);
  const preferDepth = directionPhase < options.breadthDepthBias;
  return [...candidates].sort((left, right) => {
    const leftBranchId = rootBranchOf(left, nodesById);
    const rightBranchId = rootBranchOf(right, nodesById);
    const leftBranchLoad = leftBranchId === null ? 0 : nodesById.get(leftBranchId)?.subtreeSize ?? 0;
    const rightBranchLoad = rightBranchId === null ? 0 : nodesById.get(rightBranchId)?.subtreeSize ?? 0;
    if (leftBranchLoad !== rightBranchLoad) return leftBranchLoad - rightBranchLoad;
    if (left.depth !== right.depth) return preferDepth ? right.depth - left.depth : left.depth - right.depth;
    if (left.childCount !== right.childCount) return left.childCount - right.childCount;
    return stableUnit(seed, `${step}:${left.id}`) - stableUnit(seed, `${step}:${right.id}`);
  })[0] ?? candidates[0]!;
}

function chooseRandomParent<TData>(
  candidates: readonly MutableNode<TData>[],
  options: GenerateTreeOptions,
  random: () => number,
): MutableNode<TData> {
  const weights = candidates.map((candidate) => {
    const normalizedDepth = options.maxDepth === 0 ? 0 : candidate.depth / options.maxDepth;
    const directionScore = (1 - options.breadthDepthBias) * (1 - normalizedDepth)
      + options.breadthDepthBias * normalizedDepth;
    const openSlots = (options.maxBranches - candidate.childCount) / options.maxBranches;
    return 0.05 + Math.exp(directionScore * 3) * (0.4 + openSlots * 0.6);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let needle = random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    needle -= weights[index] ?? 0;
    if (needle <= 0) return candidates[index] ?? candidates[0]!;
  }
  return candidates.at(-1) ?? candidates[0]!;
}

function revisionFor(options: GenerateTreeOptions, seed: string): string {
  const signature = [
    seed,
    options.nodeCount,
    options.maxBranches,
    options.maxDepth,
    options.breadthDepthBias.toFixed(6),
    options.uniform ? "uniform" : "random",
  ].join(":");
  const value = Math.floor(stableUnit(signature, "revision") * 0xffffffff).toString(36).padStart(7, "0");
  return `pfg-${value}`;
}

export function generateTree<TData = GeneratedNodeData>(
  options: GenerateTreeOptions,
  createData?: (context: GeneratedNodeContext) => TData,
): GenerationResult<TData> {
  const invalid = validateOptions(options);
  if (invalid) return { ok: false, error: { code: "invalid_option", message: invalid } };

  const capacity = treeCapacity(options.maxBranches, options.maxDepth);
  if (options.nodeCount > capacity) {
    return {
      ok: false,
      error: {
        code: "capacity_exceeded",
        message: `This shape can contain at most ${capacity} nodes. Increase branches or depth.`,
      },
    };
  }

  const seed = String(options.seed);
  const random = seededRandom(seed);
  const dataFactory = createData ?? ((context: GeneratedNodeContext) => ({
    label: context.ordinal === 0 ? "Frontier" : `Node ${context.ordinal}`,
    ordinal: context.ordinal,
  }) as TData);
  const rootId = "node-0000";
  const root: MutableNode<TData> = {
    childCount: 0,
    data: dataFactory({ depth: 0, id: rootId, ordinal: 0, parentId: null, seed }),
    depth: 0,
    id: rootId,
    parentId: null,
    subtreeSize: 1,
  };
  const nodes: MutableNode<TData>[] = [root];
  const byId = new Map<string, MutableNode<TData>>([[root.id, root]]);

  for (let ordinal = 1; ordinal < options.nodeCount; ordinal += 1) {
    const candidates = nodes.filter((node) => node.depth < options.maxDepth && node.childCount < options.maxBranches);
    const parent = options.uniform
      ? chooseUniformParent(candidates, byId, options, ordinal, seed)
      : chooseRandomParent(candidates, options, random);
    const id = `node-${ordinal.toString().padStart(4, "0")}`;
    const depth = parent.depth + 1;
    const node: MutableNode<TData> = {
      childCount: 0,
      data: dataFactory({ depth, id, ordinal, parentId: parent.id, seed }),
      depth,
      id,
      parentId: parent.id,
      subtreeSize: 1,
    };
    nodes.push(node);
    byId.set(id, node);
    parent.childCount += 1;
    let ancestor: MutableNode<TData> | undefined = parent;
    while (ancestor) {
      ancestor.subtreeSize += 1;
      ancestor = ancestor.parentId === null ? undefined : byId.get(ancestor.parentId);
    }
  }

  const immutableNodes: FrontierNode<TData>[] = nodes.map(({ data, id, parentId }) => ({ data, id, parentId }));
  return {
    ok: true,
    seed,
    tree: {
      nodes: immutableNodes,
      revision: revisionFor(options, seed),
      rootId,
    },
  };
}
