# Browser ONNX demos in Spaces

[简体中文](onnx-spaces.zh-CN.md)

A Space can optionally run an image model in the visitor's browser. The Hub renders
the demo and its editor directly in Vue; it does not embed a separate site or iframe.
This option does not change the Space SDK, README card, or Runner configuration.

## Enable and edit

When creating a Space, select **Enable browser ONNX** alongside the existing SDK
choice. The repository is created first, then the ONNX configuration is committed.
If the second step fails, the page keeps the created repository and offers a retry
that only enables ONNX; it does not create another repository.

For an existing Space, open **Settings → General → Browser ONNX demo** and enable it.
**Edit demo** opens `/spaces/{namespace}/{name}/onnx-editor/{revision}`. The editor
uses the available Hub layout width and height and follows its theme. Editing needs
write permission: the owner or an organization member, admin, or super-admin.
External fallback repositories cannot be edited here.

The shared **App** tab shows the saved browser demo when enabled. An enabled Space
without a saved demo shows a configuration placeholder. When disabled, the existing
App content remains in place. Turning the option off retains the saved demo.

## Choose repository files

Upload the ONNX model and any label or sample files to the Space's normal file tree.
The editor selects files from the current repository and revision. A sample image is
optional; visitors can select a local image instead.

Selecting a model reads its actual bytes, SHA-256, tensor names, types, and shapes.
These facts are displayed rather than entered by the author. Fixed dimensions and
unambiguous layouts are filled automatically; dynamic dimensions or ambiguous
layouts need an explicit choice. If the model has several outputs, select the one
the demo should decode. The editor can read labels from a selected JSON file and
tries a unique `labels.json` or `meta.json` next to the model.

Tensor metadata does not specify the complete model semantics. Authors must still
choose the appropriate task, RGB/BGR order, resize interpolation, scale, mean/std,
labels, and score activation. In particular, a model that already applies softmax
should use **none** for additional score activation. Generating the interface from
the task configuration creates matching input, controls, and result components;
the canvas can then be rearranged without writing JSON.

## Supported execution

The current pipeline accepts one four-dimensional `float32` image input with batch
size one, using NCHW or NHWC layout. It stretches the image to the configured size,
supports bilinear or bicubic interpolation, and applies channel scaling and
normalization. The selected `float32` output can be decoded as YOLO-style bounding
boxes or image classification scores. Multi-input models, unsupported tensor types,
and models requiring separate external tensor data are rejected. This is a
controlled image inference pipeline, not arbitrary ONNX graph preprocessing or
application code execution.

Inference runs in a Web Worker using ONNX Runtime Web. **Auto** tries WebGPU and
falls back to WASM if WebGPU initialization fails. Model inspection and execution
require a secure context, normally HTTPS or localhost, because SHA-256 verification
uses the Web Crypto API in both modes. WebGPU also requires browser and device
support. WASM works without
cross-origin isolation; in that environment it uses one thread. Explicit WASM may
use up to four threads when cross-origin isolation is available. The status panel
reports the actual calculation method and measured timings.

## Repository contract

The optional manifest is `.cheesecave/onnx-space.json`:

```json
{
  "version": 1,
  "enabled": true,
  "document": null
}
```

Missing means disabled. `enabled: true` with `document: null` means enabled but not
configured. A saved `document` is the validated DemoDocument containing the UI,
model resource, image pipeline, parameters, and component bindings. Its schema
version is independent of the manifest version. Disabling preserves this document.
The file is independent of `README.md` and its `sdk` metadata.

Loading pins the configuration read to a repository commit. Model, sample, and
label URLs are confined to the same Space and rebound to the viewed revision.
Editor, settings, and App links preserve that revision. Saving writes only the
manifest through the existing commit API, with `parentCommit` from the last load or
save. A concurrent repository change produces a conflict; reload and reconcile
before saving again. A failed editor reload leaves the current draft mounted.

The Hub accepts only allowlisted, pure-data component configuration. It does not
restore serialized functions, scripts, event handlers, or arbitrary fetch rules.
Repository authorization and normal authenticated resource access still apply.

## Local build dependencies

FormCreate and FcDesigner are built from the checked-in, Element Plus-only forks in
`vendor-src/`, referenced with `workspace:*`. Do not replace them with registry
FormCreate packages. `pnpm prepare:space` builds these sources and prepares the
pinned ONNX Runtime Web assets for same-origin serving. `pnpm dev` and `pnpm build`
run this preparation automatically.

Runtime assets and third-party notices are served locally. No external runtime CDN
is needed. Model weights belong in users' Space repositories, not in the web
application's source tree or production image.
