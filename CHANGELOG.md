# Changelog

Notable project changes are recorded here. The project follows semantic
versioning after its first tagged release.

## Unreleased

- Keep cone and radial canvases at an equal 50/50 width across responsive and
  zoom changes.
- Present branch, depth, and node count as range controls in the demo.
- Capture wheel zoom inside projection canvases without scrolling the page.
- Derive the presentation frontier automatically from the cone camera instead
  of exposing a manual depth slider.
- Keep the complete topology mounted while the frontier collapses coordinates,
  and synchronize the radial pull/viewfinder in the same render.
- Port fixed-anchor wheel sessions, direct card dragging, bounded terminal
  camera motion, and post-drag click suppression from the source implementation.

## 0.1.0 - 2026-08-13

- Initial extensible React and TypeScript library.
- Deterministic bounded tree generator with uniform and random modes.
- Synchronized persistent-frontier cone and radial layouts.
- Exact cone-camera viewport membership and a synchronized radial sector.
- Interactive playground and GitHub Pages deployment workflow.
- Unit, component, browser, package, and accessibility checks.
