<script setup>
// PROTOTYPE: the pill that switches the option for the whole tab.
import { VARIANTS, unlimitedVariant } from "@/utils/unlimited";

const current = unlimitedVariant();
const names = { word: "today", a: "A ∞", b: "B ∞ + word", c: "C mixed" };
function choose(name) {
  const url = new URL(window.location.href);
  url.searchParams.set("inf", name);
  window.location.href = url.toString();
}
</script>

<template>
  <div
    class="inf-switcher"
    role="group"
    aria-label="Prototype: how no limit is written"
  >
    <span>Unlimited as</span>
    <button
      v-for="name in VARIANTS"
      :key="name"
      type="button"
      :aria-pressed="name === current"
      @click="choose(name)"
    >
      {{ names[name] }}
    </button>
  </div>
</template>

<style scoped>
.inf-switcher {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #bbb;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #222;
  font:
    12px/1.3 system-ui,
    sans-serif;
  box-shadow: 0 2px 10px #0003;
}
button {
  border: 1px solid #ccc;
  border-radius: 999px;
  padding: 2px 9px;
  background: #fff;
  color: #222;
  font: inherit;
  cursor: pointer;
}
button[aria-pressed="true"] {
  background: #94621f;
  border-color: #94621f;
  color: #fff;
}
</style>
