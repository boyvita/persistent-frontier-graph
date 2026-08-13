import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { ViewportState } from "../core/types.js";

interface DragState {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startX: number;
  readonly startY: number;
}

export interface PannableViewport {
  readonly handlers: {
    readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    readonly onWheel: (event: WheelEvent<HTMLElement>) => void;
  };
  readonly isDragging: boolean;
  readonly reset: () => void;
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
  const viewportRef = useRef(viewport);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const commit = useCallback((next: ViewportState) => {
    viewportRef.current = next;
    onViewportChange(next);
  }, [onViewportChange]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-pfg-interactive]")) return;
    drag.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: viewportRef.current.x,
      startY: viewportRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    commit({
      ...viewportRef.current,
      x: active.startX + event.clientX - active.startClientX,
      y: active.startY + event.clientY - active.startClientY,
    });
  }, [commit]);

  const stopDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const onWheel = useCallback((event: WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const current = viewportRef.current;
    const nextZoom = Math.min(2.8, Math.max(0.08, current.zoom * Math.exp(-event.deltaY * 0.0015)));
    const ratio = nextZoom / current.zoom;
    commit({
      x: cursorX - (cursorX - current.x) * ratio,
      y: cursorY - (cursorY - current.y) * ratio,
      zoom: nextZoom,
    });
  }, [commit]);

  const zoomBy = useCallback((factor: number) => {
    const current = viewportRef.current;
    commit({ ...current, zoom: Math.min(2.8, Math.max(0.08, current.zoom * factor)) });
  }, [commit]);

  const reset = useCallback(() => commit(homeViewport), [commit, homeViewport]);
  return {
    handlers: {
      onPointerCancel: stopDrag,
      onPointerDown,
      onPointerMove,
      onPointerUp: stopDrag,
      onWheel,
    },
    isDragging,
    reset,
    viewport,
    zoomBy,
  };
}
