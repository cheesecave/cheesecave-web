<script setup>
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import CollectionFormDialog from "@/components/collections/CollectionFormDialog.vue";
import { collectionsAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { writableOwners } from "@/utils/collections";

// "Add to collection" on a repository page: the collections of the user and of their organizations, a checkbox each,
// and "+ New collection" (which puts the repository in it at once).
const props = defineProps({
  repoType: { type: String, required: true },
  repoId: { type: String, required: true },
});

const auth = useAuthStore();
const open = ref(false);
const loading = ref(false);
const rows = ref([]);
const containing = ref(new Set());
const busy = ref("");
const creating = ref(false);

const owners = computed(() => writableOwners(auth));
const itemRef = computed(() => `${props.repoType}s/${props.repoId}`);

async function load() {
  loading.value = true;
  try {
    const [all, has] = await Promise.all([
      collectionsAPI.list({
        owner: owners.value,
        sort: "position",
        expand: "false",
        limit: 200,
      }),
      collectionsAPI.list({
        owner: owners.value,
        item: itemRef.value,
        expand: "false",
        limit: 200,
      }),
    ]);
    rows.value = all.data;
    containing.value = new Set(has.data.map((row) => row.name));
  } catch (err) {
    ElMessage.error(
      err?.response?.data?.error || "The collections could not be loaded",
    );
  } finally {
    loading.value = false;
  }
}

async function toggle(row) {
  busy.value = row.name;
  try {
    if (containing.value.has(row.name)) {
      const { data } = await collectionsAPI.get(row.name);
      const item = data.items.find(
        (one) => one.id === props.repoId && one.type === props.repoType,
      );
      if (item) await collectionsAPI.removeItem(row.name, item._id);
      containing.value.delete(row.name);
    } else {
      await collectionsAPI.addItem(row.name, {
        type: props.repoType,
        id: props.repoId,
      });
      containing.value.add(row.name);
    }
    containing.value = new Set(containing.value);
  } catch (err) {
    ElMessage.error(err?.response?.data?.error || "That did not work");
  } finally {
    busy.value = "";
  }
}

function created(collection) {
  ElMessage.success({
    message: `Added to "${collection.title}"`,
    duration: 4000,
  });
  load();
}
</script>

<template>
  <el-popover
    v-model:visible="open"
    trigger="click"
    placement="bottom-start"
    :width="300"
    @show="load"
  >
    <template #reference>
      <button
        type="button"
        class="add-button"
        aria-haspopup="true"
        :aria-expanded="open"
      >
        <span class="i-carbon-folder-add" aria-hidden="true" />
        <span>Add to collection</span>
      </button>
    </template>
    <div class="menu" role="group" aria-label="Collections">
      <div v-if="loading" class="py-4"><el-skeleton :rows="3" animated /></div>
      <template v-else>
        <p v-if="!rows.length" class="text-sm text-gray-500 mb-2">
          You have no collection yet.
        </p>
        <ul class="rows">
          <li v-for="row in rows" :key="row.name">
            <label class="row" :class="{ busy: busy === row.name }">
              <el-checkbox
                :model-value="containing.has(row.name)"
                :disabled="busy === row.name"
                @change="toggle(row)"
              />
              <span class="truncate flex-1">{{ row.title }}</span>
              <span
                v-if="row.private"
                class="i-carbon-locked text-gray-500"
                title="Private"
              />
            </label>
          </li>
        </ul>
        <button
          type="button"
          class="new"
          @click="((open = false), (creating = true))"
        >
          <span class="i-carbon-add" aria-hidden="true" /> New collection
        </button>
        <RouterLink :to="`/${auth.username}/collections`" class="all"
          >All my collections</RouterLink
        >
      </template>
    </div>
  </el-popover>
  <CollectionFormDialog
    v-model="creating"
    :first-item="{ type: repoType, id: repoId }"
    @saved="created"
  />
</template>

<style scoped>
/* the same pill as the Like button next to it (that one is styled by the header, whose scope does not reach in here) */
.add-button {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  min-height: 34px;
  margin: 0;
  padding: 7px 12px;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  background: var(--site-card);
  color: var(--site-card-text);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
}
.add-button:hover {
  background: var(--site-hover);
}
.rows {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
  max-height: 260px;
  overflow: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.2rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}
.row:hover {
  background: rgba(128, 128, 128, 0.12);
}
.row.busy {
  opacity: 0.6;
}
.new,
.all {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.4rem 0.2rem;
  font-size: 0.875rem;
  background: none;
  border: 0;
  border-top: 1px solid rgba(128, 128, 128, 0.25);
  cursor: pointer;
  color: #2563eb;
  text-align: left;
}
.all {
  color: inherit;
  opacity: 0.8;
}
</style>
