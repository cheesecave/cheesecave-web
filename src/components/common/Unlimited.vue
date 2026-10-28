<script setup>
// PROTOTYPE: "no limit" as the chosen option writes it. The symbol alone carries the word as a tooltip and an
// accessible name; it is set in the page's own font because a monospace font draws it small.
import { symbolAlone, unlimitedText, unlimitedWord } from "@/utils/unlimited";

const props = defineProps({ kind: { type: String, default: "value" } });
const alone = symbolAlone(props.kind);
const text = unlimitedText(props.kind);
const word = unlimitedWord();
</script>

<template>
  <span
    v-if="alone"
    class="unlimited-symbol"
    :title="word"
    role="img"
    :aria-label="word"
    >{{ text }}</span
  >
  <span v-else>{{ text }}</span>
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
