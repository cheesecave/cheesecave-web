# Manual Web CI

English | [简体中文](ci.zh-CN.md)

The workflow at [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) has only a `workflow_dispatch` trigger. Committing it does not start a run. Pushes, pull requests, releases and schedules do not trigger it. Repository Actions settings are separate; adding this workflow does not enable Actions or dispatch a run.

## Categories

| `category`   | Jobs executed                         | Commands                                                                                                         |
| ------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `all`        | Regression and production build       | The two categories below, in independent jobs                                                                    |
| `regression` | Complete frontend suite with coverage | `pnpm test --maxWorkers=2`                                                                                       |
| `build`      | Production static assets              | `pnpm build`                                                                                                     |
| `docker`     | Container build only                  | `docker build --build-arg VITE_GIT_COMMIT="$GITHUB_SHA" --build-arg VITE_GIT_DIRTY=false -t cheesecave-web:ci .` |

Each job has an explicit condition for the selected category. Unselected jobs are skipped. Docker is an optional separate category and is not included in `all`.

Regression and production build jobs use Node.js 20.x (20.19+), pnpm 10.18.1 and `pnpm install --frozen-lockfile`. The test script runs every suite selected by the existing Vitest configuration and produces coverage in `coverage/`. This workflow uses the ordinary test and build commands without adjusting assertions or test timeouts. The Docker job uses the repository's Dockerfile and embeds the selected commit through `VITE_GIT_COMMIT`.

No job deploys an application, pushes an image, changes Git refs or sends coverage to another service. Coverage and build summaries appear in the job logs; files remain on the runner and are not uploaded as artifacts. The workflow grants only `contents: read`, and checkout does not persist Git credentials.

## Manual use and local verification

When a maintainer chooses to enable and run Actions, the workflow must be present on the repository's default branch. The maintainer can select **Web CI (manual)**, choose a branch and category, then use **Run workflow**. See GitHub's [manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) and [`workflow_dispatch` reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch). Preparing or committing this configuration performs none of those remote actions.

Local equivalents are:

```sh
pnpm install --frozen-lockfile
pnpm test --maxWorkers=2
pnpm build
docker build --build-arg VITE_GIT_COMMIT="$(git rev-parse HEAD)" \
  --build-arg VITE_GIT_DIRTY=false -t cheesecave-web:ci .
```

The Docker example uses Bash. Local checks can validate YAML and category conditions without running the complete test suite again when application code is unchanged. `actionlint .github/workflows/ci.yml` checks workflow syntax and expressions without dispatching it.

## Pinned actions

Actions are pinned to commit SHAs rather than moving tags. The following upstream tags identify the checked versions; they are comments, not the workflow's actual references.

| Action                                                      | Upstream version | Commit                                     |
| ----------------------------------------------------------- | ---------------- | ------------------------------------------ |
| [actions/checkout](https://github.com/actions/checkout)     | v6.1.0           | `d23441a48e516b6c34aea4fa41551a30e30af803` |
| [actions/setup-node](https://github.com/actions/setup-node) | v6.5.0           | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| [pnpm/action-setup](https://github.com/pnpm/action-setup)   | v4.3.0           | `b906affcce14559ad1aafd4ab0e942779e9f58b1` |

The pnpm SHA is the commit behind the annotated `v4.3.0` tag. When updating actions, verify the tag's underlying commit and review the workflow with [actionlint](https://github.com/rhysd/actionlint).
