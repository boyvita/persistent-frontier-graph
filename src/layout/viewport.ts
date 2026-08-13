import type {
  FrontierProjection,
  NodeId,
  ProjectionViewportWindow,
  RadialProjectionSector,
  Size,
  ViewportState,
} from "../core/types.js";
import { isRevealed } from "../frontier/visibility.js";
import type { RadialLayoutResult } from "./radial.js";

export function deriveProjectionViewportWindow<TData>(
  projection: FrontierProjection<TData>,
  viewport: ViewportState,
  viewportSize: Size,
  nodeSize: Size,
): ProjectionViewportWindow {
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
  const worldBounds = {
    bottom: (viewportSize.height - viewport.y) / zoom,
    left: -viewport.x / zoom,
    right: (viewportSize.width - viewport.x) / zoom,
    top: -viewport.y / zoom,
  };
  const visibleNodeIds = new Set<NodeId>();
  let minimumDepth = Number.POSITIVE_INFINITY;
  let maximumDepth = Number.NEGATIVE_INFINITY;

  for (const item of projection.nodes) {
    if (!isRevealed(item.reveal)) continue;
    const halfWidth = nodeSize.width / 2;
    const halfHeight = nodeSize.height / 2;
    const intersects = item.position.x + halfWidth >= worldBounds.left
      && item.position.x - halfWidth <= worldBounds.right
      && item.position.y + halfHeight >= worldBounds.top
      && item.position.y - halfHeight <= worldBounds.bottom;
    if (!intersects) continue;
    visibleNodeIds.add(item.node.id);
    minimumDepth = Math.min(minimumDepth, item.depth);
    maximumDepth = Math.max(maximumDepth, item.depth);
  }

  return {
    maximumDepth: Number.isFinite(maximumDepth) ? maximumDepth : 0,
    minimumDepth: Number.isFinite(minimumDepth) ? minimumDepth : 0,
    visibleNodeIds,
    worldBounds,
  };
}

function innerBandRadius(radii: readonly number[], depth: number): number {
  if (depth <= 0) return 0;
  const radius = radii[depth] ?? 0;
  const previous = radii[depth - 1] ?? 0;
  return (previous + radius) / 2;
}

function outerBandRadius(radii: readonly number[], depth: number): number {
  const radius = radii[depth] ?? 0;
  const next = radii[depth + 1];
  if (next !== undefined) return (radius + next) / 2;
  const previous = radii[depth - 1] ?? 0;
  return radius + Math.max(36, (radius - previous) / 2);
}

export function deriveRadialProjectionSector<TData>(
  window: ProjectionViewportWindow,
  radial: RadialLayoutResult<TData>,
): RadialProjectionSector | null {
  const visibleItems = radial.nodes.filter((item) => window.visibleNodeIds.has(item.node.id));
  if (visibleItems.length === 0) return null;

  const minimumDepth = Math.min(...visibleItems.map((item) => item.depth));
  const maximumDepth = Math.max(...visibleItems.map((item) => item.depth));
  const comparableItems = radial.nodes.filter((item) => (
    isRevealed(item.reveal)
    && item.depth >= minimumDepth
    && item.depth <= maximumDepth
  ));
  const fullCircle = comparableItems.every((item) => window.visibleNodeIds.has(item.node.id));
  const angles = visibleItems
    .map((item) => radial.anglesById.get(item.node.id))
    .filter((angle): angle is number => angle !== undefined)
    .sort((left, right) => left - right);
  const uniqueVisibleAngles = [...new Set(angles)];
  const allAngles = [...new Set(comparableItems
    .map((item) => radial.anglesById.get(item.node.id))
    .filter((angle): angle is number => angle !== undefined))]
    .sort((left, right) => left - right);
  const lower = uniqueVisibleAngles[0] ?? -Math.PI;
  const upper = uniqueVisibleAngles.at(-1) ?? Math.PI;
  const lowerIndex = allAngles.findIndex((angle) => angle >= lower - 1e-9);
  let upperIndex = -1;
  for (let index = allAngles.length - 1; index >= 0; index -= 1) {
    if ((allAngles[index] ?? Math.PI) <= upper + 1e-9) {
      upperIndex = index;
      break;
    }
  }
  const lowerNeighbor = lowerIndex > 0 ? allAngles[lowerIndex - 1] : undefined;
  const upperNeighbor = upperIndex >= 0 && upperIndex < allAngles.length - 1 ? allAngles[upperIndex + 1] : undefined;
  const defaultPadding = 0.08;
  const lowerPadding = lowerNeighbor === undefined ? defaultPadding : Math.max(0.02, (lower - lowerNeighbor) / 2);
  const upperPadding = upperNeighbor === undefined ? defaultPadding : Math.max(0.02, (upperNeighbor - upper) / 2);

  return {
    fullCircle,
    innerRadius: innerBandRadius(radial.radiiByDepth, minimumDepth),
    lowerAngle: fullCircle ? -Math.PI : Math.max(-Math.PI, lower - lowerPadding),
    outerRadius: outerBandRadius(radial.radiiByDepth, maximumDepth),
    upperAngle: fullCircle ? Math.PI : Math.min(Math.PI, upper + upperPadding),
    visibleNodeIds: window.visibleNodeIds,
  };
}
