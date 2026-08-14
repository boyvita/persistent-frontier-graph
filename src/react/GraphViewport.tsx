import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type {
  EdgeRenderer,
  FrontierProjection,
  FrontierTree,
  FrontierView,
  GraphOverlay,
  NodeId,
  NodeLabelGetter,
  NodeRenderer,
  Point,
  ProjectionViewportWindow,
  RadialProjectionSector,
  Size,
  ViewportState,
} from "../core/types.js";
import { isRevealed } from "../frontier/visibility.js";
import { usePannableViewport } from "./usePannableViewport.js";

export interface GraphViewportProps<TData> {
  readonly ariaLabel: string;
  readonly className?: string | undefined;
  readonly edgePath?: ((source: Point, target: Point) => string) | undefined;
  readonly getNodeLabel?: NodeLabelGetter<TData> | undefined;
  readonly homeViewport: ViewportState;
  readonly onSelect: (id: NodeId) => void;
  readonly onViewportChange: (viewport: ViewportState) => void;
  readonly onViewportSizeChange?: ((size: Size) => void) | undefined;
  readonly overlays?: readonly GraphOverlay<TData>[] | undefined;
  readonly projection: FrontierProjection<TData>;
  readonly renderEdge?: EdgeRenderer<TData> | undefined;
  readonly renderNode?: NodeRenderer<TData> | undefined;
  readonly radialSector?: RadialProjectionSector | null | undefined;
  readonly selectedId: NodeId | null;
  readonly tree: FrontierTree<TData>;
  readonly view: FrontierView;
  readonly viewport: ViewportState;
  readonly viewportWindow?: ProjectionViewportWindow | null | undefined;
}

function defaultLabel(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "label" in data && typeof data.label === "string") return data.label;
  return "Tree node";
}

function defaultEdgePath(source: Point, target: Point): string {
  const middleX = (source.x + target.x) / 2;
  return `M ${source.x} ${source.y} C ${middleX} ${source.y}, ${middleX} ${target.y}, ${target.x} ${target.y}`;
}

function polar(radius: number, angle: number): Point {
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

function radialSectorPath(sector: RadialProjectionSector): string {
  const innerRadius = Math.max(0, sector.innerRadius);
  const outerRadius = Math.max(innerRadius, sector.outerRadius);
  if (sector.fullCircle) {
    const right = polar(outerRadius, 0);
    const left = polar(outerRadius, Math.PI);
    if (innerRadius <= 0.001) {
      return `M ${right.x} ${right.y} A ${outerRadius} ${outerRadius} 0 1 1 ${left.x} ${left.y} A ${outerRadius} ${outerRadius} 0 1 1 ${right.x} ${right.y} Z`;
    }
    const innerRight = polar(innerRadius, 0);
    const innerLeft = polar(innerRadius, Math.PI);
    return [
      `M ${right.x} ${right.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${left.x} ${left.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${right.x} ${right.y}`,
      `L ${innerRight.x} ${innerRight.y}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${innerLeft.x} ${innerLeft.y}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${innerRight.x} ${innerRight.y}`,
      "Z",
    ].join(" ");
  }
  const lowerInner = polar(innerRadius, sector.lowerAngle);
  const lowerOuter = polar(outerRadius, sector.lowerAngle);
  const upperOuter = polar(outerRadius, sector.upperAngle);
  const upperInner = polar(innerRadius, sector.upperAngle);
  const largeArc = sector.upperAngle - sector.lowerAngle > Math.PI ? 1 : 0;
  return [
    `M ${lowerInner.x} ${lowerInner.y}`,
    `L ${lowerOuter.x} ${lowerOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${upperOuter.x} ${upperOuter.y}`,
    `L ${upperInner.x} ${upperInner.y}`,
    ...(innerRadius > 0.001
      ? [`A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${lowerInner.x} ${lowerInner.y}`]
      : []),
    "Z",
  ].join(" ");
}

export function GraphViewport<TData>({
  ariaLabel,
  className,
  edgePath = defaultEdgePath,
  getNodeLabel,
  homeViewport,
  onSelect,
  onViewportChange,
  onViewportSizeChange,
  overlays = [],
  projection,
  renderEdge,
  renderNode,
  radialSector,
  selectedId,
  tree,
  view,
  viewport,
  viewportWindow,
}: GraphViewportProps<TData>) {
  const camera = usePannableViewport(viewport, homeViewport, onViewportChange);
  const canvasRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(tree.nodes.map((node) => [node.id, node])), [tree]);
  const visibleNodes = projection.nodes.filter((node) => isRevealed(node.reveal));

  useLayoutEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      onViewportSizeChange?.({ height: bounds.height, width: bounds.width });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [onViewportSizeChange]);

  const radialWindowCount = view === "radial"
    ? visibleNodes.filter((node) => radialSector?.visibleNodeIds.has(node.node.id) ?? false).length
    : null;

  useLayoutEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    element.addEventListener("wheel", camera.onWheel, { passive: false });
    return () => element.removeEventListener("wheel", camera.onWheel);
  }, [camera.onWheel]);

  return (
    <section className={`pfg-viewport ${className ?? ""}`} aria-label={ariaLabel} data-pfg-view={view}>
      <header className="pfg-viewport__header">
        <div>
          <strong>{view === "cone" ? "Persistent frontier" : "Radial tree"}</strong>
          <span>
            {radialWindowCount === null
              ? `${visibleNodes.length.toLocaleString()} visible`
              : `${radialWindowCount.toLocaleString()} in cone viewport · ${visibleNodes.length.toLocaleString()} revealed`}
            {` · depth ${projection.frontier.toFixed(1)}`}
          </span>
        </div>
        <div className="pfg-camera-controls" data-pfg-interactive>
          <button type="button" onClick={() => camera.zoomBy(0.8)} aria-label={`Zoom out ${view} view`}>−</button>
          <output aria-label={`${view} zoom`}>{Math.round(camera.viewport.zoom * 100)}%</output>
          <button type="button" onClick={() => camera.zoomBy(1.25)} aria-label={`Zoom in ${view} view`}>+</button>
          <button type="button" onClick={camera.reset}>Fit</button>
        </div>
      </header>
      <p className="pfg-sr-only">This is a visual projection. Use the shared node navigator below the graph to select a node with the keyboard.</p>
      <div
        aria-hidden="true"
        className={`pfg-viewport__canvas ${camera.isDragging ? "is-dragging" : ""}`}
        ref={canvasRef}
        {...camera.handlers}
      >
        <div
          className="pfg-scene"
          style={{ transform: `translate3d(${camera.viewport.x}px, ${camera.viewport.y}px, 0) scale(${camera.viewport.zoom})` }}
        >
          <svg className="pfg-edges" aria-hidden="true" overflow="visible">
            {view === "radial" && radialSector ? (
              <path
                className="pfg-projection-sector"
                d={radialSectorPath(radialSector)}
                data-node-count={radialSector.visibleNodeIds.size}
                data-pfg-projection-sector
              />
            ) : null}
            {projection.edges.map((edge) => {
              const source = byId.get(edge.sourceId);
              const target = byId.get(edge.targetId);
              const appearance = source && target ? renderEdge?.({ edge, source, target, view }) : undefined;
              const isInsideRadialWindow = view !== "radial" || Boolean(
                radialSector?.visibleNodeIds.has(edge.sourceId)
                && radialSector.visibleNodeIds.has(edge.targetId),
              );
              return (
                <path
                  className={appearance?.className}
                  d={edgePath(edge.source, edge.target)}
                  data-edge-id={edge.id}
                  data-in-projection-window={view === "radial"
                    ? (isInsideRadialWindow ? "true" : "false")
                    : undefined}
                  key={edge.id}
                  style={{
                    ...appearance?.style,
                    opacity: isRevealed(edge.reveal) && isInsideRadialWindow ? edge.reveal : 0,
                  }}
                />
              );
            })}
          </svg>
          <div className="pfg-nodes">
            {projection.nodes.map((projected) => {
              const selected = selectedId === projected.node.id;
              const isInsideRadialWindow = view !== "radial"
                || Boolean(radialSector?.visibleNodeIds.has(projected.node.id));
              const isVisible = isRevealed(projected.reveal) && isInsideRadialWindow;
              const content: ReactNode = renderNode?.({
                data: projected.node.data,
                depth: projected.depth,
                isFrontier: projected.isFrontier,
                isSelected: selected,
                node: projected.node,
                reveal: projected.reveal,
                select: (event) => {
                  event?.stopPropagation();
                  onSelect(projected.node.id);
                },
                view,
              }) ?? <span>{defaultLabel(projected.node.data)}</span>;
              return (
                <div
                  className={`pfg-node pfg-node--${view} ${selected ? "is-selected" : ""} ${projected.isFrontier ? "is-frontier" : ""}`}
                  data-depth={projected.depth}
                  data-frontier={projected.isFrontier ? "true" : "false"}
                  data-node-id={projected.node.id}
                  data-node-label={getNodeLabel?.(projected.node) ?? defaultLabel(projected.node.data)}
                  data-in-projection-window={view === "radial"
                    ? (isInsideRadialWindow ? "true" : "false")
                    : undefined}
                  data-in-viewport={view === "cone"
                    ? (viewportWindow?.visibleNodeIds.has(projected.node.id) ? "true" : "false")
                    : undefined}
                  data-pfg-interactive
                  key={projected.node.id}
                  onClick={() => onSelect(projected.node.id)}
                  style={{
                    opacity: isVisible ? projected.reveal : 0,
                    pointerEvents: isVisible ? undefined : "none",
                    transform: `translate3d(${projected.position.x}px, ${projected.position.y}px, 0) translate(-50%, -50%)`,
                  }}
                >
                  {content}
                </div>
              );
            })}
          </div>
          {overlays
            .filter((overlay) => !overlay.views || overlay.views.includes(view))
            .map((overlay) => (
              <div className="pfg-overlay" key={overlay.id}>
                {overlay.render({ projection, selectNode: onSelect, selectedId, view })}
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
