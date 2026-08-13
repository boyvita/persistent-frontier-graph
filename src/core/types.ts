import type { CSSProperties, ReactNode } from "react";

export type NodeId = string;
export type FrontierView = "cone" | "radial";

export interface FrontierNode<TData = unknown> {
  readonly id: NodeId;
  readonly parentId: NodeId | null;
  readonly order?: number;
  readonly data: TData;
}

export interface FrontierTree<TData = unknown> {
  readonly nodes: readonly FrontierNode<TData>[];
  readonly revision: string;
  readonly rootId: NodeId;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly height: number;
  readonly width: number;
}

export interface TreeIndex<TData = unknown> {
  readonly byId: ReadonlyMap<NodeId, FrontierNode<TData>>;
  readonly childrenById: ReadonlyMap<NodeId, readonly FrontierNode<TData>[]>;
  readonly depthById: ReadonlyMap<NodeId, number>;
  readonly maximumDepth: number;
  readonly orderedIds: readonly NodeId[];
  readonly parentById: ReadonlyMap<NodeId, NodeId | null>;
}

export interface ProjectedNode<TData = unknown> {
  readonly node: FrontierNode<TData>;
  readonly depth: number;
  readonly position: Point;
  readonly canonicalPosition: Point;
  readonly reveal: number;
  readonly frontierAncestorId: NodeId;
  readonly isFrontier: boolean;
}

export interface ProjectedEdge {
  readonly id: string;
  readonly sourceId: NodeId;
  readonly targetId: NodeId;
  readonly source: Point;
  readonly target: Point;
  readonly reveal: number;
}

export interface FrontierProjection<TData = unknown> {
  readonly frontier: number;
  readonly maximumDepth: number;
  readonly nodes: readonly ProjectedNode<TData>[];
  readonly edges: readonly ProjectedEdge[];
  readonly visibleNodeIds: ReadonlySet<NodeId>;
}

export interface NodeRendererContext<TData = unknown> {
  readonly data: TData;
  readonly depth: number;
  readonly isFrontier: boolean;
  readonly isSelected: boolean;
  readonly node: FrontierNode<TData>;
  readonly reveal: number;
  readonly select: (event?: { readonly stopPropagation: () => void }) => void;
  readonly view: FrontierView;
}

export type NodeRenderer<TData = unknown> = (context: NodeRendererContext<TData>) => ReactNode;

export type NodeLabelGetter<TData = unknown> = (node: FrontierNode<TData>) => string;

export interface EdgeRendererContext<TData = unknown> {
  readonly edge: ProjectedEdge;
  readonly source: FrontierNode<TData>;
  readonly target: FrontierNode<TData>;
  readonly view: FrontierView;
}

export interface EdgeAppearance {
  readonly className?: string;
  readonly style?: CSSProperties;
}

export type EdgeRenderer<TData = unknown> = (context: EdgeRendererContext<TData>) => EdgeAppearance | undefined;

export interface OverlayContext<TData = unknown> {
  readonly projection: FrontierProjection<TData>;
  readonly selectNode: (nodeId: NodeId) => void;
  readonly selectedId: NodeId | null;
  readonly view: FrontierView;
}

export type OverlayRenderer<TData = unknown> = (context: OverlayContext<TData>) => ReactNode;

export interface NodeAction<TData = unknown> {
  readonly id: string;
  readonly label: string;
  readonly isAvailable?: (node: FrontierNode<TData>) => boolean;
}

export interface NodeActionEvent<TData = unknown> {
  readonly action: NodeAction<TData>;
  readonly node: FrontierNode<TData>;
  readonly treeRevision: string;
}

export interface GraphOverlay<TData = unknown> {
  readonly id: string;
  readonly render: OverlayRenderer<TData>;
  readonly views?: readonly FrontierView[];
}

export interface ViewportState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface ProjectionViewportWindow {
  readonly maximumDepth: number;
  readonly minimumDepth: number;
  readonly visibleNodeIds: ReadonlySet<NodeId>;
  readonly worldBounds: {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  };
}

export interface RadialProjectionSector {
  readonly fullCircle: boolean;
  readonly innerRadius: number;
  readonly lowerAngle: number;
  readonly outerRadius: number;
  readonly upperAngle: number;
  readonly visibleNodeIds: ReadonlySet<NodeId>;
}

export interface FrontierGraphError {
  readonly code: "invalid_tree" | "renderer_error";
  readonly message: string;
  readonly cause?: unknown;
}
