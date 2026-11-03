<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { useDisplay } from 'vuetify'
import { formatBytes } from '@core/utils/formatters'
import type { NetdiskCapabilities, NetdiskFileItem } from '@/api/netdiskFiles'

const props = defineProps<{
  file: NetdiskFileItem
  selected: boolean
  showCheckbox: boolean
  capabilities: NetdiskCapabilities
}>()

const emit = defineEmits<{
  (event: 'toggle', file: NetdiskFileItem): void
  (event: 'open', file: NetdiskFileItem): void
  (event: 'action', action: 'download' | 'share' | 'rename' | 'move' | 'delete', file: NetdiskFileItem): void
}>()

const { t } = useI18n()
const display = useDisplay()

const fileIcon = computed(() => {
  if (props.file.is_dir) return { icon: 'mdi-folder-outline', color: 'warning' }
  const ext = props.file.name.split('.').pop()?.toLowerCase() ?? ''
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'ts', 'm2ts', 'rmvb'].includes(ext))
    return { icon: 'mdi-file-video-outline', color: 'info' }
  if (['mp3', 'flac', 'aac', 'wav', 'ogg', 'm4a'].includes(ext)) return { icon: 'mdi-file-music-outline', color: 'success' }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return { icon: 'mdi-file-image-outline', color: 'primary' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { icon: 'mdi-folder-zip-outline', color: 'secondary' }
  return { icon: 'mdi-file-outline', color: 'medium-emphasis' }
})

const updatedLabel = computed(() => {
  if (!props.file.updated_at) return '—'
  const parsed = dayjs(props.file.updated_at)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : props.file.updated_at
})

function onRowClick() {
  if (props.showCheckbox) emit('toggle', props.file)
  else if (props.file.is_dir) emit('open', props.file)
}

function onRowDblClick() {
  if (props.file.is_dir) emit('open', props.file)
  else if (props.capabilities.download !== false) emit('action', 'download', props.file)
}
</script>

<template>
  <div
    class="netdisk-file-row d-flex align-center gap-3 rounded cursor-pointer"
    :class="{ 'bg-primary-lighten-5': props.selected }"
    @click="onRowClick"
    @dblclick="onRowDblClick"
  >
    <VCheckboxBtn v-if="props.showCheckbox" :model-value="props.selected" density="compact" @click.stop @update:model-value="emit('toggle', props.file)" />
    <VIcon :icon="fileIcon.icon" :color="fileIcon.color" />
    <div class="flex-grow-1 text-truncate" :title="props.file.name">{{ props.file.name }}</div>
    <div v-if="display.mdAndUp.value" class="text-body-2 text-medium-emphasis text-no-wrap" style="inline-size: 7rem">
      {{ props.file.is_dir ? '—' : formatBytes(props.file.size ?? 0) }}
    </div>
    <div v-if="display.mdAndUp.value" class="text-body-2 text-medium-emphasis text-no-wrap" style="inline-size: 9rem">
      {{ updatedLabel }}
    </div>
    <div v-else class="text-caption text-medium-emphasis text-no-wrap">
      {{ props.file.is_dir ? '' : formatBytes(props.file.size ?? 0) }}
    </div>
    <VMenu location="bottom end">
      <template #activator="{ props: menuProps }">
        <VBtn icon="mdi-dots-vertical" variant="text" size="small" v-bind="menuProps" @click.stop />
      </template>
      <VList density="compact">
        <VListItem
          v-if="!props.file.is_dir && props.capabilities.download !== false"
          prepend-icon="mdi-download-outline"
          :title="t('netdisk.browser.actions.download')"
          @click="emit('action', 'download', props.file)"
        />
        <VListItem
          v-if="props.capabilities.share !== false"
          prepend-icon="mdi-share-variant-outline"
          :title="t('netdisk.browser.actions.share')"
          @click="emit('action', 'share', props.file)"
        />
        <VListItem
          v-if="props.capabilities.rename !== false"
          prepend-icon="mdi-pencil-outline"
          :title="t('netdisk.browser.actions.rename')"
          @click="emit('action', 'rename', props.file)"
        />
        <VListItem
          v-if="props.capabilities.move !== false"
          prepend-icon="mdi-folder-move-outline"
          :title="t('netdisk.browser.actions.move')"
          @click="emit('action', 'move', props.file)"
        />
        <VListItem
          v-if="props.capabilities.delete !== false"
          prepend-icon="mdi-delete-outline"
          base-color="error"
          :title="t('netdisk.browser.actions.delete')"
          @click="emit('action', 'delete', props.file)"
        />
      </VList>
    </VMenu>
  </div>
</template>

<style scoped>
.netdisk-file-row {
  padding-block: 6px;
  padding-inline: 8px;
}

.netdisk-file-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
</style>
