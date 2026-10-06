# Error handling in the web UI

Every failure the UI can meet (a refused request, a dropped connection, a hung
server, a proxy's HTML page, a bug in a page) goes through one path, so the same
failure reads the same everywhere and nothing is guessed. The code is in
`src/errors/`.

```
 response / thrown error ──decode──▶ AppError ──describe──▶ title · words · icon · actions
 (src/errors/decode.js)               (appError.js)         (copy.js)        │
                                                                             ▼
                                          <ErrorState> (a page or panel)  /  notifyError (a toast)
```

## What the backend sends

The decoder reads what the backend really sends today; it needs no backend change
(`test/fixtures/errors/real.json` are recorded responses, `synthetic.json` the ones a
healthy dev stack does not produce: a proxy's 502 page, a 429, a 200 maintenance page...).

| Shape | Where from | How it is read |
|---|---|---|
| `X-Error-Code` / `X-Error-Message` headers, empty body | the HF-compatible routes | code → kind, message → the server's sentence |
| `{"detail": "text"}`, `{"detail": {"error": "text"}}`, `{"detail": [...]}` | FastAPI / our routes | the text; a 422 list becomes `fields` |
| `{"error": "GatedRepo", "detail": "...", "sources": [...]}` | the fallback aggregate | code + sentence + the sources tried |
| plain-text `Internal Server Error` | an unhandled exception | a server error, no sentence |
| an HTML page | a proxy / maintenance page | unavailable (status ≥ 500) or unexpected (200) |
| no response at all | offline, DNS, CORS, a reset | network |

`X-Request-Id` is on every error response: it is kept, shown in the technical
details and on toasts, and is what to quote to whoever runs the server.

Two inferences are made because the backend gives no better signal: a 500
`ServerError` whose message carries a LakeFS `404` is read as *not found* (and its
message, which names an internal URL, is dropped), and a 403 carrying the
"User authentication required" sentence is *sign in* (as a 401 is), not *forbidden*.

## The kinds

`describeError(error, context)` decides the words. `context` is
`{ noun, signedIn, sessionExpired, storage }`: the same 404 reads differently for a
repository you are signed out of, and a network failure on a storage URL mentions CORS.

| Kind | Title (for a repository) | Actions | Tone | Retried automatically |
|---|---|---|---|---|
| `network` | Can't reach the server | retry | neutral | yes |
| `timeout` | The server took too long | retry | neutral | yes |
| `bug` | Something went wrong in the app | retry, reload | danger | no |
| `unexpected-response` | Unexpected response | retry | neutral | yes |
| `unavailable` | Service unavailable | retry | neutral | yes |
| `server` | Something went wrong on the server | retry | danger | yes |
| `unsupported` | Not supported | - | neutral | no |
| `gated` | Access needs a token | settings, back | warning | no |
| `auth-required` | Sign in required | signin, back | warning | no |
| `invalid-credentials` | Sign-in failed | - | warning | no |
| `session-expired` | Your session has expired | signin | warning | no |
| `forbidden` | You don't have access | back, home | warning | no |
| `not-found` | Repository not found | back, home | neutral | no |
| `conflict` | Conflict | - | warning | no (yes for `RepoNameRecycling`) |
| `invalid` | Check your input | - | warning | no |
| `too-large` | Over the limit | - | warning | no |
| `rate-limited` | Too many requests | retry | warning | yes, after `Retry-After` |
| `rejected` | Request not accepted | - | warning | no |
| `cancelled` | nothing is shown | - | - | no |

The rule behind the words: for a 4xx the server's own sentence is shown (it says what
the user did); for a 5xx, a network failure, a timeout or an unexpected page the app's
words are shown, and the server's text is only in the *Technical details*.

## Using it in a page

Show a load that failed:

```vue
<ErrorState v-else-if="error" :error="error" :context="errorContext('repository')" :retry="load" />
```

```js
const errorContext = useErrorContext(); // who is looking: signed in, session ended
try { ... } catch (err) {
  const decoded = decodeError(err);
  if (decoded.kind !== KIND.CANCELLED) error.value = decoded; // a cancelled request is not an error
}
```

Report an action that failed: `notifyError(err, { fallback: "Failed to save settings" })`
(a toast "Failed to save settings: <reason>", with the request ID and a Copy ID button
for server-side failures; identical toasts within 1.5 s are shown once).

Use `useAsyncResource(fetcher)` for a load that should retry transient failures by itself
(a countdown the user can cancel, 1 s, 2 s, 4 s, or what `Retry-After` says).

Use `hubFetch(url)` instead of `fetch(url)`: a bounded wait (30 s), and a failure comes out
as an `AppError`.

### Rules that keep it honest

- **Never show a form of defaults after a failed load.** A settings page that could not
  read its settings shows the error *instead of* the form and refuses to save: saving a
  form of defaults overwrites the real values (a failed load must not turn a private
  repository public).
- **A failed list is not an empty list.** Say why it failed; do not show "no models".
- **Only a 401 signs out.** A network failure or a 5xx while checking the session keeps
  the sign-in and shows a "we couldn't check whether you're signed in, Retry" banner.
- Do not read `err.response.data.detail` by hand: `test/errors/test_architecture.test.js`
  fails if a page does.

## Session

`src/errors/session.js` is the seam between the HTTP layer and the auth store (so neither
imports the other). A request refused for want of a sign-in is reported to the store, which
asks `whoami-v2` once (at most every 30 s, however many requests were refused together):
a 401 there ends the session and shows the banner *Your session has ended* with a Sign in
link that comes back to the page; anything else changes nothing.

## Motion and navigation

- `<ErrorState>` rises in over 180 ms (6 px and a fade) unless the user asked for reduced
  motion, in which case it appears at once.
- The automatic-retry countdown ticks once a second and has a Cancel link.
- Sign in goes to `/login?return=<this page>` and comes back after signing in; Go back is
  `router.back()`; Go to home is `/`; Open settings is `/settings` (a gated repository needs a token there).
- An address no page claims shows the *Page not found* state (`src/pages/[...all].vue`);
  a page that throws while rendering shows the *bug* state (`RouteBoundary`) and clears
  when the route changes.

## Recording new backend responses

`scripts/capture-error-fixtures.py` records real error responses from a running backend
into `test/fixtures/errors/real.json`; add a case to `test_decode.test.js` for each new one.
