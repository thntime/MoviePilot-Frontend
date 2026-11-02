<script lang="ts" setup>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import {
  deleteNetdiskAccount,
  probeNetdiskAccount,
  refreshNetdiskAccount,
  updateNetdiskAccount,
  type NetdiskAccount,
} from '@/api/netdisk'
import { getApiBusinessErrorMessage } from '@/api/client'
import { useConfirm } from '@/composables/useConfirm'
import { formatDateToMonthShort } from '@/@core/utils/formatters'

// 国际化
const { t } = useI18n()

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 输入参数
const props = defineProps({
  account: {
    type: Object as PropType<NetdiskAccount>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update', 'edit'])

// 操作进行中状态
const probing = ref(false)
const refreshing = ref(false)
const settingPrimary = ref(false)

// 状态展示：active 有效，expired 已过期，其余视为未验证
const statusMeta = computed(() => {
  switch (props.account.status) {
    case 'active':
      return { text: t('netdisk.status.active'), color: 'success', icon: 'mdi-check-circle-outline' }
    case 'expired':
      return { text: t('netdisk.status.expired'), color: 'error', icon: 'mdi-alert-circle-outline' }
    default:
      return { text: t('netdisk.status.unknown'), color: 'secondary', icon: 'mdi-help-circle-outline' }
  }
})

// 过期时间与最近检测时间
const expiresAtText = computed(() =>
  props.account.expires_at ? formatDateToMonthShort(props.account.expires_at, false) : t('netdisk.never'),
)
const lastCheckedAtText = computed(() =>
  props.account.last_checked_at ? formatDateToMonthShort(props.account.last_checked_at, false) : t('netdisk.never'),
)

// 检测连通性
async function probeAccount() {
  if (probing.value) return
  probing.value = true
  try {
    await probeNetdiskAccount(props.account.id)
    $toast.success(t('netdisk.probeSuccess', { name: props.account.name }))
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.probeFailed', { name: props.account.name }))
  } finally {
    probing.value = false
    emit('update')
  }
}

// 刷新令牌
async function refreshAccount() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await refreshNetdiskAccount(props.account.id)
    $toast.success(t('netdisk.refreshSuccess', { name: props.account.name }))
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.refreshFailed', { name: props.account.name }))
  } finally {
    refreshing.value = false
    emit('update')
  }
}

// 设为主账号
async function setPrimary() {
  if (settingPrimary.value || props.account.is_primary) return
  settingPrimary.value = true
  try {
    await updateNetdiskAccount(props.account.id, { is_primary: true })
    $toast.success(t('netdisk.setPrimarySuccess', { name: props.account.name }))
    emit('update')
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.setPrimaryFailed', { name: props.account.name }))
  } finally {
    settingPrimary.value = false
  }
}

// 删除账号（二次确认）
async function deleteAccount() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('netdisk.deleteConfirm', { name: props.account.name }),
  })
  if (!isConfirmed) return

  try {
    await deleteNetdiskAccount(props.account.id)
    $toast.success(t('netdisk.deleteSuccess', { name: props.account.name }))
    emit('update')
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.deleteFailed', { name: props.account.name }))
  }
}
</script>

<template>
  <VCard variant="tonal" class="app-card-shell app-card-colorful netdisk-account-card">
    <VCardText class="app-card-summary">
      <div class="app-card-summary__content">
        <div class="app-card-summary__title-row">
          <span class="app-card-summary__title text-h6">{{ account.name }}</span>
          <VChip v-if="account.is_primary" size="x-small" color="warning" variant="tonal" class="shrink-0">
            {{ t('netdisk.primary') }}
          </VChip>
        </div>
        <div class="app-card-summary__meta text-sm">
          <span class="app-card-summary__meta-item d-inline-flex align-center gap-1">
            <VIcon :icon="statusMeta.icon" :color="statusMeta.color" size="16" />
            {{ statusMeta.text }}
          </span>
          <span class="app-card-summary__meta-item">
            {{ t('netdisk.expiresAt') }}：{{ expiresAtText }}
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
            <VListItem prepend-icon="mdi-refresh" :disabled="refreshing" @click="refreshAccount">
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
