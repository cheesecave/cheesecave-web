# CheeseCave Web: notices

This is an independent derivative of KohakuHub by KohakuBlueLeaf and DeepGHS/KohakuHub, not an official or endorsed release.
Original author credits, copyright notices and licenses remain in the source and provenance files. Core code retains GNU Affero General Public License version 3 terms; see [LICENSE](LICENSE). The software is provided without warranty under its applicable licenses.

## Modifications

CheeseCave modifications dated 2026-10-04 include repository splitting and naming, standalone builds/deployment, bilingual documentation, configurable homepage/site appearance, repository discovery, following/activity workspaces and manual regression CI. Original project history and scope are documented in [provenance/UPSTREAM.md](provenance/UPSTREAM.md). No upstream license is replaced by this notice.

## License scope

All code in this repository is under the GNU Affero General Public License version 3; see [LICENSE](LICENSE), apart from the vendored third-party code listed below, which keeps its own notices.
The Dataset Viewer, which earlier builds carried at `src/components/DatasetViewer/` under its separate Kohaku Software License 1.0, was removed on 2026-10-08; it is no longer part of this repository or of the deployed application. Copies of earlier builds that still contain it remain under the terms they were distributed with, and its license text remains in the git history. [LICENSING.md](LICENSING.md) keeps the original upstream text for provenance.

## Vendored third-party code

The zip preview vendors two decoders under `src/vendor/`, each file keeping its original notice:

- `src/vendor/seek-bzip/`: bzip2 decoder from [seek-bzip](https://github.com/cscott/seek-bzip) 2.0.0, MIT License, Copyright (C) 2013 C. Scott Ananian, (C) 2012 Eli Skeggs, (C) 2011 Kevin Kwok. Merged into one ES module and switched from Node `Buffer` to `Uint8Array`.
- `src/vendor/hwzip/`: Shrink, Reduce and Implode decoders, JavaScript ports of [hwzip](https://www.hanshq.net/zip.html) 2.4 by Hans Wennborg (public domain), taken from the [zip.js](https://github.com/gildas-lormeau/zip.js) test suite (BSD-3-Clause).

It also depends on `@zip.js/zip.js` (BSD-3-Clause), `fzstd` (MIT), `lzma1` (Apache-2.0) and `xz-decompress` (MIT, bundling xz-embedded, public domain, and walloc, MIT), installed through `package.json`.

## Source and build information

The complete application is assembled from [backend](https://github.com/cheesecave/cheesecave-backend), [website](https://github.com/cheesecave/cheesecave-web) and [Admin](https://github.com/cheesecave/cheesecave-admin). Their README files, lock files, build scripts and Docker/Compose files contain build and installation instructions. The repositories currently remain private; this does not constitute a public source offer to users without repository access. Before serving outside users or distributing builds, provide recipients access to the corresponding deployed source, including the relevant components and build configuration.
