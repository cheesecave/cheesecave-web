<!-- src/pages/contributing.vue -->
<script setup>
import { ref, onMounted } from "vue";
import MarkdownPage from "@/components/common/MarkdownPage.vue";

const content = ref("Loading...");
const error = ref(null);

onMounted(async () => {
  try {
    // Fetch the CONTRIBUTING.md file
    const response = await fetch("/documentation/contributing.md");
    if (!response.ok) {
      throw new Error("Failed to load documentation");
    }
    content.value = await response.text();
  } catch (e) {
    error.value = e.message;
    content.value = `# Error Loading Documentation

${e.message}

Please check the documentation on [GitHub](https://github.com/cheesecave/cheesecave-web/blob/main/CONTRIBUTING.md).`;
  }
});
</script>

<template>
  <MarkdownPage :content="content" />
</template>
