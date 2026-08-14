# Persistent Frontier Graph specification

This document defines the observable version `0.1` contract. Normative terms
**MUST**, **SHOULD**, and **MAY** have their usual standards meaning.

## 1. Purpose and scope

The library presents one immutable rooted tree through two synchronized views:

1. a cone projection with hierarchy depth on the horizontal axis;
2. a radial projection with hierarchy depth on concentric rings.

The cone camera automatically derives a fractional coordinate frontier for
both views. The library provides generation, validation, headless layout,
React presentation, and extension contracts.

The following are explicit non-goals:

- adding, deleting, renaming, or persisting application nodes;
- changing node colors through built-in controls;
- force-directed or cyclic general-graph layout;
- application permissions, collaboration, or backend storage;
- npm registry publication.

## 2. Tree contract

`FrontierTree<TData>` MUST contain:

- a non-empty `revision` chosen by its producer;
- exactly one `rootId`;
- nodes with unique string IDs, one `parentId`, optional finite numeric `order`,
  and consumer-owned `data`.

The root MUST exist and have `parentId: null`. Every other node MUST reference
an existing parent. The structure MUST be acyclic and every node MUST be
reachable from the root.
Siblings with explicit `order` are sorted numerically, before unordered
siblings; ties and unordered siblings use stable natural ID order.

`validateTree` reports all discoverable structural issues before layout.
`indexTree` throws `InvalidTreeError` for invalid input. A React component MUST
render an accessible error instead of a partial graph and MUST invoke `onError`
when supplied.

Inputs are treated as immutable. Mutating an object under an unchanged
reference is unsupported.

## 3. Generator

### 3.1 Inputs

`generateTree` accepts six options:

| Field | Valid values |
|---|---|
| `nodeCount` | integer `1…1000` |
| `maxBranches` | integer `1…64` |
| `maxDepth` | integer `0…64` |
| `breadthDepthBias` | finite number `0…1` |
| `uniform` | boolean |
| `seed` | string or number |

The capacity before the 1,000-node product ceiling is
`Σ(maxBranches^depth)` for `depth = 0…maxDepth`. If `nodeCount` exceeds this
capacity, generation MUST return `capacity_exceeded`. It MUST NOT lower the
requested count or violate a structural limit.

### 3.2 Direction

At every insertion, a stable sample derived from the seed selects shallow or
deep preference:

- bias `0` always prefers the shallowest eligible parents and therefore width;
- bias `1` always prefers the deepest eligible parents and therefore length;
- intermediate values select deep preference with that probability.

### 3.3 Uniform mode

When `uniform` is true, the generator MUST deterministically:

1. prefer the least populated root-level subtree;
2. apply the direction preference to tied candidates;
3. prefer the candidate with fewer direct children;
4. use a stable seeded tie-break.

This balances root subtrees while allowing the bias to choose whether each
subtree expands by width or length.

### 3.4 Random mode

When `uniform` is false, the generator MUST choose an eligible parent through a
seeded weighted random distribution. The weight combines requested direction,
candidate depth, and remaining child slots. The output MUST still obey exact
count, branching, and depth limits.

The same options and seed MUST produce equal IDs, parents, data-factory
contexts, and revision. A new seed MAY produce a different valid tree.
The generated revision is a deterministic structural token; custom data-factory
output is not hashed. A consumer that binds actions to data freshness MUST
replace it with the owning document revision.

### 3.5 Regeneration

Regeneration is an application transaction. The demo creates a fresh seed,
builds a complete candidate, and replaces the current tree only after success.
On failure, the previous valid graph remains visible and the error is announced.
Selection and both cameras reset with a successful new tree.

### 3.6 Demo controls

The presentation demo MUST title the control surface “Generation graph
parameters”. It MUST expose `maxBranches`, `maxDepth`, and `nodeCount` as
integer range controls. The live `nodeCount` maximum is the smaller of `1,000`
and the current shape capacity; changing branch or depth limits immediately
clamps the draft count to that maximum. Capacity MUST NOT be shown as a
separate readout. The balance toggle (`uniform`) and continuous
growth-direction control (`breadthDepthBias`, `0…1`) remain separate inputs on
the same control row. The demo MUST NOT expose a frontier control.

## 4. Frontier

For maximum hierarchy depth `D`, coordinate frontier `F` is clamped to `[0,D]`.
The React presentation derives it from the outer edge of the cone camera's
visible radial interval. The first half of each new depth band retains the
previous integer coordinate set. The second half interpolates from that set to
the next one. A caller MAY supply the optional `frontier` prop only as a fixed
diagnostic override; normal interaction MUST NOT require a frontier control.

Define:

- `L = floor(F)`;
- `U = ceil(F)`;
- `α = F - L`.

Every topology node and containment edge has reveal `1` and remains mounted.
The frontier changes coordinates, not topology membership. Terminal nodes
remain terminal at their actual shallow depth.

The shared snapshot MUST contain the frontier, lower and upper levels, the
nearest ancestor at depth `L`, all topology IDs, and coordinate-frontier IDs.
Both layouts MUST use the same snapshot instance for a model derivation.

## 5. Cone layout

### 5.1 Stable depth

Every node at hierarchy depth `d` MUST have horizontal center
`d × (nodeWidth + columnGap)`. Frontier changes MUST NOT change that column.

### 5.2 Complete coordinate sets

For each integer level used by a projection:

1. the boundary contains every terminal node encountered before that level and
   every node at the level;
2. boundary order follows deterministic depth-first sibling order;
3. adjacent boundary nodes receive the local gap plus a bounded increment for
   generations since their lowest common ancestor;
4. every parent center is the midpoint of the minimum and maximum child center;
5. a deeper descendant inherits the vertical center of its boundary ancestor.

This preserves contiguous subtrees and prevents sibling interleaving.

### 5.3 Fractional motion

The final cone coordinate at `F` MUST linearly interpolate the complete sets at
`L` and `U` using `α`. Independent per-node repacking is forbidden.
All topology nodes and containment edges MUST remain mounted across frontier
changes; viewport membership affects the radial viewfinder, not identity or
component keys.

## 6. Radial layout

Canonical leaf angles MUST preserve the same deterministic subtree order.
Every parent angle is the midpoint of its extreme child angles. All nodes at
one hierarchy depth share a ring.

For each depth, radius MUST be at least:

- the previous radius plus `minimumRingGap`; and
- `nodesAtDepth × nodePitch / 2π`.

At an integer frontier, descendants deeper than `L` MUST occupy their nearest
frontier ancestor's point. At a fractional frontier, nodes at `U` MUST
interpolate from that ancestor point to their canonical point using `α`.
Deeper nodes remain collapsed. This is the radial “pull” visualization.

## 7. Synchronization and state ownership

The immutable tree is the structural authority. The coordinate frontier is a
pure derivation of the cone camera unless a fixed diagnostic override is used.
Selection is controlled or locally managed by the composite React component.
View cameras are ephemeral state and MUST NOT mutate the tree. The radial
camera follows and centers the complete cone-derived sector whenever the cone
camera changes. A direct radial pan, zoom, Fit, or point-focus action
temporarily overrides that follow camera until the next cone camera change.

The cone and radial views MUST use the same coordinate frontier in one React
commit. The cone camera MUST derive the exact set of cards whose rectangles
intersect its current viewport. The radial annular sector MUST receive that set
in the same composite render; this is the projection-viewfinder contract. All
radial topology nodes and edges remain visible, while sector membership marks
exactly the cone-window IDs. The sector geometry is the polar envelope of the
exact discrete membership set. Radial node coordinates MUST continue to pull
and expand from the same automatic frontier used by the cone.

Changing selection in either visual canvas or the accessible navigator MUST
update the shared selected node. Camera movement MUST NOT substitute an
ancestor selection because the topology remains present.

## 8. Extensibility

The library MUST expose typed hooks for:

- node content;
- edge appearance;
- read-only overlays;
- node actions carrying the exact producer-owned tree revision token;
- accessible application labels;
- headless validation, generation, snapshots, layout, viewport, and sector derivation.

An extension receives read-only snapshots and narrow callbacks. It MUST NOT be
given a hidden mutable node registry. Consumer renderers are trusted
application code, not a sandbox.

## 9. Interaction and accessibility

Both views MUST provide pointer pan, cursor-anchored wheel zoom, button-based
zoom, and fit reset. The cone MUST allow a drag to begin on either its
background or a node card. A drag starts only after a three-pixel threshold,
captures its pointer, and suppresses the release click after movement.
Visual nodes MAY be densely packed below pointer target
minimums; therefore the composite component MUST also expose a native keyboard
node navigator containing the complete topology and shared selection.

While the pointer is over either projection canvas, wheel input MUST be
captured for cursor-anchored camera zoom and MUST NOT scroll the containing
document. Wheel input outside the canvases retains normal page scrolling.
One wheel gesture MUST retain its initial cursor/world anchor until 120 ms of
inactivity. Cone coordinate changes during that gesture MUST compensate around
the grabbed card when available, otherwise around a bounded field of nearby
unclamped nodes. Horizontal cone motion MUST clamp before the first column and
at the terminal extent independently of zoom.
The cone minimum zoom MUST equal its responsive fit zoom, so zooming out cannot
shrink the complete overview into unused space.
The DOM transform and node coordinates MUST represent the committed camera
state; an independent CSS position tween MUST NOT introduce hidden camera
motion or detach gesture anchoring.
Cone wheel, drag, and control targets MUST pass through one retargetable
animation frame loop. Its two-stage low-pass filter uses rate `18/s`; each frame is
limited to `0.6` screen pixels per elapsed millisecond with elapsed time capped
at `32 ms`, and settles within `0.75 px`. The bound is measured against actual
visible card corners after frontier interpolation and parent clamping, not only
against camera scalars. Reduced motion applies the target immediately.
A new gesture starts from the last committed painted camera. Releasing or
cancelling a drag stops on that exact frame rather than completing a stale
target. Reaching minimum zoom with zero radial offset restores the canonical
centered Fit camera.
Selecting a point in the radial canvas MUST center its canonical point and
frame approximately three adjacent depth bands. Radial wheel and drag updates
MUST be coalesced to at most one camera commit per animation frame.

The bundled composite MUST allocate equal horizontal width to the cone and
radial canvases. The 50/50 split remains stable across camera zoom, browser
zoom, and viewport resizing, including narrow viewports.
The public demo MUST fit its top navigation, “Generation graph parameters”
panel, both projection windows, and graph status within the initial viewport.
Explanatory content follows below that first-screen workspace and MUST include
plain-language mechanics plus concrete uses such as skill progression trees
and educational knowledge navigation.

Controls require programmatic names, visible focus, non-color state cues, and
WCAG AA contrast. `prefers-reduced-motion` MUST remove non-essential layout
transitions. Automated browser checks supplement, but do not replace, manual
keyboard and assistive-technology review.

## 10. Performance and failure behavior

Traversal MUST be iterative where user-controlled depth could exhaust the call
stack. Derived state and layout MUST not mutate input. The default supported
generator ceiling is 1,000 nodes.

Generation and validation errors are typed. Invalid application trees do not
render partially. A custom renderer exception remains consumer responsibility;
applications SHOULD wrap untrusted renderers in their own error boundary.

## 11. Acceptance criteria

- **GEN-01:** Every feasible option set returns exactly `nodeCount` unique nodes
  within branching and depth bounds.
- **GEN-02:** Equal options and seed return equal trees; different seeds can be
  replayed independently.
- **GEN-03:** Impossible capacity returns `capacity_exceeded` without a partial
  result.
- **GEN-04:** Bias `0` produces a lower mean depth than bias `1` for the canonical
  uniform fixture.
- **TREE-01:** Duplicate IDs, missing roots, unknown parents, self-parenting,
  cycles, and disconnected structures are rejected.
- **LAYOUT-01:** Cone X is true depth at every frontier.
- **LAYOUT-02:** Every visible parent is centered on its extreme children.
- **LAYOUT-03:** Fractional cone coordinates equal interpolation of adjacent
  complete coordinate sets.
- **RADIAL-01:** Descendants beyond the coordinate boundary coincide with their
  boundary ancestor; the next ring moves continuously toward canonical points.
- **SYNC-01:** Both layout projections use the same camera-derived coordinate
  frontier in one composite render while every topology node remains mounted.
- **VIEWPORT-01:** At every cone pan, zoom, resize, and frontier change, radial
  sector membership equals the exact set of cone cards intersecting the cone
  viewport in the same render, while nodes outside that set remain visible.
- **VIEWPORT-02:** Cone and radial canvases retain equal width across camera
  zoom and responsive viewport changes.
- **VIEWPORT-03:** Wheel input over either canvas changes its camera zoom
  without changing document scroll position.
- **VIEWPORT-04:** Cone wheel sessions keep one anchor; card/background drag
  captures after its threshold and cannot emit an accidental selection.
- **VIEWPORT-05:** Cone motion is clamped to its first and terminal extents
  independently of zoom.
- **VIEWPORT-06:** Retargeted wheel/drag motion stays within its screen-space
  frame budget, release freezes the painted frame, and the overview boundary
  restores canonical Fit.
- **VIEWPORT-07:** Radial camera updates are frame-coalesced and radial point
  selection centers the point at a three-band scale.
- **VIEWPORT-08:** Cone movement centers and fits the complete radial sector;
  direct radial camera input overrides following only until the next cone
  movement.
- **DEMO-01:** Navigation, generation controls, both graph windows, and graph
  status fit in the first viewport at supported desktop and mobile sizes.
- **EXT-01:** Custom renderers, edge appearance, overlays, labels, actions, and
  headless APIs work without changing the core tree.
- **A11Y-01:** The full demo passes automated WCAG 2.2 AA checks and supports
  keyboard zoom, selection, and native node navigation.
- **PERF-01:** The headless model returns 1,000 cone and 1,000 radial nodes under
  the bounded test budget.
- **DIST-01:** Strict typecheck, lint, unit/component/browser tests, demo/library
  builds, and package dry run pass from a clean install.
- **NON-GOAL-01:** No built-in control adds nodes, edits node data, or changes
  node colors.
