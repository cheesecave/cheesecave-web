<!-- src/pages/new.vue -->
<template>
  <div class="container-main">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl md:text-3xl font-bold mb-2">Create New Repository</h1>
      <p
        class="text-sm md:text-base text-gray-600 dark:text-gray-400 mb-6 md:mb-8"
      >
        A repository contains all project files, including revision history.
      </p>

      <div class="card">
        <CreateRepositoryForm
          :initial-type="initialType"
          @cancel="router.back()"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import CreateRepositoryForm from "@/components/repo/CreateRepositoryForm.vue";
const router = useRouter();
const route = useRoute();
const initialType = computed(() => route.query.type || "model");
</script>
