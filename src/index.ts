export { InvalidTreeError } from "./core/errors.js";
export type { TreeValidationCode, TreeValidationIssue } from "./core/errors.js";
export { ancestorAtDepth, indexTree, subtreeSizes, validateTree } from "./core/tree.js";
export type {
  EdgeAppearance,
  ConeCameraState,
  EdgeRenderer,
  EdgeRendererContext,
  FrontierGraphError,
  FrontierNode,
  FrontierProjection,
  FrontierTree,
  FrontierView,
  GraphOverlay,
  NodeAction,
  NodeActionEvent,
  NodeActionEvent as FrontierNodeActionEvent,
  NodeId,
  NodeLabelGetter,
  NodeRenderer,
  NodeRendererContext,
  OverlayContext,
  OverlayRenderer,
  Point,
  ProjectionViewportWindow,
  ProjectedEdge,
  ProjectedNode,
  RadialProjectionSector,
  Size,
  TreeIndex,
  ViewportState,
} from "./core/types.js";
export { createFrontierGraphModel } from "./frontier/model.js";
export type { CreateFrontierGraphModelOptions, FrontierGraphModel } from "./frontier/model.js";
export {
  adaptiveFrontier,
  clampFrontier,
  deriveAutomaticFrontier,
  deriveFrontierSnapshot,
} from "./frontier/snapshot.js";
export type { FrontierSnapshot } from "./frontier/snapshot.js";
export { isRevealed } from "./frontier/visibility.js";
export { generateTree, treeCapacity } from "./generator/generateTree.js";
export type {
  GeneratedNodeContext,
  GeneratedNodeData,
  GenerateTreeOptions,
  GenerationErrorCode,
  GenerationFailure,
  GenerationResult,
  GenerationSuccess,
} from "./generator/types.js";
export { layoutCone } from "./layout/cone.js";
export type { ConeLayoutOptions, ConeLayoutResult, ConeProjectionContext } from "./layout/cone.js";
export { layoutRadial } from "./layout/radial.js";
export type { RadialLayoutOptions, RadialLayoutResult } from "./layout/radial.js";
export { deriveProjectionViewportWindow, deriveRadialProjectionSector } from "./layout/viewport.js";
export { PersistentFrontierGraph } from "./react/PersistentFrontierGraph.js";
export type { PersistentFrontierGraphProps } from "./react/PersistentFrontierGraph.js";
export { useFrontierGraph } from "./react/useFrontierGraph.js";
