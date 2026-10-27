<template>
  <button
    type="button"
    class="profile-view-toggle"
    :class="{ 'is-active': visitorView }"
    :title="visitorView ? 'Exit visitor view' : 'View as visitor'"
    :aria-label="visitorView ? 'Exit visitor view' : 'View as visitor'"
    :aria-pressed="visitorView"
    @click="$emit('toggle')"
  >
    <span
      :class="visitorView ? 'i-carbon-view-off' : 'i-carbon-view'"
      aria-hidden="true"
    />
  </button>
</template>

<script setup>
defineProps({ visitorView: { type: Boolean, default: false } });
defineEmits(["toggle"]);
</script>

<style scoped>
.profile-view-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--site-border);
  border-radius: 8px;
  background: var(--site-card);
  color: var(--site-muted);
  font-size: 16px;
  cursor: pointer;
}
.profile-view-toggle:hover,
.profile-view-toggle.is-active {
  background: var(--site-hover);
  border-color: var(--site-primary);
  color: var(--site-link);
}
.profile-view-toggle:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 3px;
}
</style>
