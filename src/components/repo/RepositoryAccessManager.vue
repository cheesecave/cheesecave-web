<template>
  <section
    class="repository-access-settings"
    :aria-busy="loading || busy || confirming"
  >
    <header class="access-page-heading" aria-label="Access record actions">
      <slot name="heading" />
      <el-button
        class="access-refresh"
        :loading="loading"
        :disabled="busy || confirming"
        @click="load"
        >Refresh</el-button
      >
    </header>
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
                <span class="access-record-name">{{ applicant(request) }}</span>
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
                      v-if="request.user_id"
                      type="primary"
                      :disabled="busy || loading || confirming"
                      :aria-label="`Invite ${applicant(request)}`"
                      @click="inviteAccount(request)"
                      >Invite</el-button
                    >
                    <el-button
                      v-else
                      :disabled="busy || loading || confirming"
                      :aria-label="`Approve application from ${applicant(request)}`"
                      @click="review(request.id, true)"
                      >Approve</el-button
                    >
                    <el-button
                      :disabled="busy || loading || confirming"
                      :aria-label="`Reject application from ${applicant(request)}`"
                      @click="review(request.id, false)"
                      >Reject</el-button
                    >
                  </template>
                  <el-button
                    v-if="!request.user_id && request.status === 'approved'"
                    type="primary"
                    :disabled="busy || loading || confirming"
                    :aria-label="`Invite ${applicant(request)}`"
                    @click="openIssueDialog(request.id)"
                    >Invite</el-button
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
                {{ pages.requests.loading ? "Loading…" : "No applications." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="access-pagination">
        <ErrorState
          v-if="pages.requests.error"
          :error="pages.requests.error"
          mode="inline-panel"
          :retry="() => loadSection('requests', pages.requests.requestedPage)"
        />
        <el-pagination
          aria-label="Applications pagination"
          :current-page="pages.requests.page"
          :page-size="pageSize"
          :total="pages.requests.total"
          :page-count="pageCount('requests')"
          :pager-count="5"
          :disabled="busy || confirming || pages.requests.loading"
          layout="total, prev, pager, next, jumper"
          @current-change="(page) => loadSection('requests', page)"
        />
      </footer>
    </section>

    <section class="access-panel" aria-labelledby="access-codes-title">
      <div class="access-panel-heading">
        <h3 id="access-codes-title">Repository codes</h3>
        <el-button
          type="primary"
          :disabled="busy || loading || confirming"
          @click="openIssueDialog()"
        >
          Create code
        </el-button>
      </div>
      <div
        class="access-table-scroll"
        tabindex="0"
        role="region"
        aria-label="Repository codes table"
      >
        <table aria-label="Repository codes" class="access-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Status</th>
              <th scope="col">Redeem by</th>
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
                ><span v-if="invitation.label" class="access-secondary"
                  >#{{ invitation.id }}</span
                >
              </td>
              <td>
                <span
                  class="access-status"
                  :data-status="inviteStatus(invitation).toLowerCase()"
                  >{{ inviteStatus(invitation) }}</span
                >
              </td>
              <td>
                <time
                  :datetime="invitation.expires_at"
                  :title="invitation.expires_at"
                  >{{ dateLabel(invitation.expires_at) }}</time
                >
              </td>
              <td>{{ durationLabel(invitation.guest_ttl_seconds) }}</td>
              <td>
                <el-button
                  v-if="!invitation.revoked_at"
                  type="danger"
                  :disabled="busy || loading || confirming"
                  :aria-label="`Revoke code #${invitation.id}`"
                  @click="
                    perform((target) =>
                      repositoryAccessAPI.revokeInvitation(
                        target,
                        invitation.id,
                      ),
                    )
                  "
                  >Revoke</el-button
                ><span v-else class="access-muted">—</span>
              </td>
            </tr>
            <tr v-if="!data.invitations.length">
              <td colspan="5" class="access-empty">
                {{ pages.invitations.loading ? "Loading…" : "No codes." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="access-pagination">
        <ErrorState
          v-if="pages.invitations.error"
          :error="pages.invitations.error"
          mode="inline-panel"
          :retry="
            () => loadSection('invitations', pages.invitations.requestedPage)
          "
        />
        <el-pagination
          aria-label="Repository codes pagination"
          :current-page="pages.invitations.page"
          :page-size="pageSize"
          :total="pages.invitations.total"
          :page-count="pageCount('invitations')"
          :pager-count="5"
          :disabled="busy || confirming || pages.invitations.loading"
          layout="total, prev, pager, next, jumper"
          @current-change="(page) => loadSection('invitations', page)"
        />
      </footer>
    </section>

    <section class="access-panel" aria-labelledby="access-grants-title">
      <div class="access-panel-heading">
        <h3 id="access-grants-title">Account grants</h3>
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
                  type="danger"
                  :disabled="busy || loading || confirming"
                  :aria-label="`Revoke account access for ${item.username || `account ${item.user_id}`}`"
                  @click="
                    perform((target) =>
                      repositoryAccessAPI.revokeGrant(target, item.id),
                    )
                  "
                  >Revoke</el-button
                ><span v-else class="access-muted">—</span>
              </td>
            </tr>
            <tr v-if="!data.grants.length">
              <td colspan="5" class="access-empty">
                {{ pages.grants.loading ? "Loading…" : "No account grants." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="access-pagination">
        <ErrorState
          v-if="pages.grants.error"
          :error="pages.grants.error"
          mode="inline-panel"
          :retry="() => loadSection('grants', pages.grants.requestedPage)"
        />
        <el-pagination
          aria-label="Account grants pagination"
          :current-page="pages.grants.page"
          :page-size="pageSize"
          :total="pages.grants.total"
          :page-count="pageCount('grants')"
          :pager-count="5"
          :disabled="busy || confirming || pages.grants.loading"
          layout="total, prev, pager, next, jumper"
          @current-change="(page) => loadSection('grants', page)"
        />
      </footer>
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
                {{ pages.events.loading ? "Loading…" : "No audit events." }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="access-pagination">
        <ErrorState
          v-if="pages.events.error"
          :error="pages.events.error"
          mode="inline-panel"
          :retry="() => loadSection('events', pages.events.requestedPage)"
        />
        <el-pagination
          aria-label="Audit log pagination"
          :current-page="pages.events.page"
          :page-size="pageSize"
          :total="pages.events.total"
          :page-count="pageCount('events')"
          :pager-count="5"
          :disabled="busy || confirming || pages.events.loading"
          layout="total, prev, pager, next, jumper"
          @current-change="(page) => loadSection('events', page)"
        />
      </footer>
    </section>
    <el-dialog
      v-model="issueDialogOpen"
      title="Create repository code"
      width="min(640px, calc(100vw - 32px))"
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
      :close-on-press-escape="!busy"
      :show-close="!busy"
      @close="secret = ''"
    >
      <div v-if="!secret" class="access-code-form">
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
      </div>
      <div v-if="secret" class="access-secret" role="status">
        <el-alert
          title="Copy this code now. It is shown only once."
          type="error"
          show-icon
          :closable="false"
        />
        <div class="access-secret-code">
          <code>{{ secret }}</code>
          <el-button
            size="small"
            aria-label="Copy invitation code"
            title="Copy invitation code"
            @click="copySecret"
          >
            <span class="i-carbon-copy" aria-hidden="true" />
          </el-button>
        </div>
      </div>
      <template v-if="!secret" #footer>
        <el-button :disabled="busy" @click="issueDialogOpen = false">
          Cancel
        </el-button>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="loading"
          @click="issue"
        >
          Create repository code
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import {
  formatRelativeTime,
  localDateTimeToIso,
  parseServerTime,
} from "@/utils/datetime";
import { repositoryAccessAPI } from "@/utils/api";
import { copyToClipboard } from "@/utils/clipboard";
import { decodeError, notifyError } from "@/errors";
import { ElMessage, ElMessageBox } from "element-plus";
import ErrorState from "@/components/common/ErrorState.vue";
const props = defineProps({ repository: { type: Object, required: true } });
const empty = () => ({
  requests: [],
  invitations: [],
  grants: [],
  events: [],
});
const sections = ["requests", "invitations", "grants", "events"];
const pageSize = 20;
const emptyPages = () =>
  Object.fromEntries(
    sections.map((key) => [
      key,
      {
        page: 1,
        requestedPage: 1,
        total: 0,
        loading: false,
        error: null,
        sequence: 0,
      },
    ]),
  );
const pages = ref(emptyPages());
const data = ref(empty());
const busy = ref(false);
const confirming = ref(false);
const loading = computed(() =>
  sections.some((key) => pages.value[key].loading),
);
const secret = ref("");
const issueDialogOpen = ref(false);
const grantExpiry = ref("");
const issueForm = ref({
  label: "",
  expires_days: 7,
  guest_ttl_seconds: 86400,
  request_id: null,
});
const lifecycleStatus = (item) =>
  item.revoked_at
    ? "Revoked"
    : item.expires_at &&
        !(parseServerTime(item.expires_at).valueOf() > Date.now())
      ? "Expired"
      : "Active";
const inviteStatus = (item) => {
  const status = lifecycleStatus(item);
  return status === "Active" && item.redemption_count > 0 ? "Used" : status;
};
const applicant = (request) =>
  request.username ||
  request.email ||
  (request.user_id != null ? `Account ${request.user_id}` : "—");
const dateLabel = (value) =>
  typeof value === "string" ? formatRelativeTime(value, "—") : "—";
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
const pageCount = (section) =>
  Math.max(1, Math.ceil(pages.value[section].total / pageSize));
async function loadSection(section, page = pages.value[section].page) {
  const state = pages.value[section];
  if (state.loading && state.requestedPage === page) return;
  const owner = generation;
  const request = ++state.sequence;
  const target = { ...props.repository };
  state.requestedPage = page;
  state.error = null;
  state.loading = true;
  try {
    const response = await repositoryAccessAPI.manage(target, {
      section,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    if (owner !== generation || request !== state.sequence) return;
    state.total = response.data.totals[section];
    const lastPage = pageCount(section);
    if (page > lastPage) return await loadSection(section, lastPage);
    data.value[section] = response.data[section];
    state.page = page;
  } catch (cause) {
    if (owner === generation && request === state.sequence)
      state.error = decodeError(cause);
  } finally {
    if (owner === generation && request === state.sequence)
      state.loading = false;
  }
}
async function load() {
  await Promise.all(sections.map((section) => loadSection(section)));
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
async function inviteAccount(request) {
  if (busy.value || loading.value || confirming.value) return;
  const owner = generation;
  confirming.value = true;
  try {
    await ElMessageBox.confirm(
      `Grant ${applicant(request)} access to ${props.repository.namespace}/${props.repository.name}?`,
      "Invite account",
      { confirmButtonText: "Invite", cancelButtonText: "Cancel" },
    );
    if (owner === generation) await review(request.id, true);
  } catch (cause) {
    if (owner === generation && cause !== "cancel" && cause !== "close")
      notifyError(cause, { fallback: "Repository access operation failed" });
  } finally {
    if (owner === generation) confirming.value = false;
  }
}
function openIssueDialog(requestId = null) {
  if (busy.value || loading.value || confirming.value) return;
  secret.value = "";
  issueForm.value.request_id = requestId;
  issueDialogOpen.value = true;
}
async function copySecret() {
  if (!secret.value) return;
  if (await copyToClipboard(secret.value)) ElMessage.success("Copied");
  else ElMessage.error("Failed to copy code");
}
async function issue() {
  secret.value = "";
  await perform(async (target, owner) => {
    const { request_id, ...values } = issueForm.value;
    const response = await repositoryAccessAPI.issue(target, {
      ...values,
      ...(request_id ? { request_id } : {}),
      ...(grantExpiry.value
        ? { grant_expires_at: localDateTimeToIso(grantExpiry.value) }
        : {}),
    });
    if (owner === generation) secret.value = response.data.token;
  });
}
watch(
  () => JSON.stringify(props.repository),
  () => {
    generation++;
    busy.value = false;
    confirming.value = false;
    pages.value = emptyPages();
    data.value = empty();
    issueDialogOpen.value = false;
    issueForm.value.request_id = null;
    secret.value = "";
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
.access-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.access-page-heading {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--site-border);
}
.access-refresh {
  margin-left: auto;
  flex-shrink: 0;
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
.access-empty {
  color: var(--site-muted);
  text-align: center;
}
.access-event-action {
  font-family: ui-monospace, monospace;
}
.access-pagination {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  min-width: 0;
  border-top: 1px solid var(--site-border);
  padding: 16px;
}
.access-pagination :deep(.el-pagination) {
  max-width: 100%;
  flex-wrap: wrap;
  row-gap: 8px;
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
}
.access-secret-code {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--site-border);
  border-radius: 6px;
  padding: 16px;
  background: var(--site-hover);
}
.access-secret-code :deep(.el-button) {
  flex-shrink: 0;
}
.access-secret code {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  user-select: all;
}
.access-muted {
  color: var(--site-muted);
  font-size: 13px;
}
@media (max-width: 640px) {
  .access-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .access-panel-heading {
    padding: 16px;
  }
  .access-pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
