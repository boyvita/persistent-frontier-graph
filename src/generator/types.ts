import type { FrontierTree } from "../core/types.js";

export interface GenerateTreeOptions {
  readonly breadthDepthBias: number;
  readonly maxBranches: number;
  readonly maxDepth: number;
  readonly nodeCount: number;
  readonly seed: number | string;
  readonly uniform: boolean;
}

export interface GeneratedNodeData {
  readonly label: string;
  readonly ordinal: number;
}

export interface GeneratedNodeContext {
  readonly depth: number;
  readonly id: string;
  readonly ordinal: number;
  readonly parentId: string | null;
  readonly seed: string;
}

export type GenerationErrorCode = "capacity_exceeded" | "invalid_option";

export interface GenerationFailure {
  readonly ok: false;
  readonly error: {
    readonly code: GenerationErrorCode;
    readonly message: string;
  };
}

export interface GenerationSuccess<TData> {
  readonly ok: true;
  readonly seed: string;
  readonly tree: FrontierTree<TData>;
}

export type GenerationResult<TData> = GenerationFailure | GenerationSuccess<TData>;
