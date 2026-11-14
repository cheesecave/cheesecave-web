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

In repository Settings, **Repository access** has four independently paginated
tables for applications, repository codes, account grants and the audit log.
Managers can approve or reject applications, issue and revoke codes, and revoke
account grants. A code is displayed once when issued.

Both Private and Invite repositories can issue codes. An existing account signs
in at `/repo-access`, enters the code and selects **Open repository**. The page grants
read access to the code's repository and opens it in one step.

The registration page has one **Invitation code** field for site and repository
codes. **Sign Up** in the invitation dialog or an eligible visitor preview carries
the repository invitation into registration. Signup and any required verification
return the user to that repository after sign-in. An invitation-only site requires
a site registration code. For HF access, use the authorized account's own personal
access token.

Each code can be bound to one account. Before binding, a valid code can open more
than one temporary preview without consuming the account exchange. Code redemption
expiry, account grant expiry and visitor lifetime are independent. Revoking a code
stops new exchanges and its derived visitor sessions. Revoke an account grant
separately. Previously signed download URLs retain their own expiration.

## Temporary previews

On the repository invitation page, enter a code and select **Open temporary web
preview**. The independent visitor session expires on its own. **End access**
ends that session while preserving the user's account login.

The visitor view provides paginated directory and commit history listings, file
metadata, bounded text and CSV/TSV/JSONL samples, raster thumbnails, rendered PDF
pages and transcoded audio and video. Supported PDF and audio/video files can also
be previewed from repository-scoped LFS objects. Archives, Parquet and model
weights provide metadata. The preview APIs serve bounded content and generated
media and enforce repository scope on each request.

The server denies original-file downloads and bulk downloads for visitors. Content
displayed in a browser can still be copied or saved.

## Coordinated release

Deploy the Backend and migrations 043/044 before this Web build: repository pages
use the new access preflight even for ordinary repositories. Roll Web back before
rolling Backend back. The [shared release guide](https://github.com/cheesecave/cheesecave-backend/blob/feat/invite-repo/docs/deployment/invitation-repositories.md)
contains review findings, migration rehearsal, acceptance checks and rollback order.
