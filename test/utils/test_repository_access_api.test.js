import { describe, expect, it, vi } from "vitest";
import api, { repositoryAccessAPI as access, authAPI } from "@/utils/api";
const repo = { type: "dataset", namespace: "an owner", name: "data.v1" };
const base = "/api/datasets/an%20owner/data.v1/access";
describe("repository access API contract", () => {
  it("uses controlled overview, complete file pages and history without raw endpoints", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({});
    get.mockClear();
    await access.guestOverview(repo);
    await access.guestFileInfo(repo, "folder/README.md");
    await access.guestTree(repo, "folder", {
      cursor: "signed-page",
      search: "read",
    });
    await access.guestCommits(repo, { cursor: "signed-history" });
    expect(get.mock.calls).toEqual([
      [`${base}/guest/overview`],
      [`${base}/guest/file-info`, { params: { path: "folder/README.md" } }],
      [
        `${base}/guest/tree`,
        { params: { path: "folder", cursor: "signed-page", search: "read" } },
      ],
      [`${base}/guest/commits`, { params: { cursor: "signed-history" } }],
    ]);
  });
  it("keeps site invitations in query and repository codes in the registration body", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    await authAPI.register({
      username: "reader",
      invitation_token: "site-code",
      repo_invitation_token: "repo_code",
    });
    expect(post).toHaveBeenCalledWith(
      "/api/auth/register",
      { username: "reader", repo_invitation_token: "repo_code" },
      { params: { invitation_token: "site-code" } },
    );
  });
  it("uses scoped explicit endpoints and never promotes a repo code to Authorization", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({});
    const get = vi.spyOn(api, "get").mockResolvedValue({});
    const del = vi.spyOn(api, "delete").mockResolvedValue({});
    localStorage.setItem("hf_token", "normal-token");
    await access.getAccess(repo);
    await access.getRequest(repo, "receipt");
    await access.manage(repo, { offset: 100 });
    await access.guestTree(repo, "folder");
    await access.guestPreview(repo, "file");
    await access.bind(repo, "repo_code");
    await access.guest(repo, "repo_code");
    await access.leaveGuest(repo);
    await access.revokeGuest(repo, 8);
    expect(get.mock.calls).toEqual([
      [base],
      [
        `${base}/request`,
        { headers: { "X-Repository-Request-Receipt": "receipt" } },
      ],
      [`${base}/manage`, { params: { offset: 100 } }],
      [`${base}/guest/tree`, { params: { path: "folder" } }],
      [`${base}/guest/preview`, { params: { path: "file" } }],
    ]);
    expect(post.mock.calls).toEqual([
      [`${base}/bind`, { token: "repo_code" }],
      [`${base}/guest`, { token: "repo_code" }],
      [`${base}/guests/8/revoke`],
    ]);
    expect(del).toHaveBeenCalledWith(`${base}/guest`);
    expect(localStorage.getItem("hf_token")).toBe("normal-token");
    expect(api.defaults.withCredentials).toBe(true);
  });
});
