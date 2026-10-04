# Contributing to CheeseCave Web

Use Node.js 20.19+ and pnpm 10.18.1. Install with `pnpm install --frozen-lockfile`, run `pnpm test` and `pnpm build`, and format changed JavaScript/Vue files with Prettier. Components use Vue Composition API, two-space indentation, PascalCase component names and camelCase JavaScript names. Preserve responsive behavior, light/dark themes, upstream attribution and existing regression tests.

Keep UI changes in this repository. Coordinate API contract changes with cheesecave-backend and Admin portal changes with cheesecave-admin. Browser API and file resolve requests use the same origin. Report issues to [cheesecave/cheesecave-web](https://github.com/cheesecave/cheesecave-web/issues).

The application originated in [KohakuHub](https://github.com/KohakuBlueleaf/KohakuHub) and its DeepGHS fork. Retain original copyright and license notices.
