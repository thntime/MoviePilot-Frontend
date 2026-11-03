<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type { NetdiskBreadcrumbItem } from './types'

const props = defineProps<{
  items: NetdiskBreadcrumbItem[]
}>()

const emit = defineEmits<{
  (event: 'navigate', index: number): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="d-flex align-center flex-wrap gap-1">
    <template v-for="(item, index) in props.items" :key="item.id ?? '__root__'">
      <VIcon v-if="index > 0" icon="mdi-chevron-right" size="small" class="text-medium-emphasis" />
      <VBtn
        variant="text"
        size="small"
        :color="index === props.items.length - 1 ? undefined : 'primary'"
        :disabled="index === props.items.length - 1"
        class="text-none px-1"
        :prepend-icon="index === 0 ? 'mdi-home-outline' : undefined"
        @click="emit('navigate', index)"
      >
        {{ index === 0 ? t('netdisk.browser.root') : item.name }}
      </VBtn>
    </template>
  </div>
</template>
