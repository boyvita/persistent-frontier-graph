import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConeCameraState,
  EdgeRenderer,
  FrontierGraphError,
  FrontierTree,
  GraphOverlay,
  NodeAction,
  NodeActionEvent,
  NodeId,
  NodeLabelGetter,
  NodeRenderer,
  Point,
  ProjectionViewportWindow,
  Size,
  ViewportState,
} from "../core/types.js";
import { createFrontierGraphModel, type CreateFrontierGraphModelOptions } from "../frontier/model.js";
import { deriveAutomaticFrontier } from "../frontier/snapshot.js";
import { DEFAULT_CONE_NODE_SIZE } from "../layout/cone.js";
import { deriveProjectionViewportWindow, deriveRadialProjectionSector } from "../layout/viewport.js";
import { GraphViewport } from "./GraphViewport.js";
import { useConeProjectionViewport } from "./useConeProjectionViewport.js";
import { usePannableViewport } from "./usePannableViewport.js";

const EMPTY_VIEWPORT_SIZE: Size = { height: 0, width: 0 };
const CANVAS_PADDING = 48;

interface RevisionViewport {
  readonly revision: string | null;
  readonly viewport: ViewportState;
}

interface RevisionConeCamera {
  readonly camera: ConeCameraState;
  readonly revision: string | null;
}

export interface PersistentFrontierGraphProps<TData> {
  readonly actions?: readonly NodeAction<TData>[];
  readonly className?: string;
  /** Optional diagnostic override. The React view derives the frontier from its camera by default. */
  readonly frontier?: number;
  readonly getNodeLabel?: NodeLabelGetter<TData>;
  readonly layoutOptions?: CreateFrontierGraphModelOptions;
  readonly onAction?: (event: NodeActionEvent<TData>) => void;
  readonly onError?: (error: FrontierGraphError) => void;
  readonly onProjectionViewportChange?: (window: ProjectionViewportWindow) => void;
  readonly onSelectedIdChange?: (nodeId: NodeId) => void;
  readonly overlays?: readonly GraphOverlay<TData>[];
  readonly renderEdge?: EdgeRenderer<TData>;
  readonly renderNode?: NodeRenderer<TData>;
  readonly selectedId?: NodeId | null;
  readonly tree: FrontierTree<TData>;
}

function radialEdgePath(source: Point, target: Point): string {
  const sourceRadius = Math.hypot(source.x, source.y);
  if (sourceRadius < 0.001) return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
  const targetRadius = Math.hypot(target.x, target.y);
  const middleRadius = (sourceRadius + targetRadius) / 2;
  const sourceAngle = Math.atan2(source.y, source.x);
  const targetAngle = Math.atan2(target.y, target.x);
  const first = { x: Math.cos(sourceAngle) * middleRadius, y: Math.sin(sourceAngle) * middleRadius };
  const second = { x: Math.cos(targetAngle) * middleRadius, y: Math.sin(targetAngle) * middleRadius };
  return `M ${source.x} ${source.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${target.x} ${target.y}`;
}

function sameSize(left: Size, right: Size): boolean {
  return left.width === right.width && left.height === right.height;
}

export function PersistentFrontierGraph<TData>({
  actions = [],
  className,
  frontier: frontierOverride,
  getNodeLabel,
  layoutOptions,
  onAction,
  onError,
  onProjectionViewportChange,
  onSelectedIdChange,
  overlays,
  renderEdge,
  renderNode,
  selectedId: controlledSelectedId,
  tree,
}: PersistentFrontierGraphProps<TData>) {
  const [localSelectedId, setLocalSelectedId] = useState<NodeId>(tree.rootId);
  const [coneViewportSize, setConeViewportSize] = useState<Size>(EMPTY_VIEWPORT_SIZE);
  const [radialViewportSize, setRadialViewportSize] = useState<Size>(EMPTY_VIEWPORT_SIZE);
  const [coneCameraState, setConeCameraState] = useState<RevisionConeCamera>({
    camera: { radialOffset: 0, verticalOffset: 0, zoom: 1 },
    revision: null,
  });
  const [radialCamera, setRadialCamera] = useState<RevisionViewport>({
    revision: null,
    viewport: { x: 320, y: 270, zoom: 1 },
  });

  const baseResult = useMemo(() => {
    try {
      return { model: createFrontierGraphModel(tree, undefined, layoutOptions), error: null };
    } catch (cause) {
      return {
        model: null,
        error: {
          cause,
          code: "invalid_tree" as const,
          message: cause instanceof Error ? cause.message : "The tree is invalid.",
        },
      };
    }
  }, [layoutOptions, tree]);

  const baseModel = baseResult.model;
  const nodeSize = layoutOptions?.cone?.nodeSize ?? DEFAULT_CONE_NODE_SIZE;
  const depthSlot = nodeSize.width + (layoutOptions?.cone?.columnGap ?? 74);
  const radialExtent = baseModel
    ? baseModel.index.maximumDepth * depthSlot + nodeSize.width
    : nodeSize.width;
  const maximumRadialOffset = Math.max(0, radialExtent - nodeSize.width / 2);
  const coneFitZoom = baseModel && coneViewportSize.width > 0 && coneViewportSize.height > 0
    ? Math.min(1, Math.max(0.02, Math.min(
        Math.max(1, coneViewportSize.width - CANVAS_PADDING) / Math.max(1, radialExtent + nodeSize.width / 2),
        Math.max(1, coneViewportSize.height - CANVAS_PADDING) / Math.max(1, baseModel.cone.bounds.height),
      )))
    : 0.3;
  const radialFitZoom = baseModel && radialViewportSize.width > 0 && radialViewportSize.height > 0
    ? Math.min(1, Math.max(0.08, Math.min(
        radialViewportSize.width / Math.max(1, baseModel.radial.maximumRadius * 2.2),
        radialViewportSize.height / Math.max(1, baseModel.radial.maximumRadius * 2.2),
      )))
    : 1;
  const coneHomeCamera = useMemo<ConeCameraState>(() => ({
    radialOffset: 0,
    verticalOffset: 0,
    zoom: coneFitZoom,
  }), [coneFitZoom]);
  const radialHomeViewport = useMemo<ViewportState>(() => ({
    x: radialViewportSize.width > 0 ? radialViewportSize.width / 2 : 320,
    y: radialViewportSize.height > 0 ? radialViewportSize.height / 2 : 270,
    zoom: radialFitZoom,
  }), [radialFitZoom, radialViewportSize.height, radialViewportSize.width]);
  const coneCamera = coneCameraState.revision === tree.revision ? coneCameraState.camera : coneHomeCamera;
  const radialViewport = radialCamera.revision === tree.revision ? radialCamera.viewport : radialHomeViewport;

  const radialSpanAt = useCallback((camera: ConeCameraState) => {
    const available = coneViewportSize.width > 0
      ? Math.max(0, coneViewportSize.width - CANVAS_PADDING) / camera.zoom
      : radialExtent;
    const contextualGutter = Math.min(depthSlot, camera.radialOffset);
    return Math.max(nodeSize.width, available - contextualGutter);
  }, [coneViewportSize.width, depthSlot, nodeSize.width, radialExtent]);

  const frontierAt = useCallback((camera: ConeCameraState) => {
    if (frontierOverride !== undefined) return frontierOverride;
    return deriveAutomaticFrontier(
      camera.radialOffset,
      radialSpanAt(camera),
      baseModel?.index.maximumDepth ?? 0,
      nodeSize.width,
      depthSlot,
    );
  }, [baseModel?.index.maximumDepth, depthSlot, frontierOverride, nodeSize.width, radialSpanAt]);

  const modelAt = useCallback((camera: ConeCameraState) => createFrontierGraphModel(
    tree,
    frontierAt(camera),
    {
      ...layoutOptions,
      coneProjection: {
        verticalCenter: -camera.verticalOffset,
        verticalSpan: coneViewportSize.height > 0
          ? Math.max(0, coneViewportSize.height - CANVAS_PADDING) / camera.zoom
          : 0,
      },
    },
  ), [coneViewportSize.height, frontierAt, layoutOptions, tree]);

  const getConeLayout = useCallback((camera: ConeCameraState) => {
    if (!baseModel) return { clampedNodeIds: new Set<NodeId>(), positions: new Map<NodeId, Point>() };
    const cone = modelAt(camera).cone;
    return {
      clampedNodeIds: cone.clampedNodeIds,
      positions: new Map(cone.nodes.map((node) => [node.node.id, node.position])),
    };
  }, [baseModel, modelAt]);

  const handleConeCameraChange = useCallback((camera: ConeCameraState) => {
    setConeCameraState({ camera, revision: tree.revision });
  }, [tree.revision]);
  const handleRadialViewportChange = useCallback((viewport: ViewportState) => {
    setRadialCamera({ revision: tree.revision, viewport });
  }, [tree.revision]);
  const coneController = useConeProjectionViewport({
    camera: coneCamera,
    depthSlot,
    getLayout: getConeLayout,
    homeCamera: coneHomeCamera,
    maximumRadialOffset,
    nodeSize,
    onCameraChange: handleConeCameraChange,
    viewportSize: coneViewportSize,
  });
  const radialController = usePannableViewport(radialViewport, radialHomeViewport, handleRadialViewportChange);

  const modelResult = useMemo(() => {
    if (!baseModel) return baseResult;
    try {
      return { model: modelAt(coneCamera), error: null };
    } catch (cause) {
      return {
        model: null,
        error: {
          cause,
          code: "invalid_tree" as const,
          message: cause instanceof Error ? cause.message : "The tree is invalid.",
        },
      };
    }
  }, [baseModel, baseResult, coneCamera, modelAt]);
  const model = modelResult.model;

  const projectionViewport = useMemo(() => {
    if (!model || coneViewportSize.width <= 0 || coneViewportSize.height <= 0) return null;
    return deriveProjectionViewportWindow(model.cone, coneController.viewport, coneViewportSize, nodeSize);
  }, [coneController.viewport, coneViewportSize, model, nodeSize]);
  const radialSector = useMemo(
    () => projectionViewport && model ? deriveRadialProjectionSector(projectionViewport, model.radial) : null,
    [model, projectionViewport],
  );

  useEffect(() => {
    if (modelResult.error) onError?.(modelResult.error);
  }, [modelResult.error, onError]);
  useEffect(() => {
    if (projectionViewport) onProjectionViewportChange?.(projectionViewport);
  }, [onProjectionViewportChange, projectionViewport]);

  const handleConeViewportSizeChange = useCallback((size: Size) => {
    setConeViewportSize((current) => sameSize(current, size) ? current : size);
  }, []);
  const handleRadialViewportSizeChange = useCallback((size: Size) => {
    setRadialViewportSize((current) => sameSize(current, size) ? current : size);
  }, []);

  if (!model) {
    return <div className="pfg-error" role="alert"><strong>Unable to render this tree.</strong><span>{modelResult.error?.message}</span></div>;
  }

  const validLocalSelectedId = model.index.byId.has(localSelectedId) ? localSelectedId : tree.rootId;
  const selectedId = controlledSelectedId === undefined ? validLocalSelectedId : controlledSelectedId ?? tree.rootId;
  const selectedNode = model.index.byId.get(selectedId) ?? model.index.byId.get(tree.rootId) ?? null;
  const select = (id: NodeId) => {
    if (controlledSelectedId === undefined) setLocalSelectedId(id);
    onSelectedIdChange?.(id);
  };
  const availableActions = selectedNode
    ? actions.filter((action) => action.isAvailable?.(selectedNode) ?? true)
    : [];

  return (
    <div
      className={`pfg-graph ${className ?? ""}`}
      data-frontier={model.snapshot.frontier.toFixed(3)}
      data-frontier-mode={frontierOverride === undefined ? "auto" : "fixed"}
      data-maximum-radial-offset={maximumRadialOffset.toFixed(3)}
      data-radial-offset={coneCamera.radialOffset.toFixed(3)}
    >
      <div className="pfg-graph__views">
        <GraphViewport
          ariaLabel="Persistent frontier cone projection"
          camera={coneController}
          getNodeLabel={getNodeLabel}
          key={`${tree.revision}:cone`}
          onSelect={select}
          onViewportSizeChange={handleConeViewportSizeChange}
          overlays={overlays}
          projection={model.cone}
          renderEdge={renderEdge}
          renderNode={renderNode}
          selectedId={selectedNode?.id ?? null}
          tree={tree}
          view="cone"
          viewportWindow={projectionViewport}
        />
        <GraphViewport
          ariaLabel="Synchronized radial tree"
          camera={radialController}
          edgePath={radialEdgePath}
          getNodeLabel={getNodeLabel}
          key={`${tree.revision}:radial`}
          onSelect={select}
          onViewportSizeChange={handleRadialViewportSizeChange}
          overlays={overlays}
          projection={model.radial}
          radialSector={radialSector}
          renderEdge={renderEdge}
          renderNode={renderNode}
          selectedId={selectedNode?.id ?? null}
          tree={tree}
          view="radial"
        />
      </div>
      <footer className="pfg-selection" aria-live="polite">
        <div className="pfg-selection__summary">
          <span>Selected node</span>
          <strong>{selectedNode?.id ?? "None"}</strong>
          {selectedNode ? <small>depth {model.index.depthById.get(selectedNode.id) ?? 0}</small> : null}
        </div>
        <label className="pfg-node-navigator">
          <span>Node navigator</span>
          <select value={selectedNode?.id ?? tree.rootId} onChange={(event) => select(event.target.value)}>
            {model.cone.nodes.map((node) => (
              <option key={node.node.id} value={node.node.id}>
                {getNodeLabel?.(node.node) ?? (typeof node.node.data === "object" && node.node.data !== null && "label" in node.node.data
                  ? String(node.node.data.label)
                  : node.node.id)} · depth {node.depth}
              </option>
            ))}
          </select>
        </label>
        {availableActions.length > 0 ? (
          <div className="pfg-selection__actions">
            {availableActions.map((action) => (
              <button
                data-pfg-interactive
                key={action.id}
                onClick={() => selectedNode && onAction?.({ action, node: selectedNode, treeRevision: tree.revision })}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </footer>
    </div>
  );
}
