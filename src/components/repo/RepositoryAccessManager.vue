<template>
  <section class="repository-access-settings" :aria-busy="loading || busy">
    <header class="access-page-heading" aria-label="Access record actions">
      <el-button :loading="loading" :disabled="busy" @click="load"
        >Refresh</el-button
      >
    </header>
    <p v-if="loading" class="access-loading" role="status">
      Loading repository access…
    </p>
    <ErrorState v-if="error" :error="error" mode="inline-panel" :retry="load" />

    <section class="access-panel" aria-labelledby="access-applications-title">
      <div class="access-panel-heading">
        <h3 id="access-applications-title">Applications</h3>
      </div>
      <div
        class="access-table-scroll"
        tabindex="0"
        role="region"
        aria-label="Applications table"
      >
        <table aria-label="Applications" class="access-table">
          <thead>
            <tr>
              <th scope="col">Applicant</th>
              <th scope="col">Status</th>
              <th scope="col">Message</th>
              <th scope="col">Submitted</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="request in data.requests" :key="request.id">
              <td>
                <span class="access-record-name">{{ applicant(request) }}</span
                ><span class="access-secondary">{{
                  request.user_id ? "Account" : "Email application"
                }}</span>
              </td>
              <td>
                <span class="access-status" :data-status="request.status">{{
                  request.status || "—"
                }}</span>
              </td>
              <td class="access-message">{{ request.message || "—" }}</td>
              <td>
                <time
                  :datetime="request.created_at"
                  :title="request.created_at"
                  >{{ dateLabel(request.created_at) }}</time
                >
              </td>
              <td>
                <div class="access-row-actions">
                  <template v-if="request.status === 'pending'">
                    <el-button
                      :disabled="busy || loading"
                      :aria-label="`Approve application from ${applicant(request)}`"
                      @click="review(request.id, true)"
                      >Approve</el-button
                    >
                    <el-button
                      :disabled="busy || loading"
                      :aria-label="`Reject application from ${applicant(request)}`"
                      @click="review(request.id, false)"
                      >Reject</el-button
                    >
                  </template>
                  <el-button
                    v-if="!request.user_id && request.status === 'approved'"
                    :disabled="busy || loading"
                    :aria-label="`Prepare invitation for ${applicant(request)}`"
                    @click="issueForm.request_id = request.id"
                    >Prepare invitation</el-button
                  >
                  <span
                    v-if="request.user_id && request.status !== 'pending'"
                    class="access-muted"
                    >—</span
                  >
                </div>
              </td>
            </tr>
            <tr v-if="!data.requests.length">
              <td colspan="5" class="access-empty">
                {{ loading ? "Loading…" : "No applications." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="access-panel" aria-labelledby="access-codes-title">
      <div class="access-panel-heading">
        <h3 id="access-codes-title">Repository codes</h3>
      </div>
      <div
        class="access-table-scroll"
        tabindex="0"
        role="region"
        aria-label="Repository codes table"
      >
        <table
          aria-label="Repository codes"
          class="access-table access-codes-table"
        >
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Status</th>
              <th scope="col">Redeem by</th>
              <th scope="col">Accounts</th>
              <th scope="col">Visitors</th>
              <th scope="col">Visitor lifetime</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="invitation in data.invitations" :key="invitation.id">
              <td>
                <span class="access-record-name">{{
                  invitation.label || `Code #${invitation.id}`
                }}</span
                ><span class="access-secondary">#{{ invitation.id }}</span>
              </td>
              <td>
                <span
                  class="access-status"
                  :data-status="lifecycleStatus(invitation).toLowerCase()"
                  >{{ lifecycleStatus(invitation) }}</span
                >
              </td>
              <td>
                <time
                  :datetime="invitation.expires_at"
                  :title="invitation.expires_at"
                  >{{ dateLabel(invitation.expires_at) }}</time
                >
              </td>
              <td class="access-usage">
                {{ invitation.redemption_count ?? "—" }} /
                {{ invitation.max_redemptions ?? "—" }}
              </td>
              <td class="access-usage">
                {{ invitation.guest_session_count ?? "—" }} /
                {{ invitation.max_guest_sessions ?? "—" }}
              </td>
              <td>{{ durationLabel(invitation.guest_ttl_seconds) }}</td>
              <td>
                <el-button
                  v-if="!invitation.revoked_at"
                  :disabled="busy || loading"
                  :aria-label="`Revoke code #${invitation.id}`"
                  @click="
                    perform((target) =>
                      repositoryAccessAPI.revokeInvitation(
                        target,
                        invitation.id,
                      ),
                    )
                  "
                  >Revoke code</el-button
                ><span v-else class="access-muted">—</span>
              </td>
            </tr>
            <tr v-if="!data.invitations.length">
              <td colspan="7" class="access-empty">
                {{ loading ? "Loading…" : "No codes." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="access-form-panel">
        <h4>Create repository invitation code</h4>
        <p v-if="issueForm.request_id" class="access-application-association">
          For anonymous application #{{ issueForm.request_id }}
          <el-button @click="issueForm.request_id = null"
            >Clear application</el-button
          >
        </p>
        <div class="access-form-grid">
          <label class="access-wide-field"
            >Label<el-input
              v-model="issueForm.label"
              placeholder="Code label (optional)"
              aria-label="Code label"
          /></label>
          <label
            >Redeem within (days)<el-input-number
              v-model="issueForm.expires_days"
              aria-label="Code redemption lifetime in days"
              :min="1"
              :max="90"
          /></label>
          <label
            >Account redemptions<el-input-number
              v-model="issueForm.max_redemptions"
              aria-label="Maximum account redemptions"
              :min="1"
              :max="10000"
          /></label>
          <label
            >Visitor sessions<el-input-number
              v-model="issueForm.max_guest_sessions"
              aria-label="Maximum visitor sessions"
              :min="0"
              :max="10000"
          /></label>
          <label
            >Visitor lifetime (seconds)<el-input-number
              v-model="issueForm.guest_ttl_seconds"
              aria-label="Visitor lifetime in seconds"
              :min="60"
              :max="604800"
          /></label>
          <label
            >Account grant expires (optional)<input
              v-model="grantExpiry"
              type="datetime-local"
              aria-label="Invitation account grant expiry"
          /></label>
        </div>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="loading"
          @click="issue"
          >Create repository code</el-button
        >
        <div v-if="secret" class="access-secret" role="status">
          <p>Copy this code now. It is shown only once.</p>
          <code>{{ secret }}</code>
          <div class="access-row-actions">
            <el-button @click="secret = ''">Hide secret</el-button
            ><RouterLink to="/repo-access"
              >Open code redemption page</RouterLink
            >
          </div>
        </div>
      </div>
    </section>

    <section class="access-panel" aria-labelledby="access-grants-title">
      <div class="access-panel-heading">
        <h3 id="access-grants-title">Account grants</h3>
        <span class="access-muted">Read-only</span>
      </div>
      <div
        class="access-table-scroll"
        tabindex="0"
        role="region"
        aria-label="Account grants table"
      >
        <table aria-label="Account grants" class="access-table">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Status</th>
              <th scope="col">Granted</th>
              <th scope="col">Expires</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.grants" :key="item.id">
              <td class="access-record-name">
                {{
                  item.username ||
                  (item.user_id != null ? `Account ${item.user_id}` : "—")
                }}
              </td>
              <td>
                <span
                  class="access-status"
                  :data-status="lifecycleStatus(item).toLowerCase()"
                  >{{
                    lifecycleStatus(item) === "Active"
                      ? "Read access"
                      : lifecycleStatus(item)
                  }}</span
                >
              </td>
              <td>
                <time :datetime="item.created_at" :title="item.created_at">{{
                  dateLabel(item.created_at)
                }}</time>
              </td>
              <td>
                <time :datetime="item.expires_at" :title="item.expires_at">{{
                  item.expires_at === null
                    ? "No expiry"
                    : dateLabel(item.expires_at)
                }}</time>
              </td>
              <td>
                <el-button
                  v-if="!item.revoked_at"
                  :disabled="busy || loading"
                  :aria-label="`Revoke account access for ${item.username || `account ${item.user_id}`}`"
                  @click="
                    perform((target) =>
                      repositoryAccessAPI.revokeGrant(target, item.id),
                    )
                  "
                  >Revoke account access</el-button
                ><span v-else class="access-muted">—</span>
              </td>
            </tr>
            <tr v-if="!data.grants.length">
              <td colspan="5" class="access-empty">
                {{ loading ? "Loading…" : "No account grants." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="access-form-panel">
        <h4>Grant read access</h4>
        <div class="access-form-grid">
          <label
            >Account<el-input
              v-model="username"
              placeholder="Account username"
              aria-label="Grant account username"
          /></label>
          <label
            >Grant expires (optional)<input
              v-model="directExpiry"
              type="datetime-local"
              aria-label="Direct account grant expiry"
          /></label>
        </div>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="loading"
          @click="grant"
          >Grant read access</el-button
        >
      </div>
    </section>

    <section class="access-panel" aria-labelledby="access-visitors-title">
      <div class="access-panel-heading">
        <h3 id="access-visitors-title">Visitor sessions</h3>
      </div>
      <div
        class="access-table-scroll"
        tabindex="0"
        role="region"
        aria-label="Visitor sessions table"
      >
        <table aria-label="Visitor sessions" class="access-table">
          <thead>
            <tr>
              <th scope="col">Session</th>
              <th scope="col">Status</th>
              <th scope="col">Code</th>
              <th scope="col">Created</th>
              <th scope="col">Expires</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="guest in data.guests" :key="guest.id">
              <td class="access-record-name">#{{ guest.id }}</td>
              <td>
                <span
                  class="access-status"
                  :data-status="lifecycleStatus(guest).toLowerCase()"
                  >{{ lifecycleStatus(guest) }}</span
                >
              </td>
              <td>
                {{ guest.invite_id != null ? `#${guest.invite_id}` : "—" }}
              </td>
              <td>
                <time :datetime="guest.created_at" :title="guest.created_at">{{
                  dateLabel(guest.created_at)
                }}</time>
              </td>
              <td>
                <time :datetime="guest.expires_at" :title="guest.expires_at">{{
                  dateLabel(guest.expires_at)
                }}</time>
              </td>
              <td>
                <el-button
                  v-if="!guest.revoked_at"
                  :disabled="busy || loading"
                  :aria-label="`Revoke visitor session #${guest.id}`"
                  @click="
                    perform((target) =>
                      repositoryAccessAPI.revokeGuest(target, guest.id),
                    )
                  "
                  >Revoke visitor session</el-button
                ><span v-else class="access-muted">—</span>
              </td>
            </tr>
            <tr v-if="!data.guests.length">
              <td colspan="6" class="access-empty">
                {{ loading ? "Loading…" : "No visitor sessions." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="access-panel" aria-labelledby="access-audit-title">
      <div class="access-panel-heading">
        <h3 id="access-audit-title">Audit log</h3>
      </div>
      <div
        class="access-table-scroll"
        tabindex="0"
        role="region"
        aria-label="Audit log table"
      >
        <table aria-label="Audit log" class="access-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Action</th>
              <th scope="col">Actor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="event in data.events" :key="event.id">
              <td>
                <time :datetime="event.created_at" :title="event.created_at">{{
                  dateLabel(event.created_at)
                }}</time>
              </td>
              <td class="access-event-action">{{ event.action || "—" }}</td>
              <td>{{ event.actor_username || event.actor_id || "Visitor" }}</td>
            </tr>
            <tr v-if="!data.events.length">
              <td colspan="3" class="access-empty">
                {{ loading ? "Loading…" : "No audit events." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <footer class="access-pagination">
      <p v-if="data.limit" class="access-muted">
        Up to {{ data.limit }} records per table.
      </p>
      <div class="access-row-actions">
        <el-button
          v-if="offset > 0"
          :disabled="busy || loading"
          @click="
            offset = Math.max(0, offset - 100);
            load();
          "
          >Previous records</el-button
        >
        <el-button
          v-if="Object.values(data.has_more || {}).some(Boolean)"
          :disabled="busy || loading"
          @click="
            offset += 100;
            load();
          "
          >More records</el-button
        >
      </div>
    </footer>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from "vue";
import { formatRelativeTime } from "@/utils/datetime";
import { repositoryAccessAPI } from "@/utils/api";
import { decodeError, notifyError } from "@/errors";
import { ElMessage } from "element-plus";
import ErrorState from "@/components/common/ErrorState.vue";
const props = defineProps({ repository: { type: Object, required: true } });
const empty = () => ({
  requests: [],
  invitations: [],
  grants: [],
  guests: [],
  events: [],
});
const data = ref(empty());
const busy = ref(false);
const loading = ref(false);
const error = ref(null);
const secret = ref("");
const username = ref("");
const directExpiry = ref("");
const grantExpiry = ref("");
const offset = ref(0);
const issueForm = ref({
  label: "",
  expires_days: 7,
  max_redemptions: 1,
  max_guest_sessions: 1,
  guest_ttl_seconds: 86400,
  request_id: null,
});
const expiry = (value) => (value ? new Date(value).toISOString() : null);
const lifecycleStatus = (item) =>
  item.revoked_at
    ? "Revoked"
    : item.expires_at && !(Date.parse(item.expires_at) > Date.now())
      ? "Expired"
      : "Active";
const applicant = (request) =>
  request.username ||
  request.email ||
  (request.user_id != null ? `Account ${request.user_id}` : "—");
const dateLabel = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? formatRelativeTime(value, "—")
    : "—";
function durationLabel(value) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const [amount, unit] =
    value % 86400 === 0
      ? [value / 86400, "day"]
      : value % 3600 === 0
        ? [value / 3600, "hour"]
        : value % 60 === 0
          ? [value / 60, "minute"]
          : [value, "second"];
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}
let generation = 0;
let loadSequence = 0;
async function load() {
  const owner = generation;
  const request = ++loadSequence;
  const target = { ...props.repository };
  error.value = null;
  loading.value = true;
  try {
    const response = await repositoryAccessAPI.manage(target, {
      limit: 100,
      offset: offset.value,
    });
    if (owner === generation && request === loadSequence)
      data.value = { ...empty(), ...response.data };
  } catch (cause) {
    if (owner === generation && request === loadSequence)
      error.value = decodeError(cause);
  } finally {
    if (owner === generation && request === loadSequence) loading.value = false;
  }
}
async function perform(action) {
  if (busy.value) return;
  const owner = generation;
  const target = { ...props.repository };
  busy.value = true;
  try {
    await action(target, owner);
    if (owner === generation) await load();
  } catch (cause) {
    if (owner === generation)
      notifyError(cause, { fallback: "Repository access operation failed" });
  } finally {
    if (owner === generation) busy.value = false;
  }
}
const review = (id, approve) =>
  perform((target) => repositoryAccessAPI.review(target, id, { approve }));
async function issue() {
  secret.value = "";
  await perform(async (target, owner) => {
    const { request_id, ...values } = issueForm.value;
    const response = await repositoryAccessAPI.issue(target, {
      ...values,
      ...(request_id ? { request_id } : {}),
      ...(grantExpiry.value
        ? { grant_expires_at: expiry(grantExpiry.value) }
        : {}),
    });
    if (owner === generation) secret.value = response.data.token;
  });
}
async function grant() {
  if (!username.value.trim()) {
    ElMessage.warning("Enter an account username");
    return;
  }
  await perform((target) =>
    repositoryAccessAPI.grant(target, {
      username: username.value.trim(),
      ...(directExpiry.value ? { expires_at: expiry(directExpiry.value) } : {}),
    }),
  );
}
watch(
  () => JSON.stringify(props.repository),
  () => {
    generation++;
    busy.value = false;
    loading.value = false;
    data.value = empty();
    secret.value = "";
    offset.value = 0;
    load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
});
</script>

<style scoped>
.repository-access-settings {
  min-width: 0;
  display: grid;
  gap: 24px;
}
.access-page-heading,
.access-panel-heading,
.access-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.access-page-heading {
  justify-content: flex-end;
}
.access-panel {
  min-width: 0;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  background: var(--site-card);
}
.access-panel-heading {
  padding: 16px 20px;
}
.access-panel-heading h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.access-table-scroll {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
}
.access-table-scroll:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: -2px;
}
.access-table {
  width: 100%;
  min-width: 740px;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}
.access-codes-table {
  min-width: 920px;
}
.access-table th {
  padding: 10px 16px;
  background: var(--site-hover);
  color: var(--site-muted);
  font-weight: 500;
  white-space: nowrap;
}
.access-table td {
  padding: 14px 16px;
  border-top: 1px solid var(--site-border);
  vertical-align: top;
  overflow-wrap: anywhere;
}
.access-table tbody tr:hover {
  background: var(--site-hover);
}
.access-table td:first-child {
  min-width: 120px;
}
.access-record-name {
  font-weight: 500;
}
.access-secondary {
  display: block;
  color: var(--site-muted);
  font-size: 12px;
  margin-top: 4px;
}
.access-message {
  min-width: 180px;
  max-width: 320px;
  white-space: pre-wrap;
}
.access-status {
  display: inline-block;
  padding: 2px 7px;
  border: 1px solid var(--site-border);
  border-radius: 20px;
  color: var(--site-muted);
  white-space: nowrap;
  font-size: 12px;
}
.access-status[data-status="active"],
.access-status[data-status="approved"] {
  color: var(--el-color-success);
  border-color: var(--el-color-success-light-5);
}
.access-status[data-status="pending"],
.access-status[data-status="expired"] {
  color: var(--el-color-warning);
  border-color: var(--el-color-warning-light-5);
}
.access-status[data-status="rejected"] {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger-light-5);
}
.access-row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.access-row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.access-row-actions a {
  color: var(--site-link);
}
.access-usage {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.access-empty {
  color: var(--site-muted);
  text-align: center;
}
.access-event-action {
  font-family: ui-monospace, monospace;
}
.access-form-panel {
  border-top: 1px solid var(--site-border);
  padding: 20px;
}
.access-form-panel h4 {
  font-weight: 600;
  margin: 0 0 16px;
  font-size: 14px;
}
.access-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
  max-width: 760px;
  margin-bottom: 20px;
}
.access-form-grid label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  color: var(--site-card-text);
  font-size: 13px;
}
.access-form-grid .access-wide-field {
  grid-column: 1 / -1;
}
.access-form-grid input[type="datetime-local"] {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid var(--site-border);
  border-radius: 4px;
  color: var(--site-card-text);
  background: var(--site-card);
  font: inherit;
}
.access-application-association {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
  color: var(--site-muted);
  font-size: 13px;
}
.access-secret {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  border: 1px solid var(--site-border);
  border-radius: 6px;
  padding: 16px;
  background: var(--site-hover);
}
.access-secret p {
  margin: 0;
}
.access-secret code {
  overflow-wrap: anywhere;
  user-select: all;
}
.access-muted,
.access-loading {
  color: var(--site-muted);
  font-size: 13px;
}
.access-loading {
  margin: 0;
}
.access-pagination p {
  margin: 0;
}
@media (max-width: 640px) {
  .access-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .access-panel-heading,
  .access-form-panel {
    padding: 16px;
  }
  .access-pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
