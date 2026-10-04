// The create API accepts one-character names and dots. Keep both UI entry
// points on the existing ASCII character policy without adding HF-only limits.
export function validateRepositoryName(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "Please enter repository name";
  }
  return /[^a-zA-Z0-9_.-]/.test(value)
    ? "Only letters, numbers, hyphens, underscores, and dots allowed"
    : null;
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
