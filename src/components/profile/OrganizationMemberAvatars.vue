<script setup>
import EntityAvatar from "@/components/common/EntityAvatar.vue";

defineProps({ members: { type: Array, required: true } });
</script>

<template>
  <ul class="organization-member-avatars" role="list">
    <li v-for="member in members" :key="member.user">
      <RouterLink
        :to="`/${member.user}`"
        :aria-label="member.user"
        :title="member.user"
        class="organization-member-link"
      >
        <EntityAvatar
          :username="member.user"
          :name="member.user"
          :size="44"
          aria-hidden="true"
        />
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.organization-member-avatars {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.organization-member-link {
  display: flex;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.organization-member-link:hover,
.organization-member-link:focus-visible {
  outline: 2px solid var(--site-primary);
  outline-offset: 3px;
}
</style>
