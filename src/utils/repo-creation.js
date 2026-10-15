// The server applies the Hub's repository-name rule (cheesecave-backend#98),
// the one huggingface_hub's validate_repo_id mirrors: 1 to 96 ASCII letters,
// digits, "-", "_" and "."; it starts and ends with a letter, digit or "_";
// no "--" or ".."; it does not end in ".git" (name.git is the git URL of
// name). Say so before the request, in the server's own terms.
export const REPOSITORY_NAME_MAX = 96;

export function validateRepositoryName(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "Please enter repository name";
  }
  if (/[^a-zA-Z0-9_.-]/.test(value)) {
    return "Only letters, numbers, hyphens, underscores, and dots allowed";
  }
  if (value.length > REPOSITORY_NAME_MAX) {
    return `Use at most ${REPOSITORY_NAME_MAX} characters`;
  }
  if (/^[-.]|[-.]$/.test(value)) {
    return "Cannot start or end with a hyphen or a dot";
  }
  if (value.includes("--") || value.includes("..")) {
    return "Cannot contain -- or ..";
  }
  if (value.endsWith(".git")) {
    return "Cannot end with .git";
  }
  return null;
}

export function createRepositoryNameRules() {
  return [
    {
      required: true,
      trigger: "blur",
      validator(_rule, value, callback) {
        const message = validateRepositoryName(value);
        callback(message ? new Error(message) : undefined);
      },
    },
  ];
}
