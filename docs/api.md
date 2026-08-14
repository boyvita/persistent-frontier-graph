# API reference

The package is ESM-only. Import React presentation from the root and its
stylesheet from the explicit CSS export.

```ts
import { PersistentFrontierGraph } from "persistent-frontier-graph";
import "persistent-frontier-graph/styles.css";
```

## Data model

### `FrontierNode<TData>`

```ts
interface FrontierNode<TData = unknown> {
  readonly id: string;
  readonly parentId: string | null;
  readonly order?: number;
  readonly data: TData;
}
```

### `FrontierTree<TData>`

```ts
interface FrontierTree<TData = unknown> {
  readonly nodes: readonly FrontierNode<TData>[];
  readonly revision: string;
  readonly rootId: string;
}
```

`revision` is a non-empty, producer-owned concurrency token used by actions and
cache keys. The library does not generate revisions for application-supplied
trees. A generated revision covers the generator options, seed, and topology;
custom `createData` output is deliberately outside that structural token. If an
action depends on data freshness, replace the returned revision with the
application's document revision before rendering.

### `validateTree(tree)`

Returns `readonly TreeValidationIssue[]`. An empty array means the structure is
valid. Codes cover an empty revision, non-finite sibling order, duplicate IDs,
missing/multiple roots, unknown/self parents, cycles, and disconnected nodes.

### `indexTree(tree)`

Returns `TreeIndex<TData>` with read-only maps for nodes, children, parents,
depth, maximum depth, and stable breadth-first IDs. Throws `InvalidTreeError`
when validation fails.

### `ancestorAtDepth` and `subtreeSizes`

Headless helpers for extension and analysis code. Both consume a validated
`TreeIndex`.

## Generation

### `generateTree(options, createData?)`

Returns a discriminated `GenerationResult<TData>`.

```ts
const result = generateTree(
  {
    nodeCount: 100,
    maxBranches: 5,
    maxDepth: 8,
    breadthDepthBias: 0.5,
    uniform: false,
    seed: "reproducible-seed",
  },
  ({ id, parentId, depth, ordinal, seed }) => ({
    id,
    parentId,
    depth,
    ordinal,
    sourceSeed: seed,
  }),
);
```

When no factory is supplied, data is `GeneratedNodeData` with `label` and
`ordinal`. See the [generator rules](specification.md#3-generator).

### `treeCapacity(maxBranches, maxDepth, ceiling?)`

Returns the representable node count, capped at `ceiling` (1,000 by default).
Invalid branch/depth input returns zero.

## Frontier and layouts

### `deriveFrontierSnapshot(index, frontier)`

Clamps a coordinate frontier and derives lower/upper levels, coordinate
ancestors, all topology IDs, and current coordinate-boundary IDs. Reveal is
`1` for every node because a frontier collapses positions rather than removing
topology.

### `deriveAutomaticFrontier(radialOffset, radialSpan, maximumDepth, nodeWidth, depthSlot)`

Converts the cone camera's visible radial interval into the adaptive fractional
frontier used by the React presentation. `adaptiveFrontier` exposes the
half-band hold/interpolation rule for custom camera implementations.

### `layoutCone(tree, index, snapshot, options?)`

Returns nodes, edges, visible IDs, and bounds. Options:

```ts
interface ConeLayoutOptions {
  columnGap?: number;
  hierarchyGap?: number;
  localGap?: number;
  maximumHierarchyGap?: number;
  nodeSize?: { width: number; height: number };
}
```

If the displayed node geometry differs from the defaults, pass matching
`nodeSize`; presentation size and layout size are one contract.
`CreateFrontierGraphModelOptions.coneProjection` optionally supplies the
current vertical center and span for contextual parent clamping.

### `layoutRadial(tree, index, snapshot, options?)`

Returns nodes, edges, angles, radii, maximum radius, and visible IDs. Options:

```ts
interface RadialLayoutOptions {
  minimumRingGap?: number;
  nodePitch?: number;
  seamPadding?: number;
}
```

### `createFrontierGraphModel(tree, frontier?, options?)`

Convenience function that validates/indexes once, creates one snapshot, and
derives both layouts from it. Omitting `frontier` uses the maximum tree depth;
headless camera integrations should call `deriveAutomaticFrontier` explicitly.

### `deriveProjectionViewportWindow(projection, viewport, viewportSize, nodeSize)`

Returns world bounds plus the exact set of node rectangles that intersect a
cone camera. Use the same `nodeSize` contract as cone layout.

### `deriveRadialProjectionSector(window, radial)`

Returns `null` for an empty window. Otherwise returns the polar envelope and
the same authoritative ID set for a radial viewfinder.

### `useFrontierGraph(tree, frontier?, options?)`

Memoized React hook around `createFrontierGraphModel`. Keep `tree` and layout
options immutable so memoization remains meaningful.

## React component

### `PersistentFrontierGraph<TData>`

Required props:

| Prop | Meaning |
|---|---|
| `tree` | Immutable validated tree candidate |

Optional props:

| Prop | Meaning |
|---|---|
| `frontier` | Optional fixed diagnostic override; omit for the automatic camera frontier |
| `selectedId` | Controlled selected node; omit for local selection |
| `onSelectedIdChange` | Selection callback from either view or navigator |
| `getNodeLabel` | Accessible/application label for custom data |
| `renderNode` | Visual node body for both views |
| `renderEdge` | Class/style resolver for edges |
| `overlays` | Read-only visual overlay descriptors |
| `actions` | Extra actions available for the selected node |
| `onAction` | Receives action, node, and exact producer revision token |
| `showFooter` | Shows the selected-node summary, navigator, and actions; defaults to `true` |
| `layoutOptions` | Cone/radial headless layout configuration |
| `onError` | Structured invalid-tree notification |
| `onProjectionViewportChange` | Notification with the exact cone camera window after its synchronized composite commit |
| `className` | Consumer class on the composite root |

The cone supports background and direct-card dragging plus fixed-anchor wheel
sessions. It captures wheel input so navigating either canvas does not scroll
the document. Cone camera targets use a retargetable, screen-space-bounded rAF
loop; drag release retains the last painted frame. The built-in radial sector
marks exactly the latest cone camera window while all radial nodes and edges
remain visible. Cone movement fits and centers the complete sector. Direct
radial pan, zoom, Fit, or point focus overrides following until the next cone
camera change. The visual node
body is not the accessibility name. Supply `getNodeLabel` for
non-standard data. By default, the component's native node navigator mirrors
the current complete topology for keyboard and assistive-technology access.
Set `showFooter={false}` for a compact visual-only embedding; this also hides
the selected-node summary and action bar.

The bundled cone opens at `max(responsiveFit, 0.30)` and keeps Fit as a
separate complete-overview command. Default cone geometry is a `210 × 58`
card with a `48` pixel column gap; override `layoutOptions.cone` together with
matching consumer CSS when a custom renderer uses different dimensions.

Selecting a radial point centers its canonical position and frames roughly
three adjacent depth bands. Radial wheel and drag updates are coalesced to one
camera commit per animation frame. The radial follow camera may zoom out to
`0.02` so the complete sector remains framed in a narrow canvas.

## Extension contracts

### `NodeRendererContext<TData>`

Contains `node`, `data`, `view`, `depth`, `reveal`, `isFrontier`, `isSelected`,
and `select`. It renders visual content; put durable operations in `actions` so
they remain accessible outside a scaled canvas.

`isFrontier` identifies the current coordinate boundary; it is not a visibility
flag. `reveal` is `1` for every mounted topology node in the current contract.

The default node shell selects on click. When a custom renderer adds its own
click handler, pass the click event to `select`; it stops propagation before
emitting the selection, preventing the surrounding shell from emitting it a
second time. Ordinary non-interactive descendants continue to select through
the shell.

### `EdgeRenderer<TData>`

Receives the projected edge, source and target nodes, and view. Return an
optional `{ className, style }` appearance.

### `GraphOverlay<TData>`

Has a stable `id`, a `render(context)` function, and optional `views`. The
context exposes the read-only projection, selection, view, and a narrow select
callback. Overlay DOM is placed at the scene origin and does not receive pointer
events by default.

### `NodeAction<TData>`

Has `id`, `label`, and optional `isAvailable(node)`. The action callback receives
the descriptor, current node, and tree revision. The library assigns no edit or
persistence semantics.

## Package contract

- ESM: `dist-lib/index.js`
- declarations: `dist-lib/index.d.ts`
- styles: `persistent-frontier-graph/styles.css`
- peer dependencies: React and React DOM `>=18.3 <20`
- registry publication: disabled
- supported development runtime: Node.js 24
