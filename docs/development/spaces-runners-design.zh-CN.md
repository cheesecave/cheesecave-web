---
title: Space 与 Runner（设计提案）
description: Space 如何跑在自行注册的 runner 上，支持 GPU 与 CPU；一个原型及其实测结果
icon: i-carbon-application
---

# Space 与 Runner：设计提案

[English](spaces-runners-design.md) | 简体中文

> **状态：提案，尚未实现。** 目前 Space 只是一种保存文件的仓库类型；后端对
> `/spaces/{ns}/{name}/runtime|restart|sleep|pause|hardware|storage|variables|secrets`
> 一律回 `501 Not Implemented`（后端的 `api/not_implemented.py`）。本文说明如何让 Space 真正运行，
> 并记录 2026-10-07 为验证设计而做的一次性原型。下面的数字来自这个原型，说明的是"可行"，
> 不代表正式实现的表现。

## 1. 目标

让 hub 能运行 Space（保存在 git 仓库里的应用），像 Hugging Face Spaces，但有这些不同：

- **算力不属于站点。** *runner* 是独立的程序，我们信任的人可以在任何机器上运行，有没有 GPU 都行。
  它只需要站点的**入口地址**和一个**令牌**；站点给它分配任务、观察它的健康度。
  形态类似 GitHub runner 或 GitLab runner。
- **Space 在网页里直接可用。** 仓库页用 iframe 显示正在运行的应用，公开和私有 Space 都支持。
- **贴合现有的 hub：** 代码在 Space 自己的仓库里（LakeFS 加 git），访问权限跟随仓库可见性和用户权限，
  配额和组织体系都已存在。

第一版不做：多副本、自动伸缩、持久磁盘、构建期密钥、自定义域名、GPU 共享（一张 GPU 同一时间只给一个 Space）。

## 2. Hugging Face 的做法（参照）

来自 [Spaces 概览](https://huggingface.co/docs/hub/spaces-overview)、
[Docker SDK](https://huggingface.co/docs/hub/spaces-sdks-docker) 和
[配置参考](https://huggingface.co/docs/hub/spaces-config-reference)：

- Space 是一个 git 仓库，`README.md` 顶部有 YAML 块（`sdk: gradio|docker|static`、`app_port`、`sdk_version`、
  `python_version`、`app_file`、`suggested_hardware`、`startup_duration_timeout` 等）。每次 push 都会重新构建并重启。
- 应用在独立的主机名上提供（`<owner>-<name>.hf.space`），并嵌入 Space 页面。
- 硬件是命名的档位（CPU basic、T4、L4、A10G、A100 等）。免费硬件空闲时会休眠。
- 变量是可见的设置，密钥只写不读。Docker Space 的变量既是构建参数也是运行时环境变量，密钥只能作为构建期的 secret 挂载和运行时环境变量。
  容器以 uid 1000 运行。
- 有公开、受保护、私有三种可见性；私有 Space 对其他人返回 404。

我们采纳：README YAML 约定、三种 SDK、命名的硬件档位、休眠与唤醒、变量与密钥的区分、uid 1000、每个 Space 一个主机名。
暂不做：受保护可见性、存储桶、ZeroGPU、开发模式、自定义域名、密钥扫描。

## 3. 架构

```
                                   +----------------------------- 站点 ---------------------------------+
 浏览器 ---- 仓库页 -------------> |  hub API（仓库、LakeFS、认证）        控制面                         |
    |       （iframe）             |    注册令牌、runner、                  调度、Space 生命周期、         |
    |                              |    HF 兼容的运行时 API                 事件日志、对账循环             |
    |                              |                                                                      |
    +-- <owner>--<name>.spaces.X --|-> 网关：认证、唤醒、经隧道转发 HTTP / SSE / WebSocket                 |
                                   +----------------^------------------------^---------------------------+
                                                    | 只向外连               | 只向外连
                                       +------------+------------+  +--------+-----------------+
                                       | runner（CPU 机器）      |  | runner（GPU 机器，在     |
                                       |  agent + docker         |  |  NAT 之后）agent + docker|
                                       |  容器：Space            |  |  容器：Space             |
                                       +-------------------------+  +--------------------------+
```

三个部分：

- **控制面**（在后端里）：知道所有 runner、硬件档位，以及每个 Space 的*期望*状态和*实际*状态；决定放在哪；
  只通过回应 runner 的请求与它们通信。
- **网关**（在后端里或旁边）：所有运行中 Space 的唯一入口。
- **Runner**（工作机上的一个文件或二进制）：构建并运行容器、上报健康、转发流量。

## 4. Runner 模型

runner 独立于站点部署，全部配置就是「入口地址 + 注册令牌」。

```
runner register --url https://hub.example --token ccrt_...   # 一次；写入 runner 自己的令牌
runner run                                                   # 保持三条向外的连接
```

1. **注册。** 管理员创建一次性的*注册令牌*，可带标签（`zone=gcp`、`accept_cpu=no`）。`register` 用它换取 runner
   自己的长期令牌（站点只存哈希）。用过的或错误的注册令牌会被拒绝。
2. **控制通道。** runner 长轮询任务（`start`、`stop`、`logs`），并上报进度事件。
   它**每 5 秒发一次心跳**，带健康信息：负载、可用内存、剩余磁盘、Docker 是否可用、是否装了 BuildKit，
   GPU runner 还带利用率、已用和空闲显存、温度。连续 20 秒没有心跳就视为*离线*。
3. **数据通道。** 一条向外的 **WebSocket 隧道**。网关把浏览器访问某个 Space 的 HTTP、SSE、WebSocket 流量
   带着请求 id 沿它发下去；runner 转给本机 `127.0.0.1` 上的容器，再把响应流式送回。
   runner 上没有任何东西在监听等站点来连。隧道会自动重连。

为什么只向外连：NAT 或防火墙后面的 runner 也能工作，站点不需要任何通向 runner 的路由，runner 上唯一的秘密就是它自己的令牌。

管理员可以*暂停*（排空）一个 runner：已有的 Space 继续跑，但不再分配新的。

### 调度

硬件档位提出的需求是：CPU、内存，以及可选的一块指定型号的 GPU 和最低空闲显存。调度器在满足以下条件的 runner 里挑负载最低的：
在线、未暂停、Docker 可用、剩余磁盘够、还有余量。GPU 容量按整卡计算。标签用来引导放置
（比如 GPU runner 可以声明不接 CPU Space）。放不下时 Space 会说明原因（"目前没有健康的 runner 能承载 'gpu-h200'"）。

runner 各不相同，所以调度需要知道它们的**能力**，而不只是规模。原型里的例子：远程 GPU 主机用的是旧版 Docker 构建器
（没有 `buildx`），做不了构建期密钥。需要构建期密钥的 Space 只能放在上报 `buildkit: true` 的 runner 上。

### Space 生命周期与对账

```
 (无) -> queued -> building -> starting -> running --空闲--> sleeping --请求--> queued ...
                      |           |          |  \--runner 离线--> runner_lost --请求--> queued ...
                      +-----------+----------+--> error --请求--> queued ...
```

Space 的期望状态是"运行，除非被暂停或处于休眠"。控制面应当做*对账*：runner 丢失，或者放置时没有可用资源而失败，
一旦有资源就重新放置。原型是在下一个请求时对账，足够看出它能工作；生产需要一个后台循环。
（最初的原型在 runner 恢复后，Space 仍卡在 `error`，直到加了这条规则。）

## 5. 网关与页面里的 Space

- **每个 Space 一个主机名：** `<owner>--<name>.spaces.<域名>`，配通配符证书。不用 hub 下的路径：
  放在 hub 同源上，用户代码可以读到 hub 的会话 Cookie，而且很多应用在路径前缀下会出问题。
  要用**独立的可注册域名**，而不是 hub 域名的子域名，这样 Cookie 无法靠作用域共享。
- **嵌入：** 仓库页用设置了 `sandbox` 的 iframe 嵌入 Space 的主机名，Space 的响应带
  `Content-Security-Policy: frame-ancestors <hub 来源>`，只有 hub 能嵌入它。
- **私有 Space：** hub 为查看者签发短期的签名令牌（`?__sign=`），网关验证后设置一个只作用于该 Space 自己主机名的 Cookie。
  一个 Space 的令牌在另一个 Space 上无效。其他人得到明确的拒绝（生产上返回 404，与 HF 一致）。
- **请求唤醒：** 对已停止或休眠的 Space 发请求会重新放置它。浏览器导航会得到一个会自动刷新的"正在唤醒"页面；API 调用则被挂住，直到 Space 响应。
- **流式：** 响应按流转发，所以 SSE（Gradio 用它）不会被缓冲；WebSocket 的文本和二进制帧都能透传
  （Streamlit、Jupyter 这类应用依赖 WebSocket；原型测的是通用的回显服务，不是这些应用本身）。
- **空闲休眠：** 设了空闲超时的 Space，在这么长时间没有请求后被停止。

## 6. 构建与运行

最初支持的 README YAML 键：`sdk`、`sdk_version`（Gradio）、`app_port`、`app_file`、`python_version`、
`startup_duration_timeout`、`suggested_hardware`、`title`/`emoji`/`short_description`。

| SDK | 构建 | 运行 |
|---|---|---|
| `static` | 在仓库内容上套一个很小的文件服务镜像 | 在 7860 上提供文件 |
| `docker` | 使用仓库自己的 `Dockerfile` | `app_port`，默认 7860 |
| `gradio` | 生成：`python:3.x-slim`、`pip install gradio==<sdk_version> requests`、`requirements.txt` | 在 7860 上运行 `python app.py` |

- runner 从 hub 取 Space 的文件，本机构建，用内容哈希给镜像打标签，所以没变化的 Space 直接从缓存启动。
  包镜像源和代理设置属于 runner 自己（`build_args`）：原型里同样的依赖，用镜像源 8.6 秒，不用则要两分钟以上。
- SDK 模板必须补齐该 SDK 运行所需的依赖。Gradio 5.9.1 曾因新版 `huggingface_hub` 不再带入 `requests` 而启动失败；
  构建器必须固定版本或补上缺失的依赖。
- **变量**是构建参数和运行时环境变量；**密钥**只是运行时环境变量。构建期密钥需要 BuildKit
  （`RUN --mount=type=secret`）和上报了该能力的 runner。
- 默认容器参数：`--user 1000:1000 --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges
  --pids-limit 512 --cpus N --memory M --memory-swap M`，只发布在 `127.0.0.1`。
- 内置环境变量沿用 HF：`SPACE_ID`、`SPACE_HOST`、`CPU_CORES`、`MEMORY`、`ACCELERATOR`。

### GPU

GPU 档位给一个 Space **一整块 GPU**，容器里必须只看得到这一块。正规做法是 NVIDIA Container Toolkit
（`--gpus device=N` 或 CDI）。原型还验证了一个既不需要 toolkit 也不需要 root 的备用办法：
传入这块 GPU 的 `/dev/nvidiaN`、`/dev/nvidiactl`、`/dev/nvidia-uvm`，再把驱动库（`libcuda`、`libnvidia-ml`）以只读方式挂进去。
容器里的 CUDA 调用只看到一块 GPU（主机上共有 8 块）及它的显存。这个备用办法很脆弱（库路径随发行版和驱动不同，
`nvidia-smi` 这类工具缺失），只作最后手段，并且让 runner 上报它用的是哪种方式。runner 在心跳里报告空闲显存，
调度器因此不会把 Space 放到别人正在使用的卡上。

## 7. 安全

Space 里的代码在证明无害之前都当作恶意的；runner 就是边界。

- **默认加固的容器**（上面的参数）。在 rootless Docker 的 runner 上实测：uid 1000、没有任何 capability、
  根文件系统只读、没有 Docker socket、进程数在 512 的限制下被卡在约 510、吃内存的进程被 cgroup 杀掉、宿主机上的服务连不上。
- **出口网络策略是必须的。** 在 GCP 里 rootful 的 runner 上，Space 容器**能访问云元数据服务（`169.254.169.254`）**，
  恶意代码可以借此读到这台 VM 的服务账号凭据。runner 必须默认阻止 Space 容器访问元数据地址和内网网段
  （在 Docker 网桥上加防火墙规则，或每个 Space 一个独立网络）。不要依赖某台机器上 Docker 碰巧的配置。
- **谁能接入 runner 是信任决策。** runner 能看到 Space 的源码、变量、密钥和流量。起步阶段只用站点运维自己运行的 runner。
  以后可以让用户把 runner 接到自己的 Space 上，但要求该 Space 明确同意，并且绝不让这个 runner 接触别人的 Space。
- **令牌：** 注册令牌一次性；runner 令牌只存哈希；心跳和隧道都用 runner 令牌认证；被撤销的 runner 立即被切断。
- **更强的隔离**（gVisor 或 Kata Containers，作为 runner 可以提供的 `runtime`）可用于不可信的租户。我们读到的对比
  （[1](https://rywalker.com/research/container-vm-runtimes)、[2](https://emirb.github.io/blog/microvm-2026/)）
  认为 Kata 的 GPU 支持最成熟，Firecracker 最弱；这些是二手资料，**这里没有测试**。

## 8. 需要实现的 HF 兼容 API

这些是目前返回 501 的路径。`huggingface_hub` 会调用它们（`get_space_runtime`、`restart_space`、
`pause_space`、`set_space_sleep_time`、`request_space_hardware`、`add_space_secret`、`add_space_variable` 等）：

```
GET    /api/spaces/{id}/runtime                  阶段、硬件（当前、请求的）、休眠时间、副本数
POST   /api/spaces/{id}/restart | pause | sleeptime | hardware
POST   /api/spaces/{id}/secrets | variables     同样路径的 DELETE
```

另有 runner 管理（仅管理员）：创建注册令牌、列出 runner 及其健康度、暂停和恢复、撤销。

## 9. 数据模型（草案）

| 表 | 内容 |
|---|---|
| `runner_registration_token` | 令牌哈希、标签、剩余次数、过期时间、创建者 |
| `runner` | id、名称、标签、容量（CPU、内存、带型号的 GPU）、令牌哈希、版本、能力、最后在线时间、是否暂停、是否撤销 |
| `space_runtime` | 仓库、期望状态、实际状态、硬件档位、所在 runner、镜像标签、启动时间、最后请求时间、空闲超时、最后错误 |
| `space_variable`、`space_secret` | 仓库、键、值（密钥加密）、可见性 |
| `space_event` | 仓库、时间、类型、详情（放置、构建、启动、休眠、runner 丢失） |

## 10. 原型的实测结果

实验环境：控制面和网关在一台笔记本级别的机器上，同一台机器上有一个 CPU runner 和一个 GTX 1660 Ti runner，
另有一个 runner 在共享的 8×H200 主机上（只用一块空闲的 GPU，另外七块属于别人的任务），通过 SSH 反向转发访问站点。
单进程，状态在内存里，隧道是自己写的最小实现。**仅供参考。**

| 检查项 | 结果 |
|---|---|
| 注册 | 一次性令牌；重复使用和错误令牌都被拒绝（403） |
| 冷启动，镜像已缓存 | 静态和 Docker 不到 1 秒；Gradio 2.1 到 2.5 秒 |
| Gradio 首次构建 | 用 pip 镜像源 33 秒 |
| 从休眠唤醒 | 约 0.9 秒 |
| 页面里的 Gradio | 真实浏览器，hub 页面里的 iframe，输入并点击后输出正确 |
| 隧道里的 SSE | 间隔 0.5 秒的五个事件，到达时也间隔 0.5 秒（没有被缓冲） |
| 隧道里的 WebSocket | 文本和 200 KB 二进制帧都正确回显（40 毫秒） |
| 隧道开销 | 本机回环：小请求中位数 2.1 毫秒，241 MB/s；远程 runner：中位数 237 毫秒（这条路径本身的网络往返），115 MB/s |
| 容器里的 GPU | 1660 Ti：看到 5.7 GB；H200：看到 143 GB；各自只看得到一块 GPU |
| 调度 | 每个 runner 一块 GPU 的限制生效；GPU runner 不接 CPU Space；被暂停的 runner 不再被分配 |
| 私有 Space | 无令牌 401；签名令牌换到只作用于该主机的 Cookie；别的 Space 的令牌被拒绝 |
| runner 链路被切断 | 30 秒后判离线，32 秒时 Space 变 `runner_lost`，期间请求返回 502 |
| 链路恢复 | runner 5 秒内自己重连；下一个请求重新放置 Space，7.4 秒后返回响应 |
| 恶意 Space（rootless） | 见第 7 节 |
| 恶意 Space（rootful，GCP） | 元数据服务可达 |

没有测试：Kubernetes、Nomad、gVisor、Kata、持久存储、构建期密钥、OAuth、多个 runner、长时间运行、大镜像。

## 11. 分期

1. 控制面和 runner 协议（注册、心跳、任务、隧道）；`static` 和 `docker` SDK；每个 Space 的主机名和网关；
   仓库页的 iframe；休眠和唤醒；HF 运行时 API；runner 的管理页面。
2. `gradio` SDK；变量和密钥；硬件档位；GPU runner；出口网络策略；对账循环。
3. 持久存储；共享构建缓存；`preload_from_hub`（启动前把模型拉到 runner）；Streamlit；OAuth。
4. 可选的 gVisor 或 Kata；多副本；自定义域名。

## 12. 待决问题

1. 谁能接入 runner：只有站点运维，还是用户和组织可以为自己的 Space 接入？
2. 有没有带通配符证书的独立域名可用于 Space 主机名？
3. 硬件档位是否计入配额，GPU 时间怎么计量？
4. 第一个版本支持哪些 SDK？（本文建议静态、Docker、Gradio。）
5. 隧道自己做还是采用现成的（frp、chisel、rathole）？成熟的隧道在重连、背压和限流上比我们写的第一版更可靠。
6. 站点需要知道 runner 的哪些能力（BuildKit、GPU 的使用方式、可用的 runtime 类型、是否已应用出口策略）？

## 参考

- Hugging Face：[Spaces 概览](https://huggingface.co/docs/hub/spaces-overview)、
  [Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker)、
  [配置参考](https://huggingface.co/docs/hub/spaces-config-reference)
- [Nomad 与 Kubernetes 对比](https://markaicode.com/vs/nomad-vs-kubernetes/)（一篇带赞助内容的对比博客，需谨慎阅读）
- [容器与虚拟机运行时对比](https://rywalker.com/research/container-vm-runtimes)、
  [2026 年 MicroVM 隔离现状](https://emirb.github.io/blog/microvm-2026/)（二手资料）
