# CheeseCave Web: agent guide

This repository is the CheeseCave public website: repository browsing, file and dataset previews,
and account pages. It is a Vue 3 single-page application built with Vite, UnoCSS and
unplugin-auto-import. It talks to the CheeseCave backend, which lives in a separate repository.
It is a fork of KohakuHub; keep the attribution in `NOTICE.md`, `LICENSE`, `LICENSING.md` and
`provenance/` intact.

## Maintenance discipline

- **Branches and pull requests.** Do not commit to `main`. Work on a feature branch, open a
  pull request, and wait for its checks. Do not merge, deploy or publish without explicit
  authorization from the maintainer.
- **Commits.** Write English subjects in the imperative mood (`fix: ...`, `ci: ...`). Stage only
  the files you intend to change. Before committing, check `git status` for `node_modules/`,
  `dist/`, `coverage/`, `.env*` files and editor or OS leftovers. A generated file that slips
  into a pull request is a bug.
- **Secrets.** Never commit tokens or keys, and never print their values in logs or transcripts.
  CI credentials live in repository secrets.
- **Tests first.** For behaviour changes, write the failing test first, then the code. Cover the
  changed runtime lines. Do not delete, skip or weaken assertions to make a run pass.
- **Test scope.** The CI workflow runs only when application code, tests, scripts, dependency
  or build configuration changes. Documentation, `public/` assets and `images/` must not start
  the full run. Coverage measures the application code under `src/` (pages, components, stores,
  composables, errors and the runtime modules in `src/utils/`). It excludes tests, `scripts/`
  tooling, generated declarations and resources. See
  [CONTRIBUTING.md](CONTRIBUTING.md#test-and-coverage-scope).
- **Compatibility.** Keep the URL shapes the backend serves (`/api/...`, `/{type}s/{namespace}/{name}`)
  and the `KOHAKU_HUB_*` names stable. User-visible product text is CheeseCave; KohakuHub
  appears only as attribution.
- **Documentation.** Keep English as the source of repository documents. Where a Chinese
  companion exists (`*.zh-CN.md`), update both in the same change.

## Layout

- `src/pages/`: file-based routes (`typed-router`). Dynamic routes use bracket names.
- `src/components/`: auto-imported components; `src/composables/`: auto-imported hooks.
- `src/stores/`: Pinia stores. `src/utils/api.js` is the single API client.
- `src/errors/`: the error model shared with the backend's error codes.
- `test/`: Vitest suites, grouped by `components`, `pages`, `stores`, `utils`, `errors`.
- `scripts/`: build and CI helpers. `nginx.conf` and `Dockerfile` define the production image.

## Commands

Use Node.js 20.19 or newer and pnpm 10.18.1.

```sh
pnpm install --frozen-lockfile
pnpm dev        # Vite dev server; proxies the API to a local backend
pnpm test       # Vitest with coverage
pnpm build      # production build
```

## Code conventions

- Use the Composition API with `<script setup>`. Composables and router helpers such as
  `useRoute()` are auto-imported; do not add manual imports for them.
- Call the backend only through `src/utils/api.js`. Add a method there rather than calling
  `fetch` from a component.
- Handle backend errors through the shared error model in `src/errors/`, not ad hoc strings.
- Keep user-visible text in English unless the surrounding component already uses another language.
- Prefer existing UnoCSS utilities and the design tokens in `src/styles/` over new CSS files.
