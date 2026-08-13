import { useMemo } from "react";
import type { FrontierTree } from "../core/types.js";
import { createFrontierGraphModel, type CreateFrontierGraphModelOptions } from "../frontier/model.js";

export function useFrontierGraph<TData>(
  tree: FrontierTree<TData>,
  frontier: number,
  options?: CreateFrontierGraphModelOptions,
) {
  return useMemo(() => createFrontierGraphModel(tree, frontier, options), [frontier, options, tree]);
}
