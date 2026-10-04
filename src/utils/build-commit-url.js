export function buildCommitUrl(projectUrl, commit) {
  if (typeof commit !== "string" || !/^[a-f\d]{40}$/i.test(commit)) return null;
  try {
    const url = new URL(projectUrl);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.hostname !== "github.com" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return null;
    const match = url.pathname.match(
      /^\/([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\/([a-z\d_.-]+)\/?$/i,
    );
    if (!match || [".", ".."].includes(match[2])) return null;
    const repository = match[2].replace(/\.git$/i, "");
    if (!repository || [".", ".."].includes(repository)) return null;
    return `https://github.com/${match[1]}/${repository}/commit/${commit}`;
  } catch {
    return null;
  }
}
