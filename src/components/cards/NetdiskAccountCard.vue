<script lang="ts" setup>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NetdiskAccount } from '@/api/netdisk'
import { useNetdiskAccountActions } from '@/composables/useNetdiskAccountActions'
import { formatFileSize } from '@/@core/utils/formatters'
import { formatNetdiskDateTime, formatNetdiskFreeSpace, getNetdiskPlatformName, getNetdiskQuotaPercent, getNetdiskStatusMeta } from '@/utils/netdisk'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  account: {
    type: Object as PropType<NetdiskAccount>,
    required: true,
  },
  supportsRefresh: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update', 'edit'])

// 账号动作（探测/刷新/设主/删除），与详情面板共用同一套逻辑
const { probing, refreshing, settingPrimary, probeAccount, refreshAccount, setPrimary, deleteAccount } =
  useNetdiskAccountActions(toRef(props, 'account'), () => emit('update'))

// 状态展示：active 有效，expired 已过期，其余视为未验证
const statusMeta = computed(() => getNetdiskStatusMeta(t, props.account.status))

// 最近检测时间
const lastCheckedAtText = computed(() =>
  props.account.last_checked_at ? formatNetdiskDateTime(props.account.last_checked_at) : t('netdisk.never'),
)

// 空间使用比例
const quotaPercent = computed(() => getNetdiskQuotaPercent(props.account.quota_used, props.account.quota_total))

// 剩余空间文本：负值按 0 处理，与平台分组的汇总口径一致
const quotaFreeText = computed(() => {
  if (!(props.account.quota_total > 0)) return ''
  return formatNetdiskFreeSpace(Math.max(props.account.quota_total - props.account.quota_used, 0))
})
</script>

<template>
  <VCard variant="tonal" class="app-card-shell app-card-colorful netdisk-account-card">
    <VCardText class="app-card-summary">
      <div class="app-card-summary__content">
        <div class="app-card-summary__title-row">
          <span class="app-card-summary__title text-h6">{{ account.nickname || getNetdiskPlatformName(t, account.platform) }}</span>
          <VChip v-if="account.is_primary" size="x-small" color="warning" variant="tonal" class="shrink-0">
            {{ t('netdisk.primary') }}
          </VChip>
        </div>
        <div v-if="account.quota_total > 0" class="d-flex align-center gap-2 mt-1">
          <VProgressLinear :model-value="quotaPercent" height="4" rounded class="flex-grow-1" />
          <span class="text-caption text-medium-emphasis">
            {{ formatFileSize(account.quota_used) }} / {{ formatFileSize(account.quota_total) }}
          </span>
          <span v-if="quotaFreeText" class="text-caption text-medium-emphasis shrink-0">
            {{ t('netdisk.detail.quotaFree', { free: quotaFreeText }) }}
          </span>
        </div>
        <div class="app-card-summary__meta text-sm">
          <span class="app-card-summary__meta-item d-inline-flex align-center gap-1">
            <VIcon :icon="statusMeta.icon" :color="statusMeta.color" size="16" />
            {{ statusMeta.text }}
          </span>
          <span class="app-card-summary__meta-item">
            {{ t('netdisk.lastCheckedAt') }}：{{ lastCheckedAtText }}
          </span>
        </div>
      </div>
      <div class="app-card-summary__media">
        <VMenu location="bottom end">
          <template #activator="{ props: menuProps }">
            <IconBtn v-bind="menuProps" variant="text" @click.stop>
              <VIcon icon="mdi-dots-vertical" />
            </IconBtn>
          </template>
          <VList density="compact" class="px-2">
            <VListItem prepend-icon="mdi-file-edit-outline" @click="emit('edit')">
              <VListItemTitle>{{ t('netdisk.actions.edit') }}</VListItemTitle>
            </VListItem>
            <VListItem
              prepend-icon="mdi-star-outline"
              :disabled="account.is_primary || settingPrimary"
              @click="setPrimary"
            >
              <VListItemTitle>{{ t('netdisk.actions.setPrimary') }}</VListItemTitle>
            </VListItem>
            <VListItem prepend-icon="mdi-wifi-check" :disabled="probing" @click="probeAccount">
              <VListItemTitle>{{ t('netdisk.actions.probe') }}</VListItemTitle>
            </VListItem>
            <VListItem
              v-if="supportsRefresh"
              prepend-icon="mdi-refresh"
              :disabled="refreshing"
              @click="refreshAccount"
            >
              <VListItemTitle>{{ t('netdisk.actions.refresh') }}</VListItemTitle>
            </VListItem>
            <VDivider class="my-1" />
            <VListItem prepend-icon="mdi-delete-outline" class="text-error" @click="deleteAccount">
              <VListItemTitle>{{ t('netdisk.actions.delete') }}</VListItemTitle>
            </VListItem>
          </VList>
        </VMenu>
      </div>
    </VCardText>
  </VCard>
</template>
