<template>
  <ThemeProvider>
    <SidebarProvider>
      <RouterView />
      <ConfirmDialog />
      <ToastHost />
    </SidebarProvider>
  </ThemeProvider>
</template>

<script setup lang="ts">
import ThemeProvider from './components/layout/ThemeProvider.vue'
import SidebarProvider from './components/layout/SidebarProvider.vue'
import ConfirmDialog from './components/ui/ConfirmDialog.vue'
import ToastHost from './components/ui/ToastHost.vue'
</script>
