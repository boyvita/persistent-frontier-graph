# Customization and reuse

Persistent Frontier Graph separates geometry from visual language. Start with
the highest-level hook that solves the real need; avoid forking layout code for
presentation changes.

## Custom node contents

`renderNode` runs for both projections and can branch on `view`.

```tsx
import type { NodeRendererContext } from "persistent-frontier-graph";

interface Topic {
  title: string;
  status: "open" | "done";
}

function TopicNode(context: NodeRendererContext<Topic>) {
  if (context.view === "radial") {
    return <span>{context.data.title}</span>;
  }

  return (
    <span className="topic-node" onClick={(event) => context.select(event)}>
      <small>{context.isFrontier ? "FRONTIER" : `LEVEL ${context.depth}`}</small>
      <strong>{context.data.title}</strong>
      <em>{context.data.status}</em>
    </span>
  );
}
```

Pass the click event to `context.select` from custom clickable descendants. It
stops propagation, so the callback is delivered once instead of once from the
renderer and again from the surrounding shell. Non-interactive descendants can
omit a handler and use the shell's default selection.

The renderer is visual content inside a scaled canvas. Keep operations in the
action bar and supply an explicit label:

```tsx
<PersistentFrontierGraph
  tree={tree}
  frontier={frontier}
  renderNode={TopicNode}
  getNodeLabel={(node) => `${node.data.title}, ${node.data.status}`}
/>
```

If custom cone cards change geometry, pass matching `cone.nodeSize` and override
the `.pfg-node--cone` size. A mismatch produces visually attached edges but
incorrect spacing.

## Edge appearance

```tsx
const renderEdge: EdgeRenderer<Topic> = ({ target }) => ({
  className: target.data.status === "done" ? "edge edge--done" : "edge",
  style: { strokeWidth: target.data.status === "done" ? 2.5 : 1.5 },
});
```

Color must not be the only carrier of meaning. Pair it with width, dash,
annotation, or node text.

## Read-only overlays

Overlays receive the exact projection used by a view.

```tsx
const selectedGuide: GraphOverlay<Topic> = {
  id: "selected-guide",
  views: ["cone"],
  render: ({ projection, selectedId }) => {
    const selected = projection.nodes.find((item) => item.node.id === selectedId);
    if (!selected) return null;
    return (
      <span
        className="selected-guide"
        style={{ transform: `translate(${selected.position.x}px, ${selected.position.y}px)` }}
      />
    );
  },
};
```

The built-in overlay container ignores pointer events. This keeps pan and node
selection predictable. Compose application controls outside the canvas.

## Extra actions

```tsx
const actions: NodeAction<Topic>[] = [
  { id: "copy-link", label: "Copy link" },
  {
    id: "open-details",
    label: "Open details",
    isAvailable: (node) => node.data.status === "open",
  },
];

<PersistentFrontierGraph
  tree={tree}
  frontier={frontier}
  actions={actions}
  onAction={({ action, node, treeRevision }) => {
    dispatch({ type: action.id, nodeId: node.id, expectedRevision: treeRevision });
  }}
/>
```

Revision binding lets an application reject an action emitted for a tree that
has since been regenerated or replaced.

The revision is an opaque token, not a hash computed by the library. Generated
trees use a deterministic structural revision. Replace it with your document
revision when actions must also reject stale application data.

## Application-owned trees

Convert domain data once and preserve IDs:

```ts
const tree: FrontierTree<Topic> = {
  revision: documentRevision,
  rootId: root.id,
  nodes: records.map((record) => ({
    id: record.id,
    parentId: record.parentId,
    order: record.position,
    data: { title: record.title, status: record.status },
  })),
};
```

Validate untrusted or externally loaded data before presenting it. Replace the
whole immutable tree when structure changes; do not mutate `nodes` in place.

## Headless composition

Use `createFrontierGraphModel` when the bundled React presentation is not the
right surface. The resulting cone and radial projections already share a
snapshot and are safe to render with SVG, Canvas, WebGL, PDF, or server-side
export code.

If you call `layoutCone` and `layoutRadial` separately, create one
`deriveFrontierSnapshot` and pass it to both. Two independently rounded frontier
values can create a split-brain visualization.

For a custom presentation that keeps the camera viewfinder, call
`deriveProjectionViewportWindow` with the cone camera and then
`deriveRadialProjectionSector` with the resulting window and radial layout.
Treat the returned ID set as authoritative; the angle/radius envelope is its
visual boundary.

## Extension boundary

Custom renderers and callbacks execute with the consumer application's own
authority. They are not sandboxed. The library never sends telemetry, performs
network requests, stores data, retries actions, or changes the tree on their
behalf.
