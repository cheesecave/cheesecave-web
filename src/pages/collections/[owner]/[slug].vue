<!-- src/pages/collections/[owner]/[slug].vue: one collection -->
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import ErrorState from "@/components/common/ErrorState.vue";
import PrivateBadge from "@/components/repo/PrivateBadge.vue";
import CollectionItemCard from "@/components/collections/CollectionItemCard.vue";
import CollectionFormDialog from "@/components/collections/CollectionFormDialog.vue";
import AddItemDialog from "@/components/collections/AddItemDialog.vue";
import { collectionsAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { formatRelativeTime } from "@/utils/datetime";
import {
  canWriteFor,
  collectionPath,
  themeColor,
  NOTE_MAX,
} from "@/utils/collections";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const collection = ref(null);
const loading = ref(true);
const error = ref(null);
const editDialog = ref(false);
const addDialog = ref(false);
const noteTarget = ref(null);
const noteText = ref("");
const dragFrom = ref(null);

const requested = computed(() => `${route.params.owner}/${route.params.slug}`);
// The server decides (a visitor of an organization gets 403); this only decides whether to show the controls
// Only read while a collection is shown; the server decides (a visitor of an organization gets 403)
const canEdit = computed(() => canWriteFor(auth, collection.value.owner.name));
const items = computed(() => collection.value.items);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await collectionsAPI.get(requested.value);
    collection.value = data;
    document.title = `${data.title} - collection`;
    // the short form of the address (no id) and a renamed collection both land on the canonical one
    const canonical = collectionPath(data.slug);
    if (route.path !== canonical) router.replace(canonical);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

function problem(err) {
  return (
    err?.response?.data?.error ||
    err?.appError?.message ||
    "Something went wrong"
  );
}

async function toggleUpvote() {
  if (!auth.isAuthenticated)
    return router.push({ path: "/login", query: { redirect: route.fullPath } });
  const mine = collection.value.isUpvotedByUser;
  try {
    const { data } = mine
      ? await collectionsAPI.removeUpvote(collection.value.slug)
      : await collectionsAPI.upvote(collection.value.slug);
    collection.value.isUpvotedByUser = !mine;
    collection.value.upvotes = data.upvotes;
  } catch (err) {
    ElMessage.error(problem(err));
  }
}

async function share() {
  const url = `${window.location.origin}${collectionPath(collection.value.slug)}`;
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success("Link copied");
  } catch {
    ElMessage.info(url);
  }
}

async function removeCollection() {
  try {
    await ElMessageBox.confirm(
      `Delete "${collection.value.title}"? This cannot be undone. The repositories in it are not touched.`,
      "Delete the collection",
      {
        type: "warning",
        confirmButtonText: "Delete",
        cancelButtonText: "Cancel",
      },
    );
  } catch {
    return;
  }
  try {
    await collectionsAPI.remove(collection.value.slug);
    ElMessage.success("Collection deleted");
    router.push(`/${collection.value.owner.name}/collections`);
  } catch (err) {
    ElMessage.error(problem(err));
  }
}

async function removeItem(item) {
  try {
    await collectionsAPI.removeItem(collection.value.slug, item._id);
    collection.value.items = collection.value.items.filter(
      (one) => one._id !== item._id,
    );
  } catch (err) {
    ElMessage.error(problem(err));
  }
}

function editNote(item) {
  noteTarget.value = item;
  noteText.value = item.note?.text || "";
}

async function saveNote() {
  try {
    await collectionsAPI.updateItem(
      collection.value.slug,
      noteTarget.value._id,
      { note: noteText.value },
    );
    await load();
    noteTarget.value = null;
  } catch (err) {
    ElMessage.error(problem(err));
  }
}

// Moving a card (dragging it onto another, or the buttons): the item takes the place `to` in the list, the server renumbers
function moveTo(from, to) {
  if (from === to || to < 0 || to >= collection.value.items.length) return;
  const moved = collection.value.items.splice(from, 1)[0];
  collection.value.items.splice(to, 0, moved);
  collectionsAPI
    .updateItem(collection.value.slug, moved._id, { position: to })
    .catch((err) => {
      ElMessage.error(problem(err));
      load();
    });
}

function onDrop(index) {
  const from = dragFrom.value;
  dragFrom.value = null;
  if (from !== null) moveTo(from, index);
}

watch(requested, load);
onMounted(load);
</script>

<template>
  <div class="container-main">
    <div v-if="loading && !collection" class="py-12">
      <el-skeleton :rows="6" animated />
    </div>
    <ErrorState
      v-else-if="error"
      :error="error"
      :context="{ noun: 'collection' }"
      mode="full-page"
      :retry="load"
    />

    <template v-else-if="collection">
      <header
        class="card collection-head"
        :style="{ '--theme': themeColor(collection.theme) }"
      >
        <div class="flex flex-wrap items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Collection
            </div>
            <h1 class="text-3xl font-bold flex items-center gap-3 flex-wrap">
              {{ collection.title }}
              <PrivateBadge v-if="collection.private" />
            </h1>
            <p
              v-if="collection.description"
              class="text-gray-600 dark:text-gray-400 mt-2"
            >
              {{ collection.description }}
            </p>
            <div
              class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-gray-600 dark:text-gray-400"
            >
              <RouterLink
                :to="`/${collection.owner.name}`"
                class="flex items-center gap-2 hover:underline"
              >
                <EntityAvatar
                  :username="collection.owner.name"
                  :is-org="collection.owner.type === 'org'"
                  :name="collection.owner.name"
                  :size="22"
                />
                {{ collection.owner.name }}
              </RouterLink>
              <span
                >{{ items.length }} item{{
                  items.length === 1 ? "" : "s"
                }}</span
              >
              <span
                >Updated
                {{ formatRelativeTime(collection.lastUpdated, "never") }}</span
              >
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <el-button
              :type="collection.isUpvotedByUser ? 'primary' : 'default'"
              :aria-pressed="collection.isUpvotedByUser"
              @click="toggleUpvote"
            >
              <span class="i-carbon-thumbs-up mr-1" aria-hidden="true" />
              {{ collection.isUpvotedByUser ? "Upvoted" : "Upvote" }}
              <span class="ml-1 font-semibold">{{ collection.upvotes }}</span>
            </el-button>
            <el-button @click="share">
              <span class="i-carbon-share mr-1" aria-hidden="true" /> Share
            </el-button>
          </div>
        </div>
        <div
          v-if="canEdit"
          class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
        >
          <el-button type="primary" @click="addDialog = true">
            <span class="i-carbon-add mr-1" aria-hidden="true" /> Add to the
            collection
          </el-button>
          <el-button @click="editDialog = true">
            <span class="i-carbon-edit mr-1" aria-hidden="true" /> Edit
          </el-button>
          <el-button type="danger" plain @click="removeCollection">
            <span class="i-carbon-trash-can mr-1" aria-hidden="true" /> Delete
          </el-button>
        </div>
      </header>

      <section class="mt-6" aria-label="Items">
        <p v-if="!items.length" class="text-gray-500 text-center py-10">
          Nothing here yet.
          <template v-if="canEdit"
            >Use "Add to the collection", or "Add to collection" on any
            repository page.</template
          >
        </p>
        <div class="grid gap-3 md:grid-cols-2">
          <div
            v-for="(item, index) in items"
            :key="item._id"
            :draggable="canEdit"
            @dragstart="dragFrom = index"
            @dragover.prevent
            @drop.prevent="onDrop(index)"
            @dragend="dragFrom = null"
          >
            <CollectionItemCard
              :item="item"
              :editable="canEdit"
              :dragging="dragFrom === index"
              :can-move-up="index > 0"
              :can-move-down="index < items.length - 1"
              @edit-note="editNote(item)"
              @remove="removeItem(item)"
              @move="moveTo(index, index + $event)"
            />
          </div>
        </div>
      </section>

      <CollectionFormDialog
        v-model="editDialog"
        :collection="collection"
        @saved="
          load().then(() => router.replace(collectionPath(collection.slug)))
        "
      />
      <AddItemDialog
        v-model="addDialog"
        :slug="collection.slug"
        @added="load"
      />
      <el-dialog
        append-to-body
        :model-value="!!noteTarget"
        title="Note"
        width="480px"
        @update:model-value="noteTarget = null"
      >
        <el-input
          v-model="noteText"
          type="textarea"
          :rows="5"
          :maxlength="NOTE_MAX"
          show-word-limit
          aria-label="Note"
        />
        <template #footer>
          <el-button @click="noteTarget = null">Cancel</el-button>
          <el-button type="primary" @click="saveNote">Save</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<style scoped>
.collection-head {
  position: relative;
}
.collection-head::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 6px;
  border-radius: 8px 8px 0 0;
  background: var(--theme);
}
</style>
