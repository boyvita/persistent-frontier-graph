import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import type { ConeCameraState, NodeId, Point, Size, ViewportState } from "../core/types.js";

const DRAG_THRESHOLD_PX = 3;
const WHEEL_SESSION_IDLE_MS = 120;
const MOTION_MAX_SPEED_PX_PER_MS = 0.6;
const MOTION_FILTER_RATE = 18;
const MOTION_MAX_FRAME_MS = 32;
const MOTION_SETTLE_DISTANCE_PX = 0.75;
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
  lastClientX: number;
  lastClientY: number;
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

type MotionSource = "drag" | "focus" | "wheel";

interface MotionState {
  frameId: number | null;
  lastFrameAt: number | null;
  resolveTarget: (() => ConeCameraState | null) | null;
  source: MotionSource | null;
  stageCamera: ConeCameraState | null;
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
  readonly isMoving: boolean;
  readonly onWheel: (event: globalThis.WheelEvent) => void;
  readonly reset: () => void;
  readonly shouldSuppressClick: () => boolean;
  readonly viewport: ViewportState;
  readonly zoomBy: (factor: number) => void;
}

interface ConeProjectionViewportOptions {
  readonly authorityKey: string;
  readonly camera: ConeCameraState;
  readonly depthSlot: number;
  readonly getLayout: (camera: ConeCameraState) => ProjectionLayout;
  readonly homeCamera: ConeCameraState;
  readonly maximumRadialOffset: number;
  readonly minimumZoom: number;
  readonly nodeSize: Size;
  readonly onCameraChange: (camera: ConeCameraState) => void;
  readonly viewportSize: Size;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolateCamera(source: ConeCameraState, target: ConeCameraState, ratio: number): ConeCameraState {
  const interpolate = (left: number, right: number) => left + (right - left) * ratio;
  return {
    radialOffset: interpolate(source.radialOffset, target.radialOffset),
    verticalOffset: interpolate(source.verticalOffset, target.verticalOffset),
    zoom: interpolate(source.zoom, target.zoom),
  };
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
  authorityKey,
  camera,
  depthSlot,
  getLayout,
  homeCamera,
  maximumRadialOffset,
  minimumZoom: suppliedMinimumZoom,
  nodeSize,
  onCameraChange,
  viewportSize,
}: ConeProjectionViewportOptions): ConeProjectionViewport {
  const [isDragging, setIsDragging] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const cameraRef = useRef(camera);
  const drag = useRef<DragSession | null>(null);
  const motion = useRef<MotionState>({
    frameId: null,
    lastFrameAt: null,
    resolveTarget: null,
    source: null,
    stageCamera: null,
  });
  const suppressClick = useRef(false);
  const wheel = useRef<WheelSession | null>(null);
  const previousAuthorityKey = useRef(authorityKey);

  useLayoutEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useLayoutEffect(() => () => {
    const timerId = wheel.current?.timerId;
    if (timerId !== null && timerId !== undefined) window.clearTimeout(timerId);
    if (motion.current.frameId !== null) window.cancelAnimationFrame(motion.current.frameId);
  }, []);

  useLayoutEffect(() => {
    if (previousAuthorityKey.current === authorityKey) return;
    previousAuthorityKey.current = authorityKey;
    const timerId = wheel.current?.timerId;
    if (timerId !== null && timerId !== undefined) window.clearTimeout(timerId);
    if (motion.current.frameId !== null) window.cancelAnimationFrame(motion.current.frameId);
    wheel.current = null;
    drag.current = null;
    motion.current = {
      frameId: null,
      lastFrameAt: null,
      resolveTarget: null,
      source: null,
      stageCamera: null,
    };
    cameraRef.current = camera;
    setIsDragging(false);
    setIsMoving(false);
  }, [authorityKey, camera]);

  const minimumZoom = clamp(suppliedMinimumZoom, MIN_ZOOM, MAX_ZOOM);

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
    // The screen-space speed bound applies to painted frames. Do not let
    // concurrent React scheduling merge two calculated animation frames into
    // one larger visual step.
    flushSync(() => onCameraChange(next));
  }, [clampCamera, onCameraChange]);

  const screenPositions = useCallback((candidate: ConeCameraState) => {
    const canonical = clampCamera(candidate);
    const viewport = coneViewportForCamera(canonical, viewportSize, nodeSize, depthSlot);
    return new Map([...getLayout(canonical).positions].map(([id, position]) => [id, {
      x: viewport.x + position.x * canonical.zoom,
      y: viewport.y + position.y * canonical.zoom,
      zoom: canonical.zoom,
    }]));
  }, [clampCamera, depthSlot, getLayout, nodeSize, viewportSize]);

  const distanceFrom = useCallback((
    sourcePositions: ReadonlyMap<NodeId, { readonly x: number; readonly y: number; readonly zoom: number }>,
    targetCamera: ConeCameraState,
  ) => {
    const targetPositions = screenPositions(targetCamera);
    let maximumDistance = 0;
    for (const [id, source] of sourcePositions) {
      const target = targetPositions.get(id);
      if (!target) continue;
      const sourceVisible = source.x + nodeSize.width * source.zoom / 2 > 0
        && source.x - nodeSize.width * source.zoom / 2 < viewportSize.width
        && source.y + nodeSize.height * source.zoom / 2 > 0
        && source.y - nodeSize.height * source.zoom / 2 < viewportSize.height;
      const targetVisible = target.x + nodeSize.width * target.zoom / 2 > 0
        && target.x - nodeSize.width * target.zoom / 2 < viewportSize.width
        && target.y + nodeSize.height * target.zoom / 2 > 0
        && target.y - nodeSize.height * target.zoom / 2 < viewportSize.height;
      if (!sourceVisible && !targetVisible) continue;
      const corners: readonly (readonly [number, number])[] = [
        [-nodeSize.width / 2, -nodeSize.height / 2],
        [nodeSize.width / 2, -nodeSize.height / 2],
        [-nodeSize.width / 2, nodeSize.height / 2],
        [nodeSize.width / 2, nodeSize.height / 2],
      ];
      for (const [cornerX, cornerY] of corners) {
        maximumDistance = Math.max(maximumDistance, Math.hypot(
          target.x + cornerX * target.zoom - source.x - cornerX * source.zoom,
          target.y + cornerY * target.zoom - source.y - cornerY * source.zoom,
        ));
      }
    }
    return maximumDistance;
  }, [nodeSize.height, nodeSize.width, screenPositions, viewportSize.height, viewportSize.width]);

  const advanceMotion = useCallback(function advance(timestamp: number) {
    const active = motion.current;
    active.frameId = null;
    const resolvedTarget = active.resolveTarget?.();
    if (!resolvedTarget) {
      active.lastFrameAt = null;
      active.source = null;
      active.stageCamera = null;
      setIsMoving(false);
      return;
    }

    const current = clampCamera(cameraRef.current);
    const target = clampCamera(resolvedTarget);
    const sourcePositions = screenPositions(current);
    const distanceTo = (candidate: ConeCameraState) => distanceFrom(sourcePositions, candidate);
    const targetDistance = distanceTo(target);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elapsed = active.lastFrameAt === null
      ? 1000 / 60
      : clamp(timestamp - active.lastFrameAt, 0, MOTION_MAX_FRAME_MS);
    active.lastFrameAt = timestamp;
    const maximumFrameDistance = MOTION_MAX_SPEED_PX_PER_MS * elapsed;
    const settled = reducedMotion || targetDistance <= MOTION_SETTLE_DISTANCE_PX;
    let next = target;

    if (!settled) {
      const filterRatio = 1 - Math.exp(-MOTION_FILTER_RATE * elapsed / 1000);
      const stage = interpolateCamera(active.stageCamera ?? current, target, filterRatio);
      active.stageCamera = stage;
      const filtered = interpolateCamera(current, stage, filterRatio);
      const filteredDistance = distanceTo(filtered);
      if (filteredDistance <= maximumFrameDistance) {
        next = filtered;
      } else {
        let safeRatio = Math.min(1, maximumFrameDistance / filteredDistance);
        let safeCandidate = current;
        for (let iteration = 0; iteration < 4; iteration += 1) {
          const candidate = interpolateCamera(current, filtered, safeRatio);
          const candidateDistance = distanceTo(candidate);
          if (candidateDistance <= maximumFrameDistance) {
            safeCandidate = candidate;
            break;
          }
          safeRatio *= Math.max(0.05, maximumFrameDistance / candidateDistance) * 0.98;
        }
        next = safeCandidate;
      }
    }

    commit(next);
    if (!settled) {
      active.frameId = window.requestAnimationFrame(advance);
      return;
    }
    active.lastFrameAt = null;
    active.resolveTarget = null;
    active.source = null;
    active.stageCamera = null;
    setIsMoving(false);
  }, [clampCamera, commit, distanceFrom, screenPositions]);

  const requestMotion = useCallback((source: MotionSource, resolveTarget: () => ConeCameraState | null) => {
    const active = motion.current;
    const restarting = active.frameId === null;
    active.resolveTarget = resolveTarget;
    active.source = source;
    if (restarting) {
      active.lastFrameAt = null;
      active.stageCamera = cameraRef.current;
      setIsMoving(true);
      active.frameId = window.requestAnimationFrame(advanceMotion);
    }
  }, [advanceMotion]);

  const freezeMotion = useCallback(() => {
    const active = motion.current;
    if (active.frameId !== null) window.cancelAnimationFrame(active.frameId);
    active.frameId = null;
    active.lastFrameAt = null;
    active.resolveTarget = null;
    active.source = null;
    active.stageCamera = null;
    setIsMoving(false);
  }, []);

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
    freezeMotion();
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
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
      sourceLayout: source.positions,
      startCamera: current,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    event.currentTarget.dataset.dragSession = "true";
  }, [clearWheelSession, depthSlot, freezeMotion, getLayout, nodeSize, viewportSize]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - active.startClientX;
    const deltaY = event.clientY - active.startClientY;
    if (!active.moved) {
      if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
      active.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragPreview = "true";
      setIsDragging(true);
    }
    if (event.clientX === active.lastClientX && event.clientY === active.lastClientY) return;
    active.lastClientX = event.clientX;
    active.lastClientY = event.clientY;
    requestMotion("drag", () => {
      const latest = drag.current;
      if (!latest || latest.pointerId !== event.pointerId) return null;
      const horizontalShift = latest.lastClientX - latest.startClientX;
      const verticalShift = latest.lastClientY - latest.startClientY;
      return layoutAnchoredCamera(
        {
          ...latest.startCamera,
          radialOffset: latest.startCamera.radialOffset - horizontalShift / latest.startCamera.zoom,
          verticalOffset: latest.startCamera.verticalOffset + verticalShift / latest.startCamera.zoom,
        },
        latest.sourceLayout,
        latest.anchorWorld,
        latest.excludedAnchorIds,
        latest.anchorNodeId,
        verticalShift / latest.startCamera.zoom,
        latest.startCamera.verticalOffset,
      );
    });
  }, [layoutAnchoredCamera, requestMotion]);

  const stopDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = Boolean(drag.current.moved);
    if (drag.current.moved) freezeMotion();
    drag.current = null;
    setIsDragging(false);
    delete event.currentTarget.dataset.dragSession;
    delete event.currentTarget.dataset.dragPreview;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [freezeMotion]);

  const onWheel = useCallback((event: globalThis.WheelEvent) => {
    if (event.deltaY === 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement | null;
    if (!element) return;
    let active = wheel.current;
    if (!active) {
      freezeMotion();
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
    requestMotion("wheel", () => {
      const boundedOffset = clamp(desiredOffset, 0, maximumRadialOffset);
      if (nextZoom <= minimumZoom + 0.0001 && boundedOffset <= 0.001) return homeCamera;
      return layoutAnchoredCamera(
        {
          ...session.startCamera,
          radialOffset: boundedOffset,
          verticalOffset: session.startCamera.verticalOffset + desiredWorldShift,
          zoom: nextZoom,
        },
        session.sourceLayout,
        session.anchorWorld,
        session.excludedAnchorIds,
        session.anchorNodeId,
        desiredWorldShift,
        session.startCamera.verticalOffset,
      );
    });
  }, [depthSlot, freezeMotion, getLayout, homeCamera, layoutAnchoredCamera, maximumRadialOffset, minimumZoom, nodeSize, requestMotion, viewportSize]);

  const reset = useCallback(() => {
    clearWheelSession();
    freezeMotion();
    requestMotion("focus", () => homeCamera);
  }, [clearWheelSession, freezeMotion, homeCamera, requestMotion]);

  const zoomBy = useCallback((factor: number) => {
    clearWheelSession();
    freezeMotion();
    const current = cameraRef.current;
    requestMotion("focus", () => clampCamera({ ...current, zoom: current.zoom * factor }));
  }, [clampCamera, clearWheelSession, freezeMotion, requestMotion]);

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
    isMoving,
    onWheel,
    reset,
    shouldSuppressClick,
    viewport: coneViewportForCamera(camera, viewportSize, nodeSize, depthSlot),
    zoomBy,
  };
}
