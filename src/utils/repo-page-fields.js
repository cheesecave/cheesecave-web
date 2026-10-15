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

export function repoPageFields(repoType) {
  const fields = [...CORE_REPO_FIELDS, "storage"];
  if (repoType !== "space") fields.splice(4, 0, "downloads");
  return fields;
}
