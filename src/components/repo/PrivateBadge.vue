<!-- The marker every list puts on a private repository: a lock and "Private" -->
<template>
  <span class="repo-private"
    ><span class="i-carbon-locked" aria-hidden="true" />Private</span
  >
</template>

<style scoped>
.repo-private {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  border: 1px solid var(--site-border, #dedfd4);
  border-radius: 5px;
  padding: 1px 4px;
  color: var(--site-muted, #6b7068);
  font-size: 9px;
}
</style>
