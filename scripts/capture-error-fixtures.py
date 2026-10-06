#!/usr/bin/env python3
"""Capture the error responses the SPA has to understand from a running backend.

The backend gives its native endpoints no error code, so the SPA infers what an
error means from the status, the X-Error-* headers and the shape and wording of
the body (src/errors/decode.js). This script records those responses as
fixtures, so the decoder is tested against what the backend really sends, and
a change in the backend shows up as a diff of the fixture file.

    uv run --with requests python scripts/capture-error-fixtures.py \
        --base http://127.0.0.1:48888 --user alice --password ... \
        --repo-owner alice --repo some-private-repo --org some-org

Only requests that fail are sent (nonexistent targets, empty bodies, wrong
credentials): nothing is created or changed. A few shapes cannot be provoked
safely (an unhandled exception, a proxy's HTML page); those are listed under
`synthetic` in test/fixtures/errors/synthetic.json, written by hand.
"""
import argparse
import json
import sys

import requests

KEEP_HEADERS = ("x-error-code", "x-error-message", "x-request-id", "retry-after", "content-type", "www-authenticate")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--repo-owner", required=True)
    ap.add_argument("--repo", required=True, help="an existing private dataset of --repo-owner")
    ap.add_argument("--org", required=True, help="an existing organization")
    ap.add_argument("--out", default="test/fixtures/errors/real.json")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    session = requests.Session()
    session.trust_env = False
    if session.post(f"{base}/api/auth/login", json={"username": a.user, "password": a.password}).status_code != 200:
        sys.exit("login failed")
    anon = requests.Session()
    anon.trust_env = False
    repo = f"{a.repo_owner}/{a.repo}"
    cases = [
        # name, session, method, path, json body
        ("token-missing", session, "DELETE", "/api/auth/tokens/0", {}),
        ("preupload-anonymous", anon, "POST", "/api/datasets/nobody-ns/nothing/preupload/main", {}),
        ("commits-private-repo-anonymous", anon, "GET", f"/api/datasets/{repo}/commits/main", None),
        ("repo-info-no-fallback-source", anon, "GET", "/api/datasets/nobody-ns/nothing", None),
        ("tree-missing-branch", session, "GET", f"/api/datasets/{repo}/tree/nope-branch", None),
        ("resolve-missing-file", session, "HEAD", f"/datasets/{repo}/resolve/main/nope.txt", None),
        ("org-missing", session, "GET", "/org/no-such-org", None),
        ("unknown-api-route", anon, "GET", "/api/no-such-thing", None),
        ("method-not-allowed", anon, "PATCH", "/api/auth/login", {}),
        ("auth-me-anonymous", anon, "GET", "/api/auth/me", None),
        ("login-wrong-password", anon, "POST", "/api/auth/login", {"username": a.user, "password": "wrong"}),
        ("admin-without-token", anon, "GET", "/admin/api/users", None),
        ("quota-recalculate-anonymous", anon, "POST", "/api/quota/nobody-ns/recalculate", {}),
        ("external-tokens-anonymous", anon, "GET", f"/api/users/{a.user}/external-tokens", None),
        ("other-users-settings", session, "PUT", "/api/users/someone-else/settings", {}),
        ("register-existing-username", anon, "POST", "/api/auth/register", {"username": a.user, "email": "x@example.com", "password": "Passw0rd!x"}),
        ("org-exists", session, "POST", "/org/create", {"name": a.org}),
        ("repo-exists", session, "POST", "/api/repos/create", {"type": "dataset", "name": a.repo, "private": True}),
        ("repo-create-missing-fields", session, "POST", "/api/repos/create", {}),
        ("repo-create-bad-enum", session, "POST", "/api/repos/create", {"type": "banana", "name": "x1"}),
        ("lfs-batch-bad-request", anon, "POST", "/nobody-ns/nothing.git/info/lfs/objects/batch", {}),
        ("viewer-rate-limited", anon, "POST", "/api/dataset-viewer/tar/list", {}),
        ("repo-create-name-too-long", session, "POST", "/api/repos/create", {"type": "dataset", "name": "x" * 300, "private": True}),
    ]
    out = []
    for name, sess, method, path, body in cases:
        kw = {"timeout": 20, "allow_redirects": False}
        if body is not None:
            kw["json"] = body
        try:
            r = sess.request(method, base + path, **kw)
        except requests.RequestException as e:
            print(f"skip {name}: {e}", file=sys.stderr)
            continue
        try:
            parsed = r.json() if r.content else None
        except ValueError:
            parsed = r.text[:500]
        out.append({
            "name": name,
            "request": {"method": method, "path": path},
            "response": {"status": r.status_code, "headers": {k: r.headers[k] for k in KEEP_HEADERS if k in r.headers}, "body": parsed},
        })
        print(f"{r.status_code} {name}")
    with open(a.out, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
