<template>
  <section class="max-w-4xl space-y-6 py-4">
    <h2 class="text-xl font-semibold">Repository access</h2>
    <p>
      Account grants are read-only and allow normal downloads using the user's
      own access token. Revoking a code stops new redemptions and its visitor
      sessions; account grants are revoked separately.
    </p>
    <el-button :loading="busy" @click="load">Refresh</el-button>
    <ErrorState v-if="error" :error="error" mode="inline-panel" :retry="load" />
    <div class="card space-y-3">
      <h3 class="font-semibold">Applications</h3>
      <p v-if="!data.requests.length">No applications.</p>
      <div
        v-for="request in data.requests"
        :key="request.id"
        class="border-b py-3 space-y-2"
      >
        <p>
          {{
            request.username || request.email || `Account ${request.user_id}`
          }}
          · {{ request.status }}
        </p>
        <p class="whitespace-pre-wrap">{{ request.message }}</p>
        <template v-if="request.status === 'pending'">
          <el-button :disabled="busy" @click="review(request.id, true)"
            >Approve</el-button
          >
          <el-button :disabled="busy" @click="review(request.id, false)"
            >Reject</el-button
          >
        </template>
        <el-button
          v-if="!request.user_id && request.status === 'approved'"
          :disabled="busy"
          @click="issueForm.request_id = request.id"
          >Prepare invitation</el-button
        >
      </div>
    </div>
    <div class="card space-y-3">
      <h3 class="font-semibold">Create repository invitation code</h3>
      <p v-if="issueForm.request_id">
        For anonymous application #{{ issueForm.request_id }}
        <el-button @click="issueForm.request_id = null"
          >Clear application</el-button
        >
      </p>
      <el-input
        v-model="issueForm.label"
        placeholder="Code label (optional)"
        aria-label="Code label"
      />
      <div class="flex flex-wrap gap-4">
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
      </div>
      <label class="block"
        >Account grant expires (optional)<input
          v-model="grantExpiry"
          type="datetime-local"
          aria-label="Invitation account grant expiry"
          class="block border rounded p-2 dark:bg-gray-800"
      /></label>
      <el-button :loading="busy" @click="issue"
        >Create repository code</el-button
      >
      <div v-if="secret" class="border rounded p-3 space-y-2" role="status">
        <p>
          Copy this secret now. It is shown only once and cannot be retrieved
          later.
        </p>
        <code class="break-all select-all">{{ secret }}</code>
        <el-button @click="secret = ''">Hide secret</el-button>
        <p>
          Share the code with its repository URL. Use it to bind an existing
          account, register under the site's registration policy, or open a
          temporary preview.
        </p>
        <RouterLink to="/repo-access" class="text-blue-500"
          >Open code redemption page</RouterLink
        >
      </div>
    </div>
    <div class="card space-y-3">
      <h3 class="font-semibold">Repository codes</h3>
      <p v-if="!data.invitations.length">No codes.</p>
      <div
        v-for="invitation in data.invitations"
        :key="invitation.id"
        class="border-b py-2"
      >
        <span
          >#{{ invitation.id }} {{ invitation.label }} ·
          {{ lifecycleStatus(invitation) }} · expires
          {{ invitation.expires_at || "—" }} · account uses
          {{ invitation.redemption_count ?? "—" }} /
          {{ invitation.max_redemptions ?? "—" }} · visitors
          {{ invitation.guest_session_count ?? "—" }} /
          {{ invitation.max_guest_sessions ?? "—" }}</span
        >
        <el-button
          v-if="!invitation.revoked_at"
          :disabled="busy"
          @click="
            perform(() =>
              repositoryAccessAPI.revokeInvitation(repository, invitation.id),
            )
          "
          >Revoke code</el-button
        >
      </div>
    </div>
    <div class="card space-y-3">
      <h3 class="font-semibold">Account grants</h3>
      <el-input
        v-model="username"
        placeholder="Account username"
        aria-label="Grant account username"
      />
      <label class="block"
        >Grant expires (optional)<input
          v-model="directExpiry"
          type="datetime-local"
          aria-label="Direct account grant expiry"
          class="block border rounded p-2 dark:bg-gray-800"
      /></label>
      <el-button :loading="busy" @click="grant">Grant read access</el-button>
      <div v-for="item in data.grants" :key="item.id" class="border-b py-2">
        <span
          >{{ item.username || `Account ${item.user_id}` }} ·
          {{
            lifecycleStatus(item) === "Active"
              ? "Read access"
              : lifecycleStatus(item)
          }}
          · expires {{ item.expires_at || "—" }}</span
        >
        <el-button
          v-if="!item.revoked_at"
          :disabled="busy"
          @click="
            perform(() => repositoryAccessAPI.revokeGrant(repository, item.id))
          "
          >Revoke account access</el-button
        >
      </div>
    </div>
    <div class="card space-y-3">
      <h3 class="font-semibold">Visitor sessions and audit</h3>
      <p v-for="guest in data.guests" :key="guest.id">
        Visitor #{{ guest.id }} ·
        {{ guest.revoked_at ? "Revoked" : "Expires" }} {{ guest.expires_at }}
        <el-button
          v-if="!guest.revoked_at"
          :disabled="busy"
          @click="
            perform(() => repositoryAccessAPI.revokeGuest(repository, guest.id))
          "
          >Revoke visitor session</el-button
        >
      </p>
      <p v-for="event in data.events" :key="event.id">
        {{ event.created_at }} · {{ event.action }} ·
        {{ event.actor_username || event.actor_id || "Visitor" }}
      </p>
      <p v-if="data.limit" class="text-sm text-gray-500">
        Showing up to {{ data.limit }} recent records per section.
      </p>
    </div>
    <div class="flex gap-3">
      <el-button
        v-if="offset > 0"
        :disabled="busy"
        @click="
          offset = Math.max(0, offset - 100);
          load();
        "
        >Previous records</el-button
      >
      <el-button
        v-if="Object.values(data.has_more || {}).some(Boolean)"
        :disabled="busy"
        @click="
          offset += 100;
          load();
        "
        >More records</el-button
      >
    </div>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from "vue";
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
let generation = 0;
let loadSequence = 0;
async function load() {
  const owner = generation;
  const request = ++loadSequence;
  const target = { ...props.repository };
  error.value = null;
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
