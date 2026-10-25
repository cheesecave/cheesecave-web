// Where a repository that comes from another source (a fallback hub) lives on that source.
// Hugging Face keeps models at the root and puts datasets and spaces under their type; every
// other source always uses the type prefix. Null when the source has no address.
export function externalRepoUrl(repo, type) {
  if (!repo._source_url) return null;
  const isHuggingFace =
    (repo._source && repo._source.toLowerCase().includes("huggingface")) ||
    repo._source_url.includes("huggingface.co");
  if (isHuggingFace && type === "model") {
    return `${repo._source_url}/${repo.id}`;
  }
  return `${repo._source_url}/${type}s/${repo.id}`;
}
