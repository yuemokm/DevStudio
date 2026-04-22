<template>









  <div class="app" data-vid="v28">
    <h1 data-vid="v30">Hello Vue</h1>
    <template v-if="show" data-vid="v33">
      <p data-vid="v35">Conditional content</p>
    </template>
    <template v-for="item in items" :key="item.id" data-vid="v39">
      <div class="item" data-vid="v41">{{ item.name }}</div>
    </template>
    <MyComponent title="test" data-vid="v45">
    <button @click="toggle" data-vid="v47">Toggle</button>
  </MyComponent></div>









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
