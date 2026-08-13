import { indexTree } from "../core/tree.js";
import type { FrontierTree, TreeIndex } from "../core/types.js";
import { layoutCone, type ConeLayoutOptions, type ConeLayoutResult } from "../layout/cone.js";
import { layoutRadial, type RadialLayoutOptions, type RadialLayoutResult } from "../layout/radial.js";
import { deriveFrontierSnapshot, type FrontierSnapshot } from "./snapshot.js";

export interface FrontierGraphModel<TData> {
  readonly cone: ConeLayoutResult<TData>;
  readonly index: TreeIndex<TData>;
  readonly radial: RadialLayoutResult<TData>;
  readonly snapshot: FrontierSnapshot;
  readonly tree: FrontierTree<TData>;
}

export interface CreateFrontierGraphModelOptions {
  readonly cone?: ConeLayoutOptions;
  readonly radial?: RadialLayoutOptions;
}

export function createFrontierGraphModel<TData>(
  tree: FrontierTree<TData>,
  frontier: number,
  options: CreateFrontierGraphModelOptions = {},
): FrontierGraphModel<TData> {
  const index = indexTree(tree);
  const snapshot = deriveFrontierSnapshot(index, frontier);
  return {
    cone: layoutCone(tree, index, snapshot, options.cone),
    index,
    radial: layoutRadial(tree, index, snapshot, options.radial),
    snapshot,
    tree,
  };
}
