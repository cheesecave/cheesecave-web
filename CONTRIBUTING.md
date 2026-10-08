# Contributing to CheeseCave Web

Use Node.js 20.19+ and pnpm 10.18.1. Install with `pnpm install --frozen-lockfile`, run `pnpm test` and `pnpm build`, and format changed JavaScript/Vue files with Prettier. Components use Vue Composition API, two-space indentation, PascalCase component names and camelCase JavaScript names. Preserve responsive behavior, light/dark themes, upstream attribution and existing regression tests.

Keep UI changes in this repository. Coordinate API contract changes with cheesecave-backend and Admin portal changes with cheesecave-admin. Browser API and file resolve requests use the same origin. Report issues to [cheesecave/cheesecave-web](https://github.com/cheesecave/cheesecave-web/issues).

The application originated in [KohakuHub](https://github.com/KohakuBlueleaf/KohakuHub) and its DeepGHS fork. Retain original copyright and license notices.

## Test and coverage scope

**What runs.** The CI workflow starts only when application code, tests or build configuration
change: `src/**` (except Markdown), `test/**`, `scripts/**`, the package and lock files, the Vite,
Vitest and UnoCSS configuration, `index.html`, `nginx.conf`, the `Dockerfile` and the workflow itself.
Documentation, images, `public/` assets and other resources do not start the test matrix.

**What coverage measures.** Coverage counts the application's runtime code under `src/`: pages,
components, stores, composables and the error model. It excludes:

- tests, scripts and tooling (`scripts/`, build helpers, deployment and CI scripts);
- generated declarations, documentation, images and other resources.

The `src/utils/` modules that the application imports are measured like the rest of `src/`.
