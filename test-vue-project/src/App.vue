<template>










  <div class="app">
    <h1>Hello Vue</h1>
    <template v-if="show">
      <p>Conditional content</p>
    </template>
    <template v-for="item in items" :key="item.id">
      <div class="item">{{ item.name }}</div>
    </template>
    <MyComponent title="test">
      <button @click="toggle">Toggle</button>
    </MyComponent>
  </div>










</template>

<script setup lang="ts">
import { ref } from 'vue'
import MyComponent from './MyComponent.vue'

const show = ref(true)
const items = ref([
  { id: 1, name: 'Item A' },
  { id: 2, name: 'Item B' },
])

function toggle() {
  show.value = !show.value
}
</script>

<style scoped>
.app {
  padding: 20px;
}
.item {
  color: blue;
}
</style>
