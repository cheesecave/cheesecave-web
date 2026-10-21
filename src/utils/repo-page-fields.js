// The fields the repository page asks repo info for. It never asks for the whole-repository
// file list (it grows with the repository, #101), so it names what it shows. The backend
// answers 400 for an `expand` it does not know for the kind of repository: a Space has no
// download counts, so asking one for `downloads` made its page an error.

// What every kind of repository has
export const CORE_REPO_FIELDS = [
  "sha",
  "lastModified",
  "createdAt",
  "private",
  "likes",
  "tags",
];

// What only one kind of repository has: a model's files say its library, task, config and the size of its
// weights; a Space has an sdk
const EXTRA_FIELDS = {
  model: ["pipeline_tag", "library_name", "config", "safetensors"],
  space: ["sdk"],
};

// `storage` and `createdBy` are Cheesecave's own (the quota and the person who created the repository). An
// older backend refuses them with a 400, and the page then asks again with CORE_REPO_FIELDS.
export function repoPageFields(repoType) {
  const fields = [...CORE_REPO_FIELDS, "storage", "createdBy"];
  if (repoType !== "space") fields.splice(4, 0, "downloads");
  return [...fields, ...(EXTRA_FIELDS[repoType] || [])];
}
