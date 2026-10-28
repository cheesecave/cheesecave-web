<script setup>
// "No limit" as the symbol, for the right side of "10 MB / ∞" or "Usage: 0 / ∞". It is named "No limit" for a mouse
// (title) and for a screen reader (which would read the bare symbol as "infinity"). Nothing essential is in the
// title: the figure before the slash already says what the symbol is. It is set in the page's own font, because
// the monospace font of a figure draws it small.
import { INFINITY, NO_LIMIT } from "@/utils/unlimited";
</script>

<template>
  <span
    class="unlimited-symbol"
    :title="NO_LIMIT"
    role="img"
    :aria-label="NO_LIMIT"
    >{{ INFINITY }}</span
  >
</template>

<style scoped>
.unlimited-symbol {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  font-size: 1.3em;
  line-height: 1;
  vertical-align: -0.08em;
  cursor: help;
}
</style>
