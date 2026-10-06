import { useAuthStore } from "@/stores/auth";

/** Who is looking, for `describeError`: `context("repository")`. */
export function useErrorContext() {
  const auth = useAuthStore();
  return (noun) => ({
    noun,
    signedIn: !!auth.user,
    sessionExpired: !!auth.sessionExpired,
  });
}
