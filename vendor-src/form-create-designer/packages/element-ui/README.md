# CheeseCave Element Plus source fork

Upstream: https://github.com/xaboy/form-create-designer

Pinned tag: `v3.5.0`; commit `02485bc95ab8c86e9b9613101709d22d480dc598`.

Copyright xaboy; MIT license is retained in `LICENSE`.

This checkout retains Vue 3 + Element Plus support and the shared source it needs. Other UI adapters, their examples, package dependencies and build targets have been removed. The historical `element-ui` directory name is retained for compatibility; this is the Vue 3 Element Plus adapter.

Build from the enclosing `temp_workspace` using `pnpm run build:vendor` (or `node scripts/build-vendor.mjs`). Dependencies and build tools are locked by that workspace's `pnpm-lock.yaml`. The two FormCreate packages resolve to local source workspaces, never registry packages. Internal core, utilities and component wrappers are compiled from this checkout.

See `../upstream.json`, `../build-report.json` and `../../THIRD_PARTY_NOTICES.md` for provenance and the local build manifest. Source edits are visible with `git diff HEAD`; upstream Git history and the `cheesecave/element-plus-only` branch are retained.
