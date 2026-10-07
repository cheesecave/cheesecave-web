---
title: Spaces and Runners (design proposal)
description: How Spaces could run on self-registered runners, with GPU and CPU hardware; a prototype and what it measured
icon: i-carbon-application
---

# Spaces and Runners: design proposal

English | [简体中文](spaces-runners-design.zh-CN.md)

> **Status: proposal. Nothing here is implemented.** Today a Space is a repository type
> that holds files; the hub answers `/spaces/{ns}/{name}/runtime|restart|sleep|pause|hardware|storage|variables|secrets`
> with `501 Not Implemented` (`api/not_implemented.py` in the backend). This page describes how
> to make Spaces run, and records a throw-away prototype built to test the design on 2026-10-07.
> The numbers below come from that prototype and say what is possible, not what a
> production build will do.

## 1. Goal

Run a Space (an app kept in a git repository) from the hub, like Hugging Face Spaces, with
these differences:

- **The compute is not the site's.** A *runner* is a separate program that anyone we trust can run
  on any machine, with or without a GPU. It needs only the site's **entry URL** and a **token**.
  The site assigns it work and watches its health. It works like a GitHub or GitLab runner.
- **A Space is usable in the page.** The repository page shows the running app in an iframe, for public
  and private Spaces.
- **It fits the hub we have:** the code is in the Space's repository (LakeFS + git), access follows the
  repository's visibility and the user's permissions, and quotas and organizations already exist.

Non-goals for a first version: multiple replicas, autoscaling, persistent disks, build-time secrets,
custom domains, shared GPUs (one GPU is given to one Space at a time).

## 2. What Hugging Face does (the reference)

From the [Spaces overview](https://huggingface.co/docs/hub/spaces-overview), the
[Docker SDK](https://huggingface.co/docs/hub/spaces-sdks-docker) and the
[configuration reference](https://huggingface.co/docs/hub/spaces-config-reference):

- A Space is a git repository whose `README.md` carries a YAML block (`sdk: gradio|docker|static`,
  `app_port`, `sdk_version`, `python_version`, `app_file`, `suggested_hardware`, `startup_duration_timeout`, ...).
  Every push rebuilds and restarts it.
- The app is served on its own host (`<owner>-<name>.hf.space`) and embedded in the Space page.
- Hardware is a named flavor (CPU basic, T4, L4, A10G, A100, ...). Free hardware sleeps when idle.
- Variables are visible settings; secrets are write-only. Docker Spaces get variables as build args and
  runtime env, secrets only as build-time secret mounts and runtime env. The container runs as uid 1000.
- Public, protected and private visibility; a private Space returns 404 to others.

Of these we take: the README YAML contract, the three SDKs, named hardware flavors, sleep/wake, the
variables/secrets split, uid 1000, the per-Space host. We skip for now: protected visibility, storage
buckets, ZeroGPU, dev mode, custom domains, the secrets scanner.

## 3. Architecture

```
                                   +----------------------------- the site ------------------------------+
 browser ---- repo page ---------> |  hub API (repos, LakeFS, auth)        control plane                  |
    |        (iframe)              |    registration tokens, runners,      scheduler, Space lifecycle,    |
    |                              |    HF-compatible runtime API          event log, reconcile loop      |
    |                              |                                                                      |
    +-- <owner>--<name>.spaces.X --|-> gateway: auth, wake, HTTP / SSE / WebSocket over the tunnel        |
                                   +----------------^------------------------^---------------------------+
                                                    | outbound only          | outbound only
                                       +------------+------------+  +--------+-----------------+
                                       | runner (CPU box)        |  | runner (GPU box, behind  |
                                       |  agent + docker         |  |  NAT) agent + docker     |
                                       |  containers: Spaces     |  |  containers: Spaces      |
                                       +-------------------------+  +--------------------------+
```

Three parts:

- **Control plane** (in the backend): knows runners, hardware flavors and every Space's *desired* and *actual*
  state; decides placement; talks to runners only by answering their requests.
- **Gateway** (in or next to the backend): the one entrance to every running Space.
- **Runner** (a single file or binary on the worker): builds and runs containers, reports health, relays traffic.

## 4. The runner model

The runner is deployed independently of the site. Its whole configuration is `entry URL + registration token`.

```
runner register --url https://hub.example --token ccrt_...   # once; writes the runner's own token
runner run                                                   # keeps three outbound connections
```

1. **Register.** An admin creates a one-time *registration token*, which can carry labels (`zone=gcp`,
   `accept_cpu=no`). `register` trades it for the runner's own long-lived token (stored hashed on the
   site). A used or wrong registration token is refused.
2. **Control channel.** The runner long-polls for jobs (`start`, `stop`, `logs`) and posts progress events.
   It sends a **heartbeat every 5 s** with its health: load, available memory, free disk, whether Docker
   works, whether BuildKit is installed, and for a GPU runner utilization, used and free memory, temperature.
   A runner that misses heartbeats for 20 s is *offline*.
3. **Data channel.** One outbound **WebSocket tunnel**. The gateway sends the browser's HTTP, SSE and
   WebSocket traffic for a Space down it, tagged with a request id; the runner relays it to the
   container on `127.0.0.1` and streams the answer back. Nothing on the runner listens for the site.
   The tunnel reconnects by itself.

Why outbound-only: a runner behind NAT or a firewall works, the site never needs a route into a runner,
and the only secret on the runner is its own token.

An admin can *pause* (drain) a runner: it keeps what it runs, and gets no new Spaces.

### Scheduling

A hardware flavor asks for CPU, memory and optionally one GPU model with a minimum of free GPU memory.
The scheduler picks, among runners that are online, not paused, have Docker working and enough free disk,
and have room, the one with the lowest load. GPU capacity counts whole GPUs. Labels steer placement
(for example a GPU runner can say it does not take CPU Spaces). If nothing fits, the Space says why
("no healthy runner can host 'gpu-h200' right now").

Runners differ, so scheduling needs their **capabilities**, not just their size. Example from the prototype:
the remote GPU host had a classic Docker builder (no `buildx`), which cannot do build-time secrets. A Space
that needs them must only be placed on a runner that reports `buildkit: true`.

### Space lifecycle and reconciliation

```
 (none) -> queued -> building -> starting -> running --idle--> sleeping --request--> queued ...
                        |           |          |  \--runner offline--> runner_lost --request--> queued ...
                        +-----------+----------+--> error --request--> queued ...
```

The desired state of a Space is "running unless paused or sleeping". The control plane should *reconcile*:
when a runner is lost, or a placement failed because nothing was available, the Space is placed again once
something is. The prototype did this on the next request, which is enough to see it work; a background loop
is what production needs. (The first prototype left a Space stuck in `error` after a runner came back until
this rule was added.)

## 5. The gateway and the Space in the page

- **One host per Space:** `<owner>--<name>.spaces.<domain>`, with a wildcard certificate. Not a path under
  the hub: user code on the hub's origin could read the hub's session cookie, and many apps break under a
  path prefix. Use a **separate registrable domain**, not a subdomain of the hub's, so cookies cannot be
  shared by scoping.
- **Embedding:** the repository page iframes the Space's host, with `sandbox` set, and the Space's responses carry
  `Content-Security-Policy: frame-ancestors <hub origin>` so only the hub can embed it.
- **Private Spaces:** the hub issues a short-lived signed token for the viewer (`?__sign=`); the gateway checks it
  and sets a cookie scoped to the Space's own host only. A token for one Space is refused on another. Others
  get a plain refusal (404 in production, to match HF).
- **Wake on request:** a request for a stopped or sleeping Space places it again. A browser navigation gets a
  "waking up" page that refreshes itself; an API call is held until the Space answers.
- **Streams:** responses are streamed, so SSE (Gradio uses it) is not buffered; WebSocket frames, text and binary,
  pass through (apps such as Streamlit and Jupyter rely on WebSockets; the prototype tested a generic echo server, not those apps).
- **Idle sleep:** a Space with an idle timeout is stopped after that long without requests.

## 6. Building and running

README YAML keys honoured at first: `sdk`, `sdk_version` (Gradio), `app_port`, `app_file`, `python_version`,
`startup_duration_timeout`, `suggested_hardware`, `title`/`emoji`/`short_description`.

| SDK | Build | Run |
|---|---|---|
| `static` | a tiny file-server image over the repository | serves the files on 7860 |
| `docker` | the repository's own `Dockerfile` | `app_port`, default 7860 |
| `gradio` | generated: `python:3.x-slim`, `pip install gradio==<sdk_version> requests`, `requirements.txt` | `python app.py` on 7860 |

- The runner fetches the Space's files from the hub, builds locally, and tags the image by a hash of the content,
  so an unchanged Space starts from cache. The runner's package mirrors and proxy settings are its own
  (`build_args`): in the prototype the same dependencies took 8.6 s through a mirror and over two minutes
  without.
- The SDK templates must supply the runtime dependencies the SDK needs. Gradio 5.9.1 failed to start because a newer
  `huggingface_hub` no longer pulls in `requests`; the builder has to pin or add what is missing.
- **Variables** are build args and runtime env; **secrets** are runtime env only. Build-time secrets need BuildKit
  (`RUN --mount=type=secret`) and a runner that reports it.
- Default container flags: `--user 1000:1000 --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges
  --pids-limit 512 --cpus N --memory M --memory-swap M`, published on `127.0.0.1` only.
- Built-in env vars follow HF: `SPACE_ID`, `SPACE_HOST`, `CPU_CORES`, `MEMORY`, `ACCELERATOR`.

### GPUs

A GPU flavor gives a Space **one whole GPU**; the container must see only that one. The proper way is the NVIDIA Container
Toolkit (`--gpus device=N` or CDI). The prototype also showed a fallback that needs neither the toolkit nor root:
pass that GPU's `/dev/nvidiaN`, `/dev/nvidiactl`, `/dev/nvidia-uvm` and bind-mount the driver libraries
(`libcuda`, `libnvidia-ml`). A CUDA call inside saw exactly one GPU (of eight on the host) and its memory. That fallback
is fragile (library paths differ by distribution and driver, tools like `nvidia-smi` are missing), so treat it as a
last resort and have the runner report which method it uses. The runner reports free GPU memory in its heartbeat so
the scheduler does not place a Space on a card someone else is using.

## 7. Security

The code in a Space is hostile until shown otherwise; the runner is the boundary.

- **Hardened containers by default** (the flags above). Measured on a rootless-Docker runner: uid 1000, no capabilities,
  root file system read-only, no Docker socket, processes capped near 510 under a 512 limit, a memory hog killed
  by the cgroup, services on the host unreachable.
- **Egress policy is mandatory.** On a rootful runner in GCP, a Space container **could reach the cloud metadata
  server (`169.254.169.254`)**, which would let hostile code read the VM's service-account credentials. A runner must
  block the metadata address and private ranges from Space containers by default (firewall rules on the Docker bridge,
  or a per-Space network). Do not rely on how Docker happens to be configured on a given machine.
- **Who may attach a runner is a trust decision.** A runner sees the Space's source, its variables and secrets, and
  the traffic. Start with runners the site operators run. Letting users attach runners to their own Spaces is possible later
  but needs the Space to opt in explicitly, and never exposes other people's Spaces to that runner.
- **Tokens:** registration tokens are one-time; runner tokens are stored hashed; the heartbeat and tunnel authenticate
  with the runner token; a revoked runner is cut at once.
- **Stronger isolation** (gVisor or Kata Containers as a `runtime` the runner can offer) is an option for untrusted
  tenants. The comparisons we read ([1](https://rywalker.com/research/container-vm-runtimes),
  [2](https://emirb.github.io/blog/microvm-2026/)) say Kata has the most mature GPU path and Firecracker the weakest;
  these are secondary sources and **not tested here**.

## 8. HF-compatible API to implement

These are the paths that return 501 today. `huggingface_hub` calls them (`get_space_runtime`, `restart_space`,
`pause_space`, `set_space_sleep_time`, `request_space_hardware`, `add_space_secret`, `add_space_variable`, ...):

```
GET    /api/spaces/{id}/runtime                  stage, hardware (current, requested), sleep time, replicas
POST   /api/spaces/{id}/restart | pause | sleeptime | hardware
POST   /api/spaces/{id}/secrets | variables     DELETE the same
```

plus runner administration (admin only): create registration tokens, list runners with health, pause/resume, revoke.

## 9. Data model (sketch)

| Table | Holds |
|---|---|
| `runner_registration_token` | token hash, labels, uses left, expiry, who made it |
| `runner` | id, name, labels, capacity (cpu, memory, GPUs with model), token hash, version, capabilities, last seen, paused, revoked |
| `space_runtime` | repository, desired state, actual state, hardware flavor, runner, image tag, started at, last request at, idle timeout, last error |
| `space_variable`, `space_secret` | repository, key, value (secret encrypted), visibility |
| `space_event` | repository, time, kind, detail (placement, build, start, sleep, runner lost) |

## 10. What the prototype measured

Lab: a control plane and gateway on a laptop-class machine, a CPU runner and a GTX 1660 Ti runner on the same
machine, and a runner on a shared 8×H200 host (one idle GPU used; the other seven belong to other jobs) reaching the site
through an SSH reverse forward. Single process, state in memory, own minimal tunnel. **Indicative only.**

| Check | Result |
|---|---|
| Registration | one-time token; reuse and a wrong token both refused (403) |
| Cold start, image cached | static / Docker under 1 s; Gradio 2.1–2.5 s |
| First Gradio build | 33 s through a pip mirror |
| Wake from sleep | about 0.9 s |
| Gradio in the page | real browser, iframe on the hub page, input and click gave the right output |
| SSE through the tunnel | five events 0.5 s apart arrived 0.5 s apart (not buffered) |
| WebSocket through the tunnel | text and a 200 KB binary frame echoed correctly (40 ms) |
| Tunnel cost | loopback: 2.1 ms median for a small request, 241 MB/s; remote runner: 237 ms median (the network round trip of that path), 115 MB/s |
| GPU in a container | 1660 Ti: 5.7 GB seen; H200: 143 GB seen; one GPU visible in each |
| Scheduling | one GPU per runner honoured; CPU Spaces refused by GPU runners; a paused runner gets nothing |
| Private Space | no token 401; signed token gives a host-scoped cookie; another Space's token refused |
| Runner link cut | offline after 30 s, Space `runner_lost` at 32 s, requests answered 502 meanwhile |
| Link restored | runner reconnected by itself in 5 s; the next request placed the Space again and it answered in 7.4 s |
| Hostile Space (rootless) | see section 7 |
| Hostile Space (rootful, GCP) | metadata server reachable |

Not tested: Kubernetes, Nomad, gVisor, Kata, persistent storage, build secrets, OAuth, many runners, long soak, large images.

## 11. Phases

1. Control plane and runner protocol (register, heartbeat, jobs, tunnel); `static` and `docker` SDKs; the per-Space host
   and gateway; iframe on the repository page; sleep and wake; the HF runtime API; admin pages for runners.
2. `gradio` SDK; variables and secrets; hardware flavors; GPU runners; the egress policy; the reconcile loop.
3. Persistent storage; shared build cache; `preload_from_hub` (models pulled to the runner ahead of start); Streamlit; OAuth.
4. Optional gVisor or Kata; replicas; custom domains.

## 12. Open questions

1. Who may attach a runner: site operators only, or users and organizations for their own Spaces?
2. Is there an independent domain with a wildcard certificate for the Space hosts?
3. Do hardware flavors count against quotas, and how is GPU time accounted?
4. Which SDKs in the first release? (This page proposes static, Docker, Gradio.)
5. Do we ship our own tunnel or adopt one (frp, chisel, rathole)? A proven tunnel handles reconnection, back-pressure and
   limits better than a first version we write.
6. Which runner capabilities must the site know (BuildKit, GPU method, runtime classes, egress policy applied)?

## References

- Hugging Face: [Spaces overview](https://huggingface.co/docs/hub/spaces-overview),
  [Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker),
  [configuration reference](https://huggingface.co/docs/hub/spaces-config-reference)
- [Nomad vs Kubernetes](https://markaicode.com/vs/nomad-vs-kubernetes/) (a comparison blog with sponsored parts; read with care)
- [Container-to-VM runtimes compared](https://rywalker.com/research/container-vm-runtimes),
  [The state of microVM isolation in 2026](https://emirb.github.io/blog/microvm-2026/) (secondary sources)
