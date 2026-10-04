// Request boundaries include session and account changes even when the name is unchanged.
export function getAuthIdentity(auth) {
  return JSON.stringify([
    auth.isAuthenticated,
    auth.username,
    auth.user?.id,
    auth.user?.is_org,
    auth.user?.is_active,
    auth.token,
  ]);
}
