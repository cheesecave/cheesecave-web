// What a form asks of a password before it sends it: the server's rule, so a person is told next to the field and not by
// a 422 afterwards. The server counts characters for the minimum and bytes for the maximum (bcrypt reads no more than the
// first 72 bytes), and so does this.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

const encoder = new TextEncoder();

/** The problem with a password, in words for the person, or `null` if it is fine. */
export function passwordProblem(value) {
  if (!value) return "Please enter a password";
  if ([...value].length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (encoder.encode(value).length > MAX_PASSWORD_BYTES)
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes (fewer characters if some are not ASCII)`;
  return null;
}

/** The problem with the repeated password, or `null` if it is the same. */
export function confirmationProblem(password, confirmation) {
  if (!confirmation) return "Please repeat the password";
  if (confirmation !== password) return "The two passwords do not match";
  return null;
}
