# CheeseCave web: upstream source provenance

This independent CheeseCave component derives from
[KohakuHub by KohakuBlueLeaf](https://github.com/KohakuBlueleaf/KohakuHub) and
[the deepghs fork](https://github.com/deepghs/KohakuHub).
It is not an official release of either upstream project.

## Remote source snapshot

- Repository: https://github.com/deepghs/KohakuHub.git
- Branch: `main`
- Original source commit: `58f81016722c2f1957b570deefd9b4c0eef68f9a`
- Original component: `src/kohaku-hub-ui/`
- Destination: https://github.com/cheesecave/cheesecave-web
- CI removal preparation commit (in backend history): `0b4051747ffddc7d2dae436f897c7fcdb996fe15`
- Split date: 2026-10-04 (Asia/Hong_Kong).

## Fresh history

This frontend starts with a new Git history, as requested. Its first commit is
named **从原仓库分叉** and contains the remote component snapshot after CI removal, with paths
extracted to this repository root and its shared modules, tests, assets and
licensing information included. A preparatory commit removes inherited CI
configuration from the monorepo before the component is extracted. Extracted
source code and licenses are verified against that snapshot. Repository READMEs
are authored in English, with a Chinese copy, from the initial commit. Original
upstream Git commits are not imported.

Later commits adapt that snapshot for CheeseCave standalone development and
apply genuinely unpublished local regression-test work separately. Work already
merged in the remote snapshot is not replayed. Full original history and local
working files remain backed up outside these frontend repositories. The backend
repository follows a different policy and retains the complete original Git history.

## Licenses and project information

The original root `LICENSE` text is preserved. The upstream `LICENSING.md` guide moved to `provenance/LICENSING.upstream.md`; the root `LICENSING.md` now states the AGPL-3.0 licence and this origin. Core code keeps
its AGPL-3.0 terms. The web Dataset Viewer, which retained its separate license at
`src/components/DatasetViewer/LICENSE`, was removed on 2026-10-08; its license text
and history remain in the git history. Historical monorepo paths in LICENSING.md
are kept as source information. Rebranding and separate repositories do not replace license terms.
Original copyright notices and author attribution remain credited.

See `README.upstream.md` and `CHANGELOG.upstream.md` for original project
information. Compatibility API paths, browser cache keys and protocol identities
are retained. CheeseCave is the new default display name.

The original repository has not been archived. This split does not claim to resolve
or close inherited upstream issues.
