---
title: Repository Invitation Access
description: Invitation pages, applications, account grants and bounded visitor previews
icon: i-carbon-email
---

# Repository invitation access

Public and Private retain their existing behavior. Invite keeps repository content
private and publishes an invitation page at the repository URL. The browser checks
`GET /api/{type}s/{namespace}/{name}/access` before mounting ordinary repository
pages, including direct tree, blob and history URLs. This is separate from HF
gated repositories; it does not add gated APIs.

## Invitation page

The page reads `INVITE.MD` from the default branch root, or displays a default
application page when it is absent. Treat this file as public prose. The public
renderer omits embedded media and raw HTML and disables relative, root-relative
and same-origin resource links. It does not publish other private repository files.
Use ordinary external HTTP(S) links or plain text instructions.

Signed-in applications are reviewed by a repository manager; approval grants that
account repository read access directly. Anonymous applications require an email;
their status receipt is retained in the current browser session. After approving
an anonymous application, the manager explicitly creates a repository code and
shares it with the applicant. Approval alone never creates a code.

## Management and code redemption

Managers use the **Repository access** settings tab to review applications, issue
codes, grant account access, revoke grants, revoke visitor sessions and inspect
audit records. Code secrets are displayed once. Keep them separate from links;
share the repository identity and `/repo-access` redemption page with the code.

Both Private and Invite repositories can issue codes. An existing account binds
a code through `/repo-access`, or directly on an invitation page. Registration has
an optional repository-code field even when registration is open. Repository codes
do not replace required site registration invitations. They grant access to one
repository without organizational membership or access to other private content.
HF clients use the registered account's own normal personal access token.

Code redemption expiry, account grant expiry and visitor lifetime are independent.
Revoking a code stops future redemption and its derived visitor sessions. Revoke
an already-bound account grant as a separate management action.

## Temporary previews

Without creating an account, enter a code on the invitation page or `/repo-access`
and choose **Open temporary web preview**. A separate, expiring repository visitor
session provides only controlled previews. It does not replace an existing login.
End temporary access from the preview page without logging out of the account.

The first release supports bounded text excerpts, raster thumbnails, limited
CSV/TSV/JSONL rows and file metadata. The browser consumes only the controlled
`access/guest/tree` and `access/guest/preview` APIs. It receives no original file,
object-storage URL or arbitrary byte-range interface. Directory listings are capped
at 100 entries and indicate when more entries are unavailable.

PDF, video, audio, archives (including TAR), Parquet and browser model inference
are unavailable in temporary previews. LFS-backed files provide metadata only in
this release. Unsupported files explain this limit instead of falling back to a
raw download. These limits apply on the backend as well as in the interface.

Temporary access prohibits original-file and bulk downloads. Content already
displayed in a browser can still be copied or saved; this is not absolute copy
protection.
