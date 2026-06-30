<script setup>
import { onMounted } from 'vue'
import { useUiStore } from './stores/ui'
import ToastHost from './components/ToastHost.vue'

const ui = useUiStore()
onMounted(() => ui.initTheme())
</script>

<template>
  <router-view />
  <ToastHost />
</template>
