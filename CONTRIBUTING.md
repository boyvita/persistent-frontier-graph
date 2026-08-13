# Contributing

Thanks for helping improve Persistent Frontier Graph. Small, focused pull
requests with an explicit behavior claim are easiest to review.

## Before opening a change

1. Search existing issues and discussions.
2. Open an issue first for a new layout rule, public API, dependency, or large
   visual change.
3. Keep graph data immutable and preserve the invariants in
   [`docs/specification.md`](docs/specification.md).
4. Do not add application-specific editing, persistence, or color policy to the
   library core.

## Local verification

Use Node.js 24:

```bash
npm ci
npx playwright install chromium
npm run check:all
```

Changes to geometry need focused invariant tests. Changes to interaction or
presentation need a Chromium journey and an accessibility check. Public API
changes need matching API, example, and changelog updates.

## Pull requests

- Explain the user-visible outcome and tradeoffs.
- Link the issue when one exists.
- Include screenshots for visual changes.
- Keep generated `dist/`, `dist-lib/`, and test artifacts out of commits.
- Confirm that you have the right to contribute the code under the MIT License.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
