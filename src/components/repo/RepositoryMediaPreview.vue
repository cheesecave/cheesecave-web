<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
const props = defineProps({
  src: { type: String, default: "" },
  kind: { type: String, default: "video" },
  filename: { type: String, default: "" },
  restricted: { type: Boolean, default: false },
  playlist: { type: Boolean, default: false },
});
const emit = defineEmits(["access-denied"]);
const media = ref(null),
  error = ref("");
let player = null,
  generation = 0;
function clearMedia() {
  player?.destroy();
  player = null;
  if (media.value) {
    media.value.pause();
    media.value.removeAttribute("src");
    media.value.load();
  }
}
function safePlaylist(value) {
  try {
    const url = new URL(value, window.location.origin);
    return (
      url.origin === window.location.origin &&
      /^\/api\/(?:models|datasets|spaces)\/[^/]+\/[^/]+\/access\/guest\/media\/hls\/playlist$/.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}
watch(
  () => [props.src, props.kind, props.restricted, props.playlist],
  async () => {
    const owner = ++generation;
    clearMedia();
    error.value = "";
    await nextTick();
    if (owner !== generation || !media.value) return;
    if (!props.restricted) {
      media.value.src = props.src;
      return;
    }
    media.value.removeAttribute("src");
    if (!props.playlist || !safePlaylist(props.src)) {
      error.value = "Media preview unavailable";
      return;
    }
    try {
      const { default: Hls } = await import("hls.js");
      if (owner !== generation) return;
      if (Hls.isSupported()) {
        player = new Hls({
          xhrSetup: (xhr) => {
            xhr.withCredentials = true;
          },
        });
        player.on(Hls.Events.ERROR, (_event, data) => {
          if (owner !== generation) return;
          const status = data.response?.code ?? data.networkDetails?.status;
          if ([401, 403, 404].includes(status)) {
            error.value = "Media preview unavailable";
            clearMedia();
            emit("access-denied", {
              response: { status, headers: { "x-error-code": "RepoNotFound" } },
            });
          } else if (data.fatal) {
            error.value = "Media preview unavailable";
            clearMedia();
          }
        });
        player.loadSource(props.src);
        player.attachMedia(media.value);
      } else if (media.value.canPlayType("application/vnd.apple.mpegurl")) {
        media.value.src = props.src;
      } else error.value = "Media preview unavailable in this browser";
    } catch {
      if (owner === generation) error.value = "Media preview unavailable";
    }
  },
  { immediate: true },
);
function elementError() {
  error.value = "Media preview unavailable";
  if (props.restricted) clearMedia();
}
onBeforeUnmount(() => {
  generation++;
  clearMedia();
});
</script>
<template>
  <div :class="kind === 'audio' ? 'text-center py-8' : 'text-center'">
    <div
      v-if="kind === 'audio'"
      class="i-carbon-music text-6xl text-gray-400 mb-4 inline-block"
    />
    <component
      :is="kind === 'audio' ? 'audio' : 'video'"
      ref="media"
      :src="!restricted ? src : undefined"
      controls
      :controlslist="restricted ? 'nodownload noremoteplayback' : undefined"
      :disablepictureinpicture="restricted || undefined"
      :disableremoteplayback="restricted || undefined"
      :class="
        kind === 'audio'
          ? 'w-full max-w-xl mx-auto'
          : 'max-w-full h-auto mx-auto'
      "
      :style="kind === 'video' ? { maxHeight: '600px' } : undefined"
      :aria-label="`${kind === 'audio' ? 'Audio' : 'Video'}: ${filename}`"
      @error="elementError"
    >
      <track
        v-if="kind === 'video'"
        kind="captions"
        :label="`${filename} captions`"
      />
      Your browser does not support media playback.
    </component>
    <p
      v-if="error"
      role="alert"
      class="py-4 text-sm"
      style="color: var(--site-muted)"
    >
      {{ error }}
    </p>
  </div>
</template>
