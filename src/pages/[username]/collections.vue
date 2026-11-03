<!-- src/pages/[username]/collections.vue: the collections of a user or an organization, in their own order -->
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import EntityAvatar from "@/components/common/EntityAvatar.vue";
import ErrorState from "@/components/common/ErrorState.vue";
import CollectionCard from "@/components/collections/CollectionCard.vue";
import CollectionFormDialog from "@/components/collections/CollectionFormDialog.vue";
import { collectionsAPI } from "@/utils/api";
import { useAuthStore } from "@/stores/auth";
import { canWriteFor, collectionPath } from "@/utils/collections";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const username = computed(() => route.params.username);
const collections = ref([]);
const loading = ref(true);
const error = ref(null);
const creating = ref(false);
const mine = computed(() => canWriteFor(auth, username.value));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    // sort=position is CheeseCave's own: the owner's order; private ones are only sent to those who may see them
    const { data } = await collectionsAPI.list({
      owner: username.value,
      sort: "position",
      limit: 100,
    });
    collections.value = data;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

watch(username, load);
onMounted(load);
</script>

<template>
  <div class="container-main">
    <div class="flex items-center justify-between gap-3 mb-6 flex-wrap">
      <div class="flex items-center gap-3 min-w-0">
        <EntityAvatar :username="username" :name="username" :size="40" />
        <div class="min-w-0">
          <h1 class="text-2xl font-bold truncate">Collections</h1>
          <RouterLink
            :to="`/${username}`"
            class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {{ username }}
          </RouterLink>
        </div>
      </div>
      <el-button v-if="mine" type="primary" @click="creating = true">
        <span class="i-carbon-add mr-1" aria-hidden="true" /> New collection
      </el-button>
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
        No collections yet.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CollectionCard
          v-for="one in collections"
          :key="one.slug"
          :collection="one"
        />
      </div>
    </template>
    <CollectionFormDialog
      v-model="creating"
      @saved="router.push(collectionPath($event.slug))"
    />
  </div>
</template>
