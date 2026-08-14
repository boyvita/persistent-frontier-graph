# Examples

These examples are deliberately small. They show where the library boundary
ends and application policy begins.

| Example | Demonstrates |
|---|---|
| [`basic/App.tsx`](basic/App.tsx) | Generated tree with an automatic camera frontier and synchronized projections |
| [`custom-nodes/App.tsx`](custom-nodes/App.tsx) | Domain data, custom node renderer, controlled selection, and revision-bound action |
| [`headless/layout.ts`](headless/layout.ts) | Framework-independent cone and radial coordinates from one snapshot |

The files import `persistent-frontier-graph` exactly as a consumer would. From
this repository, run `npm ci` first so the Git package build is available to
TypeScript. Copy an example into a React/Vite application after installing the
repository and importing `persistent-frontier-graph/styles.css` once.

There is intentionally no add-node, edit-node, or color-editor example. Tree
mutation belongs to the consuming application; replace the immutable `tree`
prop with a new revision when its structure changes.
If application actions depend on node-data freshness as well as structure, use
the application's document revision instead of the generator's structural
revision.
