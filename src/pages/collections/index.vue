<!-- src/pages/collections/index.vue: every public collection, to find some -->
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import ErrorState from "@/components/common/ErrorState.vue";
import CollectionCard from "@/components/collections/CollectionCard.vue";
import CollectionFormDialog from "@/components/collections/CollectionFormDialog.vue";
import { collectionsAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { collectionPath } from "@/utils/collections";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const SORTS = [
  { value: "trending", label: "Trending" },
  { value: "upvotes", label: "Most upvoted" },
  { value: "lastModified", label: "Recently updated" },
];
const sort = computed(() =>
  SORTS.some((s) => s.value === route.query.sort)
    ? route.query.sort
    : "trending",
);
const search = ref(typeof route.query.q === "string" ? route.query.q : "");
const collections = ref([]);
const nextCursor = ref(null);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref(null);
const creating = ref(false);

function cursorOf(response) {
  const match = /<([^>]+)>;\s*rel="next"/.exec(response.headers?.link || "");
  return match ? new URL(match[1]).searchParams.get("cursor") : null;
}

async function load(more = false) {
  if (more) loadingMore.value = true;
  else loading.value = true;
  error.value = null;
  try {
    const response = await collectionsAPI.list({
      sort: sort.value,
      q: route.query.q,
      limit: 12,
      cursor: more ? nextCursor.value : undefined,
    });
    collections.value = more
      ? [...collections.value, ...response.data]
      : response.data;
    nextCursor.value = cursorOf(response);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function go(query) {
  router.replace({ path: "/collections", query: { ...route.query, ...query } });
}

// The "New Collection" of the menus is a link here with `?new=1`: it opens the dialog, and the mark leaves the address so that
// a reload (or the next visit by the back button) does not open it again
function openFromAddress() {
  if (!auth.isAuthenticated || route.query.new === undefined) return;
  creating.value = true;
  const { new: _mark, ...rest } = route.query;
  router.replace({ path: "/collections", query: rest });
}

watch(
  () => [route.query.sort, route.query.q],
  () => load(),
);
watch(() => route.query.new, openFromAddress);
onMounted(() => {
  load();
  openFromAddress();
});
</script>

<template>
  <div class="container-main">
    <div class="flex items-center justify-between mb-2 flex-wrap gap-3">
      <h1 class="text-3xl font-bold">Collections</h1>
      <el-button
        v-if="auth.isAuthenticated"
        type="primary"
        @click="creating = true"
      >
        <span class="i-carbon-add mr-1" aria-hidden="true" /> New collection
      </el-button>
    </div>
    <p class="text-gray-600 dark:text-gray-400 mb-6">
      Lists of models, datasets and Spaces that people put together.
    </p>

    <div class="card mb-6 flex flex-wrap items-center gap-3">
      <el-input
        v-model="search"
        class="max-w-md"
        placeholder="Search the title and the description"
        clearable
        aria-label="Search collections"
        @keyup.enter="go({ q: search || undefined })"
        @clear="go({ q: undefined })"
      >
        <template #prefix><span class="i-carbon-search" /></template>
      </el-input>
      <el-radio-group
        :model-value="sort"
        aria-label="Sort"
        @update:model-value="go({ sort: $event })"
      >
        <el-radio-button
          v-for="option in SORTS"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="loading" class="py-12"><el-skeleton :rows="5" animated /></div>
    <ErrorState
      v-else-if="error"
      :error="error"
      :context="{ noun: 'collections' }"
      mode="inline-panel"
      :retry="load"
    />
    <template v-else>
      <p v-if="!collections.length" class="text-center text-gray-500 py-12">
        No collection matches.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <CollectionCard
          v-for="one in collections"
          :key="one.slug"
          :collection="one"
          show-owner
        />
      </div>
      <div v-if="nextCursor" class="text-center mt-6">
        <el-button :loading="loadingMore" @click="load(true)"
          >Load more</el-button
        >
      </div>
    </template>

    <CollectionFormDialog
      v-model="creating"
      @saved="router.push(collectionPath($event.slug))"
    />
  </div>
</template>
