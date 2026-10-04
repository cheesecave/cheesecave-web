# 手动 Web CI

[English](ci.md) | 简体中文

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) 只有 `workflow_dispatch` 触发器，提交配置不会启动运行。Push、PR、发布和定时任务均不会触发它。仓库的 Actions 开关是独立设置，添加工作流不会启用 Actions 或发起运行。

## 分类

| `category`   | 执行的任务           | 命令                                                                                                             |
| ------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `all`        | 完整回归与生产构建   | 以下两个分类，各自独立运行                                                                                       |
| `regression` | 完整前端测试与覆盖率 | `pnpm test --maxWorkers=2`                                                                                       |
| `build`      | 生产静态资源         | `pnpm build`                                                                                                     |
| `docker`     | 容器构建及应用/许可文件冒烟检查 | `docker build --build-arg VITE_GIT_COMMIT="$GITHUB_SHA" --build-arg VITE_GIT_DIRTY=false -t cheesecave-web:ci .` |

每个任务都根据所选分类设置执行条件，未选择的任务会跳过。Docker 是单独可选的分类，不包含在 `all` 中。

回归和生产构建使用 Node.js 20.x（20.19+）、pnpm 10.18.1 与 `pnpm install --frozen-lockfile`。测试脚本执行当前 Vitest 配置选中的完整测试集，在 `coverage/` 生成报告。工作流使用常规测试与构建命令，不修改断言或测试超时。Docker 任务使用本仓库的 Dockerfile，通过 `VITE_GIT_COMMIT` 写入所选提交的版号。

工作流不部署应用、不推送镜像、不修改 Git 引用、不向其他服务发送覆盖率。覆盖率和构建摘要保留在任务日志中；文件只留在 runner 上，不上传为 artifacts。工作流只授予 `contents: read`，checkout 不保留 Git 凭据。

## 手动使用与本地验证

维护者决定启用并运行 Actions 后，工作流须已存在于默认分支。维护者可选择 **Web CI (manual)**，指定分支与分类，再使用 **Run workflow**。参见 GitHub 的[手动运行说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)与 [`workflow_dispatch` 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)。准备和提交配置不会执行上述远端操作。

本地对应命令为：

```sh
pnpm install --frozen-lockfile
pnpm test --maxWorkers=2
pnpm build
docker build --build-arg VITE_GIT_COMMIT="$(git rev-parse HEAD)" \
  --build-arg VITE_GIT_DIRTY=false -t cheesecave-web:ci .
```

Docker 示例使用 Bash。应用代码未改变时，可验证 YAML 和分类条件，无需再次运行完整测试集。`actionlint .github/workflows/ci.yml` 仅检查工作流语法和表达式，不发起运行。

## 固定 Action 版本

Action 使用固定提交 SHA，而非会移动的 tag。下表中的上游版本用于标识核对过的版本，工作流实际使用的是提交 SHA。

| Action                                                      | 上游版本 | 提交                                       |
| ----------------------------------------------------------- | -------- | ------------------------------------------ |
| [actions/checkout](https://github.com/actions/checkout)     | v6.1.0   | `d23441a48e516b6c34aea4fa41551a30e30af803` |
| [actions/setup-node](https://github.com/actions/setup-node) | v6.5.0   | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| [pnpm/action-setup](https://github.com/pnpm/action-setup)   | v4.3.0   | `b906affcce14559ad1aafd4ab0e942779e9f58b1` |

pnpm 的 SHA 是 annotated tag `v4.3.0` 指向的实际提交。更新 Action 时需核对 tag 对应的提交，并通过 [actionlint](https://github.com/rhysd/actionlint) 检查工作流。
