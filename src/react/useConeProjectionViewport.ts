import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { ConeCameraState, NodeId, Point, Size, ViewportState } from "../core/types.js";

const DRAG_THRESHOLD_PX = 3;
const WHEEL_SESSION_IDLE_MS = 120;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 1.6;
const LEFT_GUTTER = 24;

interface ProjectionLayout {
  readonly clampedNodeIds: ReadonlySet<NodeId>;
  readonly positions: ReadonlyMap<NodeId, Point>;
}

interface DragSession {
  readonly anchorNodeId: NodeId | undefined;
  readonly anchorWorld: Point;
  readonly excludedAnchorIds: ReadonlySet<NodeId>;
  readonly pointerId: number;
  readonly sourceLayout: ReadonlyMap<NodeId, Point>;
  readonly startCamera: ConeCameraState;
  readonly startClientX: number;
  readonly startClientY: number;
  moved: boolean;
}

interface WheelSession {
  readonly anchorNodeId: NodeId | undefined;
  readonly anchorScreenX: number;
  readonly anchorScreenY: number;
  readonly anchorWorld: Point;
  readonly excludedAnchorIds: ReadonlySet<NodeId>;
  readonly sourceLayout: ReadonlyMap<NodeId, Point>;
  readonly startCamera: ConeCameraState;
  timerId: number | null;
  totalDelta: number;
}

export interface ConeProjectionViewport {
  readonly camera: ConeCameraState;
  readonly handlers: {
    readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  };
  readonly isDragging: boolean;
  readonly onWheel: (event: globalThis.WheelEvent) => void;
  readonly reset: () => void;
  readonly shouldSuppressClick: () => boolean;
  readonly viewport: ViewportState;
  readonly zoomBy: (factor: number) => void;
}

interface ConeProjectionViewportOptions {
  readonly camera: ConeCameraState;
  readonly depthSlot: number;
  readonly getLayout: (camera: ConeCameraState) => ProjectionLayout;
  readonly homeCamera: ConeCameraState;
  readonly maximumRadialOffset: number;
  readonly nodeSize: Size;
  readonly onCameraChange: (camera: ConeCameraState) => void;
  readonly viewportSize: Size;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function coneViewportForCamera(
  camera: ConeCameraState,
  viewportSize: Size,
  nodeSize: Size,
  depthSlot: number,
): ViewportState {
  const contextualGutter = Math.min(depthSlot, camera.radialOffset);
  return {
    x: LEFT_GUTTER + (nodeSize.width / 2 - camera.radialOffset + contextualGutter) * camera.zoom,
    y: viewportSize.height / 2 + camera.verticalOffset * camera.zoom,
    zoom: camera.zoom,
  };
}

function anchorDisplacement(
  source: ReadonlyMap<NodeId, Point>,
  target: ReadonlyMap<NodeId, Point>,
  anchor: Point,
  excludedIds: ReadonlySet<NodeId>,
  preferredId: NodeId | undefined,
  nodeSize: Size,
  depthSlot: number,
): number {
  const preferredSource = preferredId && !excludedIds.has(preferredId) ? source.get(preferredId) : undefined;
  const preferredTarget = preferredId ? target.get(preferredId) : undefined;
  const horizontalScale = depthSlot * 0.72;
  const verticalScale = Math.max(nodeSize.height + 10, 96) * 1.4;
  if (preferredSource && preferredTarget) {
    const normalizedX = (preferredSource.x - anchor.x) / horizontalScale;
    const normalizedY = (preferredSource.y - anchor.y) / verticalScale;
    if (normalizedX ** 2 + normalizedY ** 2 <= 0.75) return preferredTarget.y - preferredSource.y;
  }
  let weighted = 0;
  let totalWeight = 0;
  for (const [id, sourcePoint] of source) {
    if (excludedIds.has(id)) continue;
    const targetPoint = target.get(id);
    if (!targetPoint) continue;
    const normalizedX = (sourcePoint.x - anchor.x) / horizontalScale;
    const normalizedY = (sourcePoint.y - anchor.y) / verticalScale;
    const distanceSquared = normalizedX ** 2 + normalizedY ** 2;
    const weight = Math.exp(-distanceSquared / 2) / (0.04 + distanceSquared);
    if (weight < 0.000001) continue;
    weighted += weight * (targetPoint.y - sourcePoint.y);
    totalWeight += weight;
  }
  return totalWeight > 0.000001 ? weighted / totalWeight : 0;
}

export function useConeProjectionViewport({
  camera,
  depthSlot,
  getLayout,
  homeCamera,
  maximumRadialOffset,
  nodeSize,
  onCameraChange,
  viewportSize,
}: ConeProjectionViewportOptions): ConeProjectionViewport {
  const [isDragging, setIsDragging] = useState(false);
  const cameraRef = useRef(camera);
  const drag = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef<WheelSession | null>(null);

  useLayoutEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useLayoutEffect(() => () => {
    const timerId = wheel.current?.timerId;
    if (timerId !== null && timerId !== undefined) window.clearTimeout(timerId);
  }, []);

  const minimumZoom = clamp(homeCamera.zoom, MIN_ZOOM, MAX_ZOOM);

  const clampCamera = useCallback((candidate: ConeCameraState): ConeCameraState => {
    const bounded = {
      radialOffset: clamp(candidate.radialOffset, 0, maximumRadialOffset),
      verticalOffset: candidate.verticalOffset,
      zoom: clamp(candidate.zoom, minimumZoom, MAX_ZOOM),
    };
    const layout = getLayout(bounded).positions;
    if (layout.size === 0) return { ...bounded, verticalOffset: 0 };
    const minimumY = Math.min(...[...layout.values()].map((point) => point.y));
    const maximumY = Math.max(...[...layout.values()].map((point) => point.y));
    const edgeAllowance = Math.max(nodeSize.height + 10, 96) / 2;
    return {
      ...bounded,
      verticalOffset: clamp(
        bounded.verticalOffset,
        -maximumY - edgeAllowance,
        -minimumY + edgeAllowance,
      ),
    };
  }, [getLayout, maximumRadialOffset, minimumZoom, nodeSize.height]);

  const commit = useCallback((candidate: ConeCameraState) => {
    const next = clampCamera(candidate);
    cameraRef.current = next;
    onCameraChange(next);
  }, [clampCamera, onCameraChange]);

  const layoutAnchoredCamera = useCallback((
    candidate: ConeCameraState,
    sourceLayout: ReadonlyMap<NodeId, Point>,
    anchorWorld: Point,
    excludedAnchorIds: ReadonlySet<NodeId>,
    anchorNodeId: NodeId | undefined,
    desiredWorldShift: number,
    sourceVerticalOffset: number,
  ): ConeCameraState => {
    let next = clampCamera(candidate);
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const target = getLayout(next);
      const displacement = anchorDisplacement(
        sourceLayout,
        target.positions,
        anchorWorld,
        excludedAnchorIds,
        anchorNodeId,
        nodeSize,
        depthSlot,
      );
      const residual = displacement + next.verticalOffset - sourceVerticalOffset - desiredWorldShift;
      if (Math.abs(residual) < 0.001) break;
      next = clampCamera({ ...next, verticalOffset: next.verticalOffset - residual });
    }
    return next;
  }, [clampCamera, depthSlot, getLayout, nodeSize]);

  const clearWheelSession = useCallback(() => {
    const active = wheel.current;
    if (active?.timerId !== null && active?.timerId !== undefined) window.clearTimeout(active.timerId);
    wheel.current = null;
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,textarea,select,[data-pfg-interactive]")) return;
    clearWheelSession();
    const bounds = event.currentTarget.getBoundingClientRect();
    const current = cameraRef.current;
    const viewport = coneViewportForCamera(current, viewportSize, nodeSize, depthSlot);
    const source = getLayout(current);
    drag.current = {
      anchorNodeId: (event.target as Element).closest<HTMLElement>("[data-node-id]")?.dataset.nodeId,
      anchorWorld: {
        x: (event.clientX - bounds.left - viewport.x) / viewport.zoom,
        y: (event.clientY - bounds.top - viewport.y) / viewport.zoom,
      },
      excludedAnchorIds: source.clampedNodeIds,
      moved: false,
      pointerId: event.pointerId,
      sourceLayout: source.positions,
      startCamera: current,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }, [clearWheelSession, depthSlot, getLayout, nodeSize, viewportSize]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - active.startClientX;
    const deltaY = event.clientY - active.startClientY;
    if (!active.moved) {
      if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
      active.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }
    const candidate = {
      ...active.startCamera,
      radialOffset: active.startCamera.radialOffset - deltaX / active.startCamera.zoom,
      verticalOffset: active.startCamera.verticalOffset + deltaY / active.startCamera.zoom,
    };
    commit(layoutAnchoredCamera(
      candidate,
      active.sourceLayout,
      active.anchorWorld,
      active.excludedAnchorIds,
      active.anchorNodeId,
      deltaY / active.startCamera.zoom,
      active.startCamera.verticalOffset,
    ));
  }, [commit, layoutAnchoredCamera]);

  const stopDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = Boolean(drag.current.moved);
    drag.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const onWheel = useCallback((event: globalThis.WheelEvent) => {
    if (event.deltaY === 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement | null;
    if (!element) return;
    let active = wheel.current;
    if (!active) {
      const bounds = element.getBoundingClientRect();
      const current = cameraRef.current;
      const viewport = coneViewportForCamera(current, viewportSize, nodeSize, depthSlot);
      const anchorScreenX = event.clientX - bounds.left;
      const anchorScreenY = event.clientY - bounds.top;
      const source = getLayout(current);
      active = {
        anchorNodeId: (event.target as Element).closest<HTMLElement>("[data-node-id]")?.dataset.nodeId,
        anchorScreenX,
        anchorScreenY,
        anchorWorld: {
          x: (anchorScreenX - viewport.x) / viewport.zoom,
          y: (anchorScreenY - viewport.y) / viewport.zoom,
        },
        excludedAnchorIds: source.clampedNodeIds,
        sourceLayout: source.positions,
        startCamera: current,
        timerId: null,
        totalDelta: 0,
      };
      wheel.current = active;
    }
    if (!active) return;
    if (active.timerId !== null) window.clearTimeout(active.timerId);
    const nextTotalDelta = active.totalDelta + event.deltaY;
    const timerId = window.setTimeout(() => {
      if (wheel.current?.totalDelta === nextTotalDelta) wheel.current = null;
    }, WHEEL_SESSION_IDLE_MS);
    const session = { ...active, timerId, totalDelta: nextTotalDelta };
    wheel.current = session;
    const nextZoom = clamp(session.startCamera.zoom * Math.exp(-session.totalDelta * 0.001), minimumZoom, MAX_ZOOM);
    const desiredOffset = session.startCamera.radialOffset
      + (session.anchorScreenX - LEFT_GUTTER) * (1 / session.startCamera.zoom - 1 / nextZoom);
    const verticalScreenOffset = session.anchorScreenY - viewportSize.height / 2;
    const desiredWorldShift = verticalScreenOffset / nextZoom - verticalScreenOffset / session.startCamera.zoom;
    const candidate = {
      ...session.startCamera,
      radialOffset: desiredOffset,
      verticalOffset: session.startCamera.verticalOffset + desiredWorldShift,
      zoom: nextZoom,
    };
    commit(layoutAnchoredCamera(
      candidate,
      session.sourceLayout,
      session.anchorWorld,
      session.excludedAnchorIds,
      session.anchorNodeId,
      desiredWorldShift,
      session.startCamera.verticalOffset,
    ));
  }, [commit, depthSlot, getLayout, layoutAnchoredCamera, minimumZoom, nodeSize, viewportSize]);

  const reset = useCallback(() => {
    clearWheelSession();
    commit(homeCamera);
  }, [clearWheelSession, commit, homeCamera]);

  const zoomBy = useCallback((factor: number) => {
    const current = cameraRef.current;
    commit({ ...current, zoom: current.zoom * factor });
  }, [commit]);

  const shouldSuppressClick = useCallback(() => {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  }, []);

  return {
    camera,
    handlers: {
      onPointerCancel: stopDrag,
      onPointerDown,
      onPointerMove,
      onPointerUp: stopDrag,
    },
    isDragging,
    onWheel,
    reset,
    shouldSuppressClick,
    viewport: coneViewportForCamera(camera, viewportSize, nodeSize, depthSlot),
    zoomBy,
  };
}
