---
title: Configuration Reference
description: All environment variables and settings for KohakuHub.
icon: i-carbon-settings-adjust
---

# Configuration Reference

KohakuHub can be configured via a `config.toml` file or by setting environment variables. Environment variables will always override values from a `config.toml` file.

By default, the application looks for `config.toml` in the current working directory. You can specify a different path using the `HUB_CONFIG` environment variable.

## Variable names

Every setting below is read from `CHEESE_CAVE_<NAME>`. The older `KOHAKU_HUB_<NAME>` is still accepted as a fallback, so a deployment written before the rename keeps working unchanged. When both are set for the same setting, `CHEESE_CAVE_<NAME>` wins and the `KOHAKU_HUB_<NAME>` value is ignored; an empty value counts as set. The backend repository's `docs/reference/config.md` is the reference for these settings and the notes on Compose and the container entrypoint.

## Application Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_BASE_URL` | The base URL of the application, used for generating links. | `http://localhost:48888` |
| `CHEESE_CAVE_API_BASE` | The base path for the API. | `/api` |
| `CHEESE_CAVE_SITE_NAME` | The name of the site, displayed in the UI. | `KohakuHub` |
| `CHEESE_CAVE_DEBUG_LOG_PAYLOADS`| If `true`, logs request and response payloads for debugging. | `false` |
| `CHEESE_CAVE_REPOSITORY_REVERT_ENABLED` | Enables Revert, effective only when `db_backend` is exactly `postgres`. Set `false` to switch it off; see [Defaults](../api/branches.md#defaults). | `true` |
| `CHEESE_CAVE_REPOSITORY_RESET_ENABLED` | Enables Reset, effective only when `db_backend` is exactly `postgres` and LakeFS is 1.48.1 or later ([LakeFS compatibility](../deployment/lakefs.md)). Set `false` to switch it off; see [Defaults](../api/branches.md#defaults). | `true` |
| `CHEESE_CAVE_REPOSITORY_SQUASH_ENABLED` | Enables Super Squash, effective only when `db_backend` is exactly `postgres`. Set `false` to switch it off; see [Defaults](../api/branches.md#defaults). | `true` |

## Database Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_DB_BACKEND` | The database backend to use. Can be `sqlite` or `postgres`. | `sqlite` |
| `CHEESE_CAVE_DATABASE_URL` | The connection URL for the database. | `sqlite:///./hub.db` |

## S3 Storage Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_S3_PUBLIC_ENDPOINT` | The public-facing S3 endpoint, used for client downloads. | `http://localhost:9000` |
| `CHEESE_CAVE_S3_ENDPOINT` | The internal S3 endpoint for the application. A path after the host names the real bucket: with `https://<account>.r2.cloudflarestorage.com/<bucket>`, `CHEESE_CAVE_S3_BUCKET` is a key prefix inside `<bucket>`, after any further path. The first path segment is always taken as the bucket, so an S3 service mounted under a sub-path of a proxy is not supported. LakeFS's `blockstore.s3.endpoint` must be the same, and `CHEESE_CAVE_S3_PUBLIC_ENDPOINT` must end with the same bucket. | `http://localhost:9000` |
| `CHEESE_CAVE_S3_ACCESS_KEY` | The access key for the S3 bucket. | `test-access-key` |
| `CHEESE_CAVE_S3_SECRET_KEY` | The secret key for the S3 bucket. | `test-secret-key` |
| `CHEESE_CAVE_S3_BUCKET` | The name of the S3 bucket. | `test-bucket` |
| `CHEESE_CAVE_S3_REGION` | The S3 region. | `us-east-1` |
| `CHEESE_CAVE_S3_SIGNATURE_VERSION` | The S3 signature version (e.g., `s3v4` for AWS S3/R2). | `None` |

## LakeFS Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_LAKEFS_ENDPOINT` | The endpoint for the LakeFS server. | `http://localhost:8000` |
| `CHEESE_CAVE_LAKEFS_ACCESS_KEY` | The access key for LakeFS. | `test-access-key` |
| `CHEESE_CAVE_LAKEFS_SECRET_KEY` | The secret key for LakeFS. | `test-secret-key` |
| `CHEESE_CAVE_LAKEFS_REPO_NAMESPACE` | The default namespace for repositories in LakeFS. | `hf` |
| `CHEESE_CAVE_LAKEFS_OPERATION_CONCURRENCY` | Concurrent LakeFS reads one branch operation (reset, revert, merge) makes while recording the regular files it changed. Around 8 saturates LakeFS; more only slows other requests down. | `8` |

## Git LFS Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_LFS_THRESHOLD_BYTES` | The file size threshold in bytes to trigger LFS. | `5242880` (5MB) |
| `CHEESE_CAVE_LFS_MULTIPART_THRESHOLD_BYTES` | The threshold for using multipart uploads for LFS. | `104857600` (100MB) |
| `CHEESE_CAVE_LFS_MULTIPART_CHUNK_SIZE_BYTES` | The chunk size for LFS multipart uploads. | `52428800` (50MB) |
| `CHEESE_CAVE_LFS_KEEP_VERSIONS` | The number of LFS file versions to keep during garbage collection. | `5` |
| `CHEESE_CAVE_LFS_AUTO_GC` | If `true`, LFS versions beyond the keep count are collected in the background. | `false` |
| `CHEESE_CAVE_USAGE_RECOUNT_INTERVAL_HOURS` | Repeats the full storage usage recount (`usage.recount`) every this many hours. Usage is kept up to date as repositories change; this is a safety net. `0` turns it off. | `0` |

## Authentication & Session Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_REQUIRE_EMAIL_VERIFICATION` | If `true`, requires email verification for new users. | `false` |
| `CHEESE_CAVE_INVITATION_ONLY` | If `true`, disables public registration and requires an invitation. | `false` |
| `CHEESE_CAVE_SESSION_SECRET` | The secret key for session management. **CHANGE IN PRODUCTION!** | `change-me-in-production` |
| `CHEESE_CAVE_SESSION_EXPIRE_HOURS` | The session cookie expiration time in hours. | `168` (7 days) |
| `CHEESE_CAVE_TOKEN_EXPIRE_DAYS` | The API token expiration time in days. | `365` |

## Admin API Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_ADMIN_ENABLED` | If `true`, enables the admin API. | `true` |
| `CHEESE_CAVE_ADMIN_SECRET_TOKEN` | The secret token for accessing the admin API. **CHANGE IN PRODUCTION!** | `change-me-in-production` |

## Storage Quota Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_DEFAULT_USER_PRIVATE_QUOTA_BYTES` | The default private repo quota for users in bytes. | `None` (unlimited) |
| `CHEESE_CAVE_DEFAULT_USER_PUBLIC_QUOTA_BYTES` | The default public repo quota for users in bytes. | `None` (unlimited) |
| `CHEESE_CAVE_DEFAULT_ORG_PRIVATE_QUOTA_BYTES` | The default private repo quota for organizations in bytes. | `None` (unlimited) |
| `CHEESE_CAVE_DEFAULT_ORG_PUBLIC_QUOTA_BYTES` | The default public repo quota for organizations in bytes. | `None` (unlimited) |

## Fallback Source Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_FALLBACK_ENABLED` | If `true`, enables fallback to external sources. | `true` |
| `CHEESE_CAVE_FALLBACK_CACHE_TTL` | The cache TTL for fallback repo mappings in seconds. | `300` |
| `CHEESE_CAVE_FALLBACK_TIMEOUT` | The HTTP request timeout for external sources in seconds. | `10` |
| `CHEESE_CAVE_FALLBACK_MAX_CONCURRENT` | The max concurrent requests to external sources. | `5` |
| `CHEESE_CAVE_FALLBACK_SOURCES` | A JSON list of global fallback sources. | `[]` |

## Background Task Worker Settings

Used by `khub-worker` (`python -m kohakuhub.worker`). See [Background Tasks](../development/background-tasks.md).

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_WORKER_CONCURRENCY` | Tasks run at once per worker process. | `4` |
| `CHEESE_CAVE_WORKER_LEASE_SECONDS` | A task is reclaimed by another worker if its lease is not renewed for this long. | `60` |
| `CHEESE_CAVE_WORKER_POLL_INTERVAL_SECONDS` | Idle wait between claim attempts. | `1.0` |
| `CHEESE_CAVE_WORKER_SHUTDOWN_GRACE_SECONDS` | Drain time on SIGTERM before running tasks are cancelled. Also how long a task whose cancellation was requested may take to stop on its own before it is interrupted. | `30` |
| `CHEESE_CAVE_WORKER_FLUSH_INTERVAL_SECONDS` | How often a running task's progress and logs are stored and a cancellation request is noticed. The lease is renewed at least every `lease_seconds / 3` regardless. | `5.0` |
| `CHEESE_CAVE_WORKER_LOG_MAX_BYTES_PER_ATTEMPT` | Cap on the log captured for one attempt of a task. Records past it are dropped after a truncation notice. | `10485760` |
| `CHEESE_CAVE_WORKER_SUCCEEDED_RETENTION_DAYS` | Succeeded tasks are deleted after this many days. | `7` |
| `CHEESE_CAVE_WORKER_FAILED_RETENTION_DAYS` | Failed and cancelled tasks are deleted after this many days. | `30` |
| `CHEESE_CAVE_WORKER_NAME` | Optional prefix for the worker name shown in the admin panel (`<name>-<hostname>`). Empty uses the hostname alone, which already tells replicas apart. | `""` |
| `CHEESE_CAVE_WORKER_QUEUES` | Comma-separated queues this worker consumes; empty consumes all. | `""` |

## SMTP (Email) Settings

| Variable | Description | Default |
| --- | --- | --- |
| `CHEESE_CAVE_SMTP_ENABLED` | If `true`, enables SMTP for sending emails. | `false` |
| `CHEESE_CAVE_SMTP_HOST` | The SMTP server host. | `localhost` |
| `CHEESE_CAVE_SMTP_PORT` | The SMTP server port. | `587` |
| `CHEESE_CAVE_SMTP_USERNAME` | The username for SMTP authentication. | `""` |
| `CHEESE_CAVE_SMTP_PASSWORD` | The password for SMTP authentication. | `""` |
| `CHEESE_CAVE_SMTP_FROM` | The "from" email address for outgoing emails. | `noreply@localhost` |
| `CHEESE_CAVE_SMTP_TLS` | If `true`, uses TLS for SMTP connections. | `true` |
