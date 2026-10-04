# CheeseCave Web

[English](README.md) | 简体中文

CheeseCave 的主站前端，基于 Vue 3，提供模型、数据集和 Spaces 仓库浏览、文件预览、上传、用户与组织管理等界面。API、存储和后台任务由独立后端提供，管理门户由 Admin 仓库提供。

| 仓库 | 职责 |
| --- | --- |
| [cheesecave-backend](https://github.com/cheesecave/cheesecave-backend) | API、worker、数据库迁移及整体部署的 Compose 配置 |
| [cheesecave-web](https://github.com/cheesecave/cheesecave-web) | 主站界面与主站容器镜像 |
| [cheesecave-admin](https://github.com/cheesecave/cheesecave-admin) | 管理界面与 Admin 容器镜像 |

## 本地开发

使用 Node.js 20.19+ 和 pnpm 10.18.1，在本仓库目录执行：

```sh
corepack enable
corepack prepare pnpm@10.18.1 --activate
pnpm install --frozen-lockfile
pnpm dev
```

默认访问 `http://localhost:5173/`，后端需要单独启动。Vite 开发代理的设置如下：

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `VITE_BACKEND_URL` | `http://localhost:48888` | API、组织、Git、LFS 和文件解析请求的后端目标 |
| `VITE_ADMIN_URL` | `http://localhost:5174` | 将 Admin 开发服务代理到主站的 `/admin/` |

这些变量需在启动 Vite 的进程环境中设置；浏览器仍使用同源请求路径。Admin 开发服务未启动时，主站其他页面可继续开发。

## 测试与构建

```sh
pnpm test
pnpm build
pnpm preview
```

`src/` 包含页面、组件及本地共享工具，`test/` 包含 Vitest 测试与预览数据。`pnpm test` 同时生成覆盖率报告，`pnpm build` 将静态产物写入 `dist/`。构建前会将随仓库保留的参考文档和图片复制到 `public/`；其中历史文档可能使用原项目名称与路径。

构建信息默认读取本仓库的 Git 提交；源代码压缩包或 Docker 构建可显式提供 `VITE_GIT_COMMIT` 与 `VITE_GIT_DIRTY`。继承的 CI 配置已在分仓库前移除，以上命令可直接在本地执行。

## 容器与独立更新

在本仓库构建镜像，以下示例使用 Bash：

```sh
docker build \
  --build-arg VITE_GIT_COMMIT="$(git rev-parse HEAD)" \
  --build-arg VITE_GIT_DIRTY=false \
  -t cheesecave-web:local .
docker run --rm --network cheesecave-net -p 8080:80 cheesecave-web:local
```

镜像通过 nginx 在 `/` 提供主站，容器内监听端口 80。`cheesecave-net` 是后端 Compose 的默认网络，须已存在且目标服务可达。运行时代理变量如下：

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `BACKEND_URL` | `http://hub-api:48888` | 同源 API、Git、LFS 与文件解析请求 |
| `ADMIN_URL` | `http://hub-admin:80` | `/admin/` 管理门户 |

使用其他部署网络或服务地址时，通过 `docker run -e` 设置对应变量。浏览器直接读取对象存储的预签名文件时，存储服务需允许相关来源的 CORS 与 Range 请求。

整体部署使用后端仓库的 `compose.yml`，无需额外的部署仓库。更新主站时，先在本仓库构建带新版本标签的镜像，再将后端 `.env` 中的 `CHEESECAVE_WEB_IMAGE` 指向该镜像。在后端仓库执行：

```sh
docker compose up -d --no-deps hub-web
```

该命令仅替换主站服务。若使用自行维护的镜像仓库，先执行 `docker compose pull hub-web`；本地构建的镜像无需拉取。本仓库提供构建方式，不预设已有发布镜像。

## API 兼容与开发历史

独立更新仍需后端支持所使用的 API。项目保留原有 API 路径、Git/LFS 协议和浏览器缓存键；修改接口时需协调相应后端与前端版本，并验证相关操作。

后端仓库保留完整原始 Git 提交历史；主站和 Admin 使用新的 Git 历史，首次提交均为「从原仓库分叉」。来源提交、拆分方式及原项目资料见 [provenance/UPSTREAM.md](provenance/UPSTREAM.md)。

## 来源与许可证

CheeseCave 源自 [KohakuBlueLeaf 的 KohakuHub](https://github.com/KohakuBlueleaf/KohakuHub) 与 [DeepGHS/KohakuHub](https://github.com/deepghs/KohakuHub)，保留原作者署名、版权及原仓库信息。CheeseCave 是独立衍生项目。

原始 [LICENSE](LICENSE) 和 [LICENSING.md](LICENSING.md) 原文保留。核心代码沿用 AGPL-3.0；Dataset Viewer 使用单独的 [Kohaku Software License 1.0](src/components/DatasetViewer/LICENSE)，具体适用范围以这些文件为准。原项目 README 和变更记录保存在 [provenance/](provenance/)。
