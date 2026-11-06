<script lang="ts" setup>
import type { NetdiskAccount } from '@/api/netdisk'
import { formatNetdiskFreeSpace, getNetdiskPlatformIcon, getNetdiskPlatformName } from '@/utils/netdisk'

const { t } = useI18n()

const props = defineProps<{
  platform: string
  accounts: NetdiskAccount[]
  expanded: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle'): void
}>()

// 平台剩余空间：只累加有总额配额的账号，负值按 0 处理；无任何配额数据时返回 null 隐藏文本
const platformFreeSpace = computed<string | null>(() => {
  const withQuota = props.accounts.filter(account => Number(account.quota_total) > 0)
  if (withQuota.length === 0) return null
  const total = withQuota.reduce(
    (sum, account) => sum + Math.max(Number(account.quota_total) - Number(account.quota_used || 0), 0),
    0,
  )
  return formatNetdiskFreeSpace(total)
})
</script>

<template>
  <VBtn
    variant="text"
    color="default"
    block
    class="netdisk-platform-group text-none justify-start"
    :aria-expanded="expanded"
    @click="emit('toggle')"
  >
    <template #prepend>
      <VIcon :icon="getNetdiskPlatformIcon(platform)" color="primary" />
    </template>
    <span class="text-truncate">{{ getNetdiskPlatformName(t, platform) }}</span>
    <span class="text-caption text-medium-emphasis ms-2 shrink-0">
      {{ t('netdisk.list.count', { count: accounts.length }) }}
    </span>
    <span v-if="platformFreeSpace" class="text-caption text-medium-emphasis ms-2 shrink-0">
      {{ platformFreeSpace }}
    </span>
    <template #append>
      <VIcon :icon="expanded ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="18" />
    </template>
  </VBtn>
</template>

<style scoped>
.netdisk-platform-group {
  min-block-size: 44px;
  padding-inline: 12px;
}

.netdisk-platform-group :deep(.v-btn__content) {
  min-inline-size: 0;
}
</style>
