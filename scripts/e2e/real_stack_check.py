#!/usr/bin/env python3
"""End-to-end check of the repository page against a real backend (not part of CI).

The pieces are real: a CheeseCave backend with its PostgreSQL, LakeFS and S3; `huggingface_hub`
(any version, it creates and reads the repositories); a Chromium that opens the web (the Vite dev
server, or a build behind the same proxy). Three commands, run in turn with the interpreter that has
what each needs:

  seed     (huggingface_hub)  create a model without a README, a model with one and a Space, with the
                              files of a real model; wait for the backend to sum the weights
  browser  (playwright)       open those pages and check what the user sees and what the page asks
                              for, then create a Space through the create form
  cross    (huggingface_hub)  read back, with the client, what the browser created

usage: real_stack_check.py {seed|browser|cross} --tag T --api URL --web URL [--weights DIR]
  --weights: a folder with config.json and model.safetensors (a real small model)
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

USER, PASSWORD = "e2e", "password123456"
CARD = b"---\nlicense: mit\nlanguage:\n- en\ntags:\n- exbert\n---\n# A model\n"


def fmt_params(count):
    """The page's `formatParameters`: three significant digits, K / M / B."""
    for suffix, size in (("", 1), ("K", 1e3), ("M", 1e6)):
        value = count / size
        rounded = round(value, 0 if value >= 100 else 1 if value >= 10 else 2)
        if rounded < 1000:
            return f"{rounded:g}{suffix}"
    value = count / 1e9
    return f"{round(value, 0 if value >= 100 else 1 if value >= 10 else 2):g}B"


def state_path(tag):
    return Path(f"/tmp/e2e-state-{tag}.json")


def token(api):
    import httpx

    client = httpx.Client(base_url=api, trust_env=False, timeout=60)
    client.post("/api/auth/register", json={"username": USER, "email": f"{USER}@example.com", "password": PASSWORD})
    client.post("/api/auth/login", json={"username": USER, "password": PASSWORD}).raise_for_status()
    return client.post("/api/auth/tokens/create", json={"name": "e2e"}).json()["token"]


def seed(args):
    import huggingface_hub
    from huggingface_hub import HfApi

    api = HfApi(endpoint=args.api, token=token(args.api))
    weights = Path(args.weights)
    names = {"bare": f"{USER}/bare-{args.tag}", "carded": f"{USER}/carded-{args.tag}", "space": f"{USER}/space-{args.tag}"}
    for key in ("bare", "carded"):
        api.create_repo(names[key], exist_ok=True)
        for name in ("config.json", "model.safetensors"):
            api.upload_file(path_or_fileobj=str(weights / name), path_in_repo=name, repo_id=names[key])
    api.upload_file(path_or_fileobj=CARD, path_in_repo="README.md", repo_id=names["carded"])
    api.create_repo(names["space"], repo_type="space", space_sdk="static", exist_ok=True)
    api.upload_file(path_or_fileobj=b"<h1>hi</h1>", path_in_repo="index.html", repo_id=names["space"], repo_type="space")

    info = None
    for _ in range(80):  # the weights are summed in the background after the commit
        info = api.model_info(names["bare"])
        if info.safetensors:
            break
        time.sleep(0.25)
    summary = info.safetensors if isinstance(info.safetensors, dict) else info.safetensors.__dict__
    total = summary["total"]
    config = json.loads((weights / "config.json").read_text())
    state = {"names": names, "total": total, "size": fmt_params(total), "client": huggingface_hub.__version__,
             "library": info.library_name, "task": info.pipeline_tag,
             "architectures": config.get("architectures") or [], "model_type": config.get("model_type")}
    state_path(args.tag).write_text(json.dumps(state))
    print("seeded", state)


def browser(args):
    from playwright.sync_api import sync_playwright

    state = json.loads(state_path(args.tag).read_text())
    names, failures = state["names"], []

    def check(name, ok, detail=""):
        print(("OK  " if ok else "FAIL"), name, detail, flush=True)
        if not ok:
            failures.append(name)

    with sync_playwright() as p:
        browser_ = p.chromium.launch()
        page = browser_.new_context(viewport={"width": 1280, "height": 800}).new_page()

        def open_(path):
            seen = []

            def record(response):
                if re.search(r"/api/\w+/e2e/[^/?]+\?expand", response.url):
                    seen.append((response.status, response.url))

            page.on("response", record)
            page.goto(f"{args.web}{path}", wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(600)
            page.remove_listener("response", record)
            return seen

        for key, label in (("bare", "a model with no README"), ("carded", "a model with a README")):
            seen = open_(f"/models/{names[key]}")
            header = page.locator(".metadata-header").inner_text()
            aside = page.locator("aside").inner_text()
            check(f"{label}: the info request is answered", [s for s, _ in seen] == [200], str(seen[:2]))
            check(f"{label}: it asks for the model's fields and never the file list",
                  all("expand=safetensors" in u and "siblings" not in u for _, u in seen))
            check(f"{label}: chips for library and frameworks", all(w in header for w in ("Transformers", "Safetensors")), header.replace("\n", " | ")[:90])
            check(f"{label}: the model card gives the size {state['size']} params", f"{state['size']} params" in aside, aside.replace("\n", " ")[:120])
            # the card shows what the model's config has, and only that
            for row, wanted in (("Architecture", state["architectures"]), ("Model type", [state["model_type"]] if state["model_type"] else [])):
                check(f"{label}: {row} {'is shown' if wanted else 'is not shown (the config has none)'}",
                      (row in aside) == bool(wanted) and all(w in aside for w in wanted), str(wanted))
            if key == "carded":
                check("a model with a README: its own tag, license and language still show", all(w in header for w in ("exbert", "MIT", "English")), header.replace("\n", " | ")[:120])

        seen = open_(f"/spaces/{names['space']}")
        check("a Space: its page loads (no 400 on the info request)", [s for s, _ in seen] == [200], str(seen[:2]))
        check("a Space: the SDK chip", "Static" in page.locator(".metadata-header").inner_text())
        check("a Space: no download count", "downloads" not in page.inner_text("main"))

        # a chip leads to the filtered discovery page
        open_(f"/models/{names['carded']}")
        page.locator(".metadata-header a", has_text="Safetensors").first.click()
        page.wait_for_url(re.compile(r"/models\?.*tag=safetensors"), timeout=15000)
        page.wait_for_load_state("networkidle")
        check("a chip leads to the discovery page filtered by it", "tag=safetensors" in page.url, page.url)

        # create a Space through the form, with an SDK that is not the default
        page.request.post(f"{args.web}/api/auth/login", data={"username": USER, "password": PASSWORD}).ok
        ui_name = f"ui-{args.tag}-{int(time.time())}"  # a name no earlier run used: a taken one is refused
        state["ui"] = f"{USER}/{ui_name}"
        state_path(args.tag).write_text(json.dumps(state))
        page.goto(f"{args.web}/new?type=space", wait_until="networkidle")
        page.get_by_placeholder("my-awesome-space").fill(ui_name)
        page.locator(".el-select").nth(1).click()  # the owner is the first select, the SDK the second
        page.locator(".el-select-dropdown__item", has_text="Streamlit").click()
        page.get_by_role("button", name=re.compile("Create Space")).click()
        page.wait_for_url(re.compile(rf"/spaces/{USER}/{ui_name}"), timeout=30000)
        page.wait_for_timeout(1500)
        check("the form created the Space and its page shows the SDK", "Streamlit" in page.locator(".metadata-header").inner_text())
        browser_.close()
    sys.exit(1 if failures else 0)


def cross(args):
    from huggingface_hub import HfApi

    state = json.loads(state_path(args.tag).read_text())
    api = HfApi(endpoint=args.api, token=token(args.api))
    ui = state["ui"]
    info = api.space_info(ui)
    files = api.list_repo_files(ui, repo_type="space")
    ok = info.sdk == "streamlit" and files == ["README.md"]
    print("OK  " if ok else "FAIL", f"the client reads the Space the browser created: sdk={info.sdk} files={files} (huggingface_hub {state['client']})")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["seed", "browser", "cross"])
    parser.add_argument("--tag", required=True)
    parser.add_argument("--api", required=True)
    parser.add_argument("--web", required=True)
    parser.add_argument("--weights")
    arguments = parser.parse_args()
    {"seed": seed, "browser": browser, "cross": cross}[arguments.command](arguments)
