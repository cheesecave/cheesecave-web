<template>
  <!-- A meter that is not a bar: with no limit there is nothing to fill, and an empty bar reads as "0 % used". -->
  <div class="no-cap-track" aria-hidden="true" />
</template>

<style scoped>
.no-cap-track {
  height: 6px;
  border-radius: 999px;
  background: repeating-linear-gradient(
    135deg,
    var(--site-border, #d4d4cc) 0 4px,
    transparent 4px 8px
  );
}
</style>
