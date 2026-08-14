import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { ViewportState } from "../core/types.js";

interface DragState {
  moved: boolean;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startX: number;
  readonly startY: number;
}

interface WheelSession {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly start: ViewportState;
  timerId: number | null;
  totalDelta: number;
}

const DRAG_THRESHOLD = 3;
const WHEEL_SESSION_IDLE_MS = 120;

export interface PannableViewport {
  readonly handlers: {
    readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  };
  readonly onWheel: (event: globalThis.WheelEvent) => void;
  readonly isDragging: boolean;
  readonly reset: () => void;
  readonly shouldSuppressClick: () => boolean;
  readonly viewport: ViewportState;
  readonly zoomBy: (factor: number) => void;
}

export function usePannableViewport(
  viewport: ViewportState,
  homeViewport: ViewportState,
  onViewportChange: (viewport: ViewportState) => void,
): PannableViewport {
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const viewportRef = useRef(viewport);
  const wheelSession = useRef<WheelSession | null>(null);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useLayoutEffect(() => () => {
    const timerId = wheelSession.current?.timerId;
    if (timerId !== null && timerId !== undefined) window.clearTimeout(timerId);
  }, []);

  const commit = useCallback((next: ViewportState) => {
    viewportRef.current = next;
    onViewportChange(next);
  }, [onViewportChange]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,textarea,select,[data-pfg-interactive]")) return;
    drag.current = {
      moved: false,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: viewportRef.current.x,
      startY: viewportRef.current.y,
    };
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - active.startClientX;
    const deltaY = event.clientY - active.startClientY;
    if (!active.moved) {
      if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
      active.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }
    commit({
      ...viewportRef.current,
      x: active.startX + deltaX,
      y: active.startY + deltaY,
    });
  }, [commit]);

  const stopDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = Boolean(drag.current?.moved);
    drag.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const onWheel = useCallback((event: globalThis.WheelEvent) => {
    event.preventDefault();
    const element = event.currentTarget as HTMLElement | null;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    let active = wheelSession.current;
    if (!active) {
      active = {
        anchorX: cursorX,
        anchorY: cursorY,
        start: viewportRef.current,
        timerId: null,
        totalDelta: 0,
      };
      wheelSession.current = active;
    }
    active.totalDelta += event.deltaY;
    if (active.timerId !== null) window.clearTimeout(active.timerId);
    active.timerId = window.setTimeout(() => {
      if (wheelSession.current === active) wheelSession.current = null;
    }, WHEEL_SESSION_IDLE_MS);
    const nextZoom = Math.min(2.8, Math.max(0.08, active.start.zoom * Math.exp(-active.totalDelta * 0.0015)));
    const ratio = nextZoom / active.start.zoom;
    commit({
      x: active.anchorX - (active.anchorX - active.start.x) * ratio,
      y: active.anchorY - (active.anchorY - active.start.y) * ratio,
      zoom: nextZoom,
    });
  }, [commit]);

  const zoomBy = useCallback((factor: number) => {
    const current = viewportRef.current;
    commit({ ...current, zoom: Math.min(2.8, Math.max(0.08, current.zoom * factor)) });
  }, [commit]);

  const reset = useCallback(() => commit(homeViewport), [commit, homeViewport]);
  const shouldSuppressClick = useCallback(() => {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  }, []);
  return {
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
    viewport,
    zoomBy,
  };
}
