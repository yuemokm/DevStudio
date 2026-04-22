<template>

  <div class="my-component" data-vid="v102">
    <h2 data-vid="v104">{{ title }}</h2>
    <slot data-vid="v107">
  </slot></div>

</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>
.my-component {
  border: 1px solid #ccc;
  padding: 16px;
  margin: 16px 0;
  border-radius: 8px;
}
.my-component h2 {
  margin-top: 0;
  font-size: 18px;
  color: #444;
}
</style>
