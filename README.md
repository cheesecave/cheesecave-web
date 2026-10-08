# CheeseCave Web

English | [简体中文](README.zh-CN.md)

The Vue 3 website for CheeseCave, with interfaces for browsing model, dataset and Spaces repositories, previewing and uploading files, and managing users and organizations. The separate backend provides APIs, storage and background tasks; the Admin repository provides the administration portal.

Visitors see a configurable homepage and repository discovery with README metadata filters. Signed-in users get a personal workspace with repository and activity views, organization scopes and following feeds. Profiles include follow controls. Site theme and footer navigation are configured in Admin, while original attribution remains protected.

| Repository | Responsibility |
| --- | --- |
| [cheesecave-backend](https://github.com/cheesecave/cheesecave-backend) | APIs, workers, database migrations and Compose configuration for the full deployment |
| [cheesecave-web](https://github.com/cheesecave/cheesecave-web) | Website and its container image |
| [cheesecave-admin](https://github.com/cheesecave/cheesecave-admin) | Administration portal and its container image |

## Local development

Use Node.js 20.19+ and pnpm 10.18.1. Run these commands from this repository:

```sh
corepack enable
corepack prepare pnpm@10.18.1 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:5173/`. Start the backend separately. The Vite development proxy supports these settings:

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `VITE_BACKEND_URL` | `http://localhost:48888` | Backend target for API, organization, Git, LFS and file resolve requests |
| `VITE_ADMIN_URL` | `http://localhost:5174` | Proxy the Admin development service under the website's `/admin/` path |

Set these variables in the environment of the process that starts Vite. Browser requests keep their same-origin paths. Other website pages can be developed while the Admin development service is stopped.

## Testing and builds

```sh
pnpm test
pnpm build
pnpm preview
```

`src/` contains pages, components and local shared helpers; `test/` contains Vitest tests and preview fixtures. `pnpm test` also produces a coverage report, and `pnpm build` writes static assets to `dist/`. Before building, retained reference documents and images are copied to `public/`; historical documents may use the original project's names and paths.

Build metadata normally reads this repository's Git commit. Source archives and Docker builds can explicitly supply `VITE_GIT_COMMIT` and `VITE_GIT_DIRTY`. Inherited CI configuration was removed before the repository split. The new [manual CI categories](docs/development/ci.md) cover regression, production builds and optional container builds; committing the workflow does not trigger it. The commands above also run locally.

## Containers and independent updates

Build an image from this repository. The following example uses Bash:

```sh
docker build \
  --build-arg VITE_GIT_COMMIT="$(git rev-parse HEAD)" \
  --build-arg VITE_GIT_DIRTY=false \
  -t cheesecave-web:local .
docker run --rm --network cheesecave-net -p 8080:80 cheesecave-web:local
```

The image serves the website at `/` through nginx and listens on container port 80. `cheesecave-net` is the backend Compose configuration's default network; it must already exist, and target services must be reachable. Runtime proxy settings are:

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `BACKEND_URL` | `http://hub-api:48888` | Same-origin API, Git, LFS and file resolve requests |
| `ADMIN_URL` | `http://hub-admin:80` | Administration portal at `/admin/` |

Use `docker run -e` to set these variables for other networks or service addresses. When browsers read presigned files directly from object storage, that storage service must allow CORS and Range requests from the relevant origins.

The full deployment uses `compose.yml` in the backend repository, with no additional deployment repository needed. To update the website, build an image with a new version tag in this repository, then set `CHEESECAVE_WEB_IMAGE` in the backend's `.env` to that image. Run this command from the backend repository:

```sh
docker compose up -d --no-deps hub-web
```

This replaces only the website service. If you maintain your own image registry, run `docker compose pull hub-web` first; locally built images do not need to be pulled. This repository provides build instructions and does not assume that published images are available.

## API compatibility and development history

Independent updates still require backend support for the APIs in use. The project retains existing API paths, Git/LFS protocols and browser cache keys. Coordinate backend and frontend versions when changing interfaces, and verify the affected operations.

Homepage and appearance settings require `GET /api/site-homepage` and `GET /api/site-appearance`. Discovery uses `GET /api/{models,datasets,spaces}/discover`; following uses `/api/users/{username}/follow` and `/api/users/{username}/{followers,following}`; activity feeds use `GET /api/workspace/feed`. Deploy the corresponding backend features and migrations before enabling these views. See the backend's [appearance guide](https://github.com/cheesecave/cheesecave-backend/blob/main/docs/deployment/site-appearance.md), [discovery guide](https://github.com/cheesecave/cheesecave-backend/blob/main/docs/features/repository-discovery.md) and [following guide](https://github.com/cheesecave/cheesecave-backend/blob/main/docs/features/following.md).

The backend repository preserves the complete original Git commit history. The website and Admin start fresh Git histories, both with the first commit titled `从原仓库分叉` (forked from the original repository). See [provenance/UPSTREAM.md](provenance/UPSTREAM.md) for the source commit, split procedure and original project information.

## Attribution and licenses

CheeseCave derives from [KohakuHub by KohakuBlueLeaf](https://github.com/KohakuBlueleaf/KohakuHub) and [DeepGHS/KohakuHub](https://github.com/deepghs/KohakuHub). Original author credits, copyright notices and repository information are retained. CheeseCave is an independent derivative project.

The original [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md) texts are preserved. Core code retains AGPL-3.0 terms. The Dataset Viewer, the only component that carried a separate license, was removed on 2026-10-08, so the code in this repository is AGPL-3.0 (vendored third-party code keeps its own notices); see [NOTICE.md](NOTICE.md). The original README and changelog are retained in [provenance/](provenance/).

See [dated notices](NOTICE.md) for attribution and modification notices.
