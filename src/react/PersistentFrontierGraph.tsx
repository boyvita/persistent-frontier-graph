import { useCallback, useEffect, useMemo, useState } from "react";
import type {
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
import { isRevealed } from "../frontier/visibility.js";
import { deriveProjectionViewportWindow, deriveRadialProjectionSector } from "../layout/viewport.js";
import { GraphViewport } from "./GraphViewport.js";

const DEFAULT_CONE_NODE_SIZE: Size = { height: 64, width: 208 };
const EMPTY_VIEWPORT_SIZE: Size = { height: 0, width: 0 };

interface RevisionViewport {
  readonly revision: string | null;
  readonly viewport: ViewportState;
}

export interface PersistentFrontierGraphProps<TData> {
  readonly actions?: readonly NodeAction<TData>[];
  readonly className?: string;
  readonly frontier: number;
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
  frontier,
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
  const [coneCamera, setConeCamera] = useState<RevisionViewport>({
    revision: null,
    viewport: { x: 106, y: 270, zoom: 1 },
  });
  const [radialCamera, setRadialCamera] = useState<RevisionViewport>({
    revision: null,
    viewport: { x: 320, y: 270, zoom: 1 },
  });

  const modelResult = useMemo(() => {
    try {
      return { model: createFrontierGraphModel(tree, frontier, layoutOptions), error: null };
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
  }, [frontier, layoutOptions, tree]);

  const model = modelResult.model;
  const coneZoom = model ? Math.min(0.82, Math.max(0.18, 650 / Math.max(650, model.cone.bounds.width))) : 1;
  const radialZoom = model ? Math.min(1, Math.max(0.1, 290 / Math.max(290, model.radial.maximumRadius))) : 1;
  const coneHomeViewport = useMemo<ViewportState>(() => ({
    x: coneViewportSize.width > 0 ? Math.min(106, coneViewportSize.width * 0.22) : 106,
    y: coneViewportSize.height > 0 ? coneViewportSize.height / 2 : 270,
    zoom: coneZoom,
  }), [coneViewportSize.height, coneViewportSize.width, coneZoom]);
  const radialHomeViewport = useMemo<ViewportState>(() => ({
    x: radialViewportSize.width > 0 ? radialViewportSize.width / 2 : 320,
    y: radialViewportSize.height > 0 ? radialViewportSize.height / 2 : 270,
    zoom: radialZoom,
  }), [radialViewportSize.height, radialViewportSize.width, radialZoom]);
  const coneViewport = coneCamera.revision === tree.revision ? coneCamera.viewport : coneHomeViewport;
  const radialViewport = radialCamera.revision === tree.revision ? radialCamera.viewport : radialHomeViewport;
  const coneNodeSize = layoutOptions?.cone?.nodeSize ?? DEFAULT_CONE_NODE_SIZE;

  const projectionViewport = useMemo(() => {
    if (!model || coneViewportSize.width <= 0 || coneViewportSize.height <= 0) return null;
    return deriveProjectionViewportWindow(model.cone, coneViewport, coneViewportSize, coneNodeSize);
  }, [coneNodeSize, coneViewport, coneViewportSize, model]);
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

  const handleConeViewportChange = useCallback((viewport: ViewportState) => {
    setConeCamera({ revision: tree.revision, viewport });
  }, [tree.revision]);
  const handleRadialViewportChange = useCallback((viewport: ViewportState) => {
    setRadialCamera({ revision: tree.revision, viewport });
  }, [tree.revision]);
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
  const requestedSelectedId = controlledSelectedId === undefined ? validLocalSelectedId : controlledSelectedId;
  const selectedId = requestedSelectedId !== null && model.snapshot.visibleNodeIds.has(requestedSelectedId)
    ? requestedSelectedId
    : requestedSelectedId !== null
      ? model.snapshot.ancestorById.get(requestedSelectedId) ?? tree.rootId
      : tree.rootId;
  const selectedNode = model.index.byId.get(selectedId)
    ?? model.index.byId.get(tree.rootId)
    ?? null;
  const select = (id: NodeId) => {
    if (controlledSelectedId === undefined) setLocalSelectedId(id);
    onSelectedIdChange?.(id);
  };
  const availableActions = selectedNode
    ? actions.filter((action) => action.isAvailable?.(selectedNode) ?? true)
    : [];

  return (
    <div className={`pfg-graph ${className ?? ""}`} data-frontier={model.snapshot.frontier.toFixed(3)}>
      <div className="pfg-graph__views">
        <GraphViewport
          ariaLabel="Persistent frontier cone projection"
          getNodeLabel={getNodeLabel}
          homeViewport={coneHomeViewport}
          key={`${tree.revision}:cone`}
          onSelect={select}
          onViewportChange={handleConeViewportChange}
          onViewportSizeChange={handleConeViewportSizeChange}
          overlays={overlays}
          projection={model.cone}
          renderEdge={renderEdge}
          renderNode={renderNode}
          selectedId={selectedNode?.id ?? null}
          tree={tree}
          view="cone"
          viewport={coneViewport}
          viewportWindow={projectionViewport}
        />
        <GraphViewport
          ariaLabel="Synchronized radial tree"
          edgePath={radialEdgePath}
          getNodeLabel={getNodeLabel}
          homeViewport={radialHomeViewport}
          key={`${tree.revision}:radial`}
          onSelect={select}
          onViewportChange={handleRadialViewportChange}
          onViewportSizeChange={handleRadialViewportSizeChange}
          overlays={overlays}
          projection={model.radial}
          radialSector={radialSector}
          renderEdge={renderEdge}
          renderNode={renderNode}
          selectedId={selectedNode?.id ?? null}
          tree={tree}
          view="radial"
          viewport={radialViewport}
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
            {model.cone.nodes
              .filter((node) => isRevealed(node.reveal))
              .map((node) => (
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
