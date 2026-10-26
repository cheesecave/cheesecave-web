# ONNX Space third-party sources and licenses

CheeseCave includes the following modified MIT-licensed sources. Their original copyright notices and licenses remain in each retained source tree and package. The copied source trees do not contain nested Git repositories.

| Project | Upstream source | Pinned source revision | Local directory |
| --- | --- | --- | --- |
| FormCreate | https://github.com/xaboy/form-create | v3.3.5 / `0b431bc0cbe9dd7a4760ae94e4f64fd71a315946` | `vendor-src/form-create` |
| FcDesigner | https://github.com/xaboy/form-create-designer | v3.5.0 / `02485bc95ab8c86e9b9613101709d22d480dc598` | `vendor-src/form-create-designer` |

`upstream.json` records the source pins. The original prototype customized these checkouts on its local `cheesecave/element-plus-only` branches. This repository vendors that modified source, rather than their public registry distributions.

## FormCreate and FcDesigner modifications

- Keep the Vue 3 Element Plus renderer and designer only. The upstream `element-ui` directory and package name refer to Element Plus in these releases.
- Remove other UI-library adapters, examples and build targets, and the unused WangEditor wrapper and dependency.
- Disable the upstream standalone HTML exporter, which embedded public CDN packages. The Space editor saves validated data-only configuration for the application renderer.
- Compile shared core, utilities and Element Plus wrappers directly from the retained source. Neither these internals nor the two application-facing packages are downloaded from a public package registry.
- Preserve column geometry in the designer drag wrappers, and avoid duplicate gutters in nested layout drop zones.
- Prevent ancestor-container copying from duplicating a unique inference component.
- Replace the form-settings inspector with CheeseCave's native task/resources panel, preserving the component selection when switching tabs.
- Adapt designer chrome colors to the host application's Element Plus theme tokens.
- Use private workspace package manifests and the enclosing application's source build, with no package publication or CDN metadata.

## Build and distribution

The workspace links `@form-create/designer` and `@form-create/element-ui` to these local source packages. `pnpm build:vendor` compiles their Vue and JSX sources and bundles the shared local internals, while Vue and Element Plus remain host dependencies. The generated `vendor-src/build-report.json` records compiled modules and rejects registry FormCreate modules. Generated package output is not checked in.

`pnpm dev` and `pnpm build` prepare these packages and the browser runtime first. Test commands also build the source packages before loading tests, including in a clean CI checkout. The existing application `prebuild` documentation step is retained. `pnpm install --frozen-lockfile` installs the ordinary build and helper dependencies using the committed lockfile. The Docker build copies the workspace and vendored source before installation.

## ONNX Runtime Web

The browser runtime is the unmodified `onnxruntime-web` package, pinned to **1.30.0** in the dependency lockfile. Its upstream is https://github.com/microsoft/onnxruntime and its license is MIT. The official license and third-party notices from the `v1.30.0` tag are retained in `vendor-src/onnxruntime/`:

- https://github.com/microsoft/onnxruntime/blob/v1.30.0/LICENSE
- https://github.com/microsoft/onnxruntime/blob/v1.30.0/ThirdPartyNotices.txt

`pnpm prepare:onnx` copies the WASM and WebGPU ESM entry points and their required standard/asyncify backend files from the installed package into `public/onnx/vendor/`. A generated manifest records each file's size and SHA-256. These assets are served from CheeseCave's own origin; the preparation script does not fetch scripts or models from a CDN.

License copies are generated in `public/onnx/licenses/` and included in the deployed site and Docker image. This integration does not include sample models, sample images, or their licenses. Vue, Element Plus and the ordinary helper dependencies retain their package-provided licenses. CheeseCave's existing main-project licensing and attribution remain unchanged.
