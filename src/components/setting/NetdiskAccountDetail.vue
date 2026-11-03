<script lang="ts" setup>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NetdiskAccount, NetdiskPlatformInfo } from '@/api/netdisk'
import { useNetdiskAccountActions } from '@/composables/useNetdiskAccountActions'
import { formatFileSize } from '@/@core/utils/formatters'
import {
  formatNetdiskDateTime,
  getNetdiskPlatformName,
  getNetdiskQuotaPercent,
  getNetdiskStatusMeta,
} from '@/utils/netdisk'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  account: {
    type: Object as PropType<NetdiskAccount>,
    required: true,
  },
  platformInfo: {
    type: Object as PropType<NetdiskPlatformInfo | undefined>,
    default: undefined,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update', 'edit', 'browse'])

// 账号动作（探测/刷新/设主/删除），与卡片共用同一套逻辑
const accountRef = toRef(props, 'account')
const { probing, refreshing, settingPrimary, probeAccount, refreshAccount, setPrimary, deleteAccount } =
  useNetdiskAccountActions(accountRef, () => emit('update'))

// 状态与配额
const statusMeta = computed(() => getNetdiskStatusMeta(t, props.account.status))
const quotaPercent = computed(() => getNetdiskQuotaPercent(props.account.quota_used, props.account.quota_total))
const quotaColor = computed(() => {
  if (quotaPercent.value >= 95) return 'error'
  if (quotaPercent.value >= 80) return 'warning'
  return 'primary'
})

// 过期时间与最近检测时间
const expiresAtText = computed(() =>
  props.account.expires_at ? formatNetdiskDateTime(props.account.expires_at) : t('netdisk.expiresUnknown'),
)
const lastCheckedAtText = computed(() =>
  props.account.last_checked_at ? formatNetdiskDateTime(props.account.last_checked_at) : t('netdisk.never'),
)

// 已保存凭据字段名（只显示字段名，值恒为 ***）
const maskedKeys = computed(() => Object.keys(props.account.masked ?? {}))
</script>

<template>
  <div class="netdisk-account-detail">
    <!-- 头部：平台、昵称、状态与快捷操作 -->
    <div class="d-flex flex-wrap align-start gap-3 mb-4">
      <div class="flex-grow-1 min-w-0">
        <div class="d-flex flex-wrap align-center gap-2 mb-1">
          <VChip size="small" variant="tonal" color="primary">
            {{ getNetdiskPlatformName(t, account.platform) }}
          </VChip>
          <VChip size="small" variant="tonal" :color="statusMeta.color" :prepend-icon="statusMeta.icon">
            {{ statusMeta.text }}
          </VChip>
          <VChip v-if="account.is_primary" size="small" variant="tonal" color="warning" prepend-icon="mdi-star">
            {{ t('netdisk.primary') }}
          </VChip>
        </div>
        <div class="text-h6 netdisk-account-detail__title">{{ account.nickname || account.name }}</div>
      </div>
      <div class="d-flex flex-wrap gap-2 shrink-0">
        <VBtn color="primary" prepend-icon="mdi-folder-open-outline" class="shrink-0" @click="emit('browse')">
          {{ t('netdisk.actions.browse') }}
        </VBtn>
        <VBtn variant="tonal" prepend-icon="mdi-file-edit-outline" class="shrink-0" @click="emit('edit')">
          {{ t('netdisk.actions.edit') }}
        </VBtn>
      </div>
    </div>

    <!-- 过期提醒 -->
    <VAlert v-if="account.status === 'expired'" variant="tonal" color="error" density="compact" class="mb-4">
      <div class="d-flex flex-wrap align-center gap-2">
        <span>{{ t('netdisk.detail.expiredHint') }}</span>
        <VBtn size="small" variant="text" color="error" class="shrink-0" @click="emit('edit')">
          {{ t('netdisk.actions.edit') }}
        </VBtn>
      </div>
    </VAlert>

    <!-- 存储空间 -->
    <section class="mb-4">
      <div class="text-subtitle-2 mb-2">{{ t('netdisk.detail.storage') }}</div>
      <template v-if="account.quota_total > 0">
        <VProgressLinear :model-value="quotaPercent" :color="quotaColor" height="8" rounded class="mb-1" />
        <div class="text-body-2">
          {{
            t('netdisk.detail.quotaUsage', {
              used: formatFileSize(account.quota_used),
              total: formatFileSize(account.quota_total),
              percent: quotaPercent,
            })
          }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ t('netdisk.detail.quotaFree', { free: formatFileSize(account.quota_total - account.quota_used) }) }}
        </div>
      </template>
      <div v-else class="text-body-2 text-medium-emphasis">{{ t('netdisk.detail.storageUnknown') }}</div>
    </section>

    <VDivider class="mb-4" />

    <!-- 账号信息 -->
    <section class="mb-4">
      <div class="text-subtitle-2 mb-2">{{ t('netdisk.detail.info') }}</div>
      <dl class="netdisk-account-detail__dl">
        <template v-if="account.nickname !== account.name">
          <dt>{{ t('netdisk.detail.accountName') }}</dt>
          <dd>{{ account.name }}</dd>
        </template>
        <dt>{{ t('netdisk.expiresAt') }}</dt>
        <dd>{{ expiresAtText }}</dd>
        <dt>{{ t('netdisk.lastCheckedAt') }}</dt>
        <dd>{{ lastCheckedAtText }}</dd>
        <dt>{{ t('netdisk.detail.credentials') }}</dt>
        <dd>
          <template v-if="maskedKeys.length > 0">
            <div v-for="key in maskedKeys" :key="key" class="d-flex gap-2">
              <span>{{ key }}</span>
              <span class="text-medium-emphasis">***</span>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">{{ t('netdisk.detail.credentialsHint') }}</div>
          </template>
          <template v-else>{{ t('netdisk.detail.none') }}</template>
        </dd>
      </dl>
    </section>

    <!-- 平台能力 -->
    <template v-if="platformInfo">
      <VDivider class="mb-4" />
      <section class="mb-4">
        <div class="text-subtitle-2 mb-2">{{ t('netdisk.detail.capabilities') }}</div>
        <div class="text-body-2 mb-1">{{ t('netdisk.maxConcurrency', { count: platformInfo.max_concurrency }) }}</div>
        <dl class="netdisk-account-detail__dl">
          <dt>{{ t('netdisk.detail.tokenRefresh') }}</dt>
          <dd>
            {{ platformInfo.supports_refresh ? t('netdisk.detail.supported') : t('netdisk.detail.unsupported') }}
            <div v-if="!platformInfo.supports_refresh" class="text-caption text-medium-emphasis">
              {{ t('netdisk.detail.refreshUnsupportedHint') }}
            </div>
          </dd>
          <template v-if="platformInfo.cookie_required_keys.length > 0">
            <dt>{{ t('netdisk.detail.requiredKeys') }}</dt>
            <dd>{{ platformInfo.cookie_required_keys.join('、') }}</dd>
          </template>
          <template v-if="platformInfo.login_url">
            <dt>{{ t('netdisk.detail.loginPage') }}</dt>
            <dd>
              <a :href="platformInfo.login_url" target="_blank" rel="noopener noreferrer" class="text-primary">
                {{ platformInfo.login_url }}
                <VIcon icon="mdi-open-in-new" size="14" />
              </a>
            </dd>
          </template>
        </dl>
      </section>
    </template>

    <VDivider class="mb-4" />

    <!-- 操作区 -->
    <section class="mb-4">
      <div class="d-flex flex-wrap gap-2">
        <VBtn variant="tonal" prepend-icon="mdi-wifi-check" :loading="probing" class="shrink-0" @click="probeAccount">
          {{ t('netdisk.actions.probe') }}
        </VBtn>
        <VBtn
          v-if="platformInfo?.supports_refresh"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="refreshing"
          class="shrink-0"
          @click="refreshAccount"
        >
          {{ t('netdisk.actions.refresh') }}
        </VBtn>
        <VBtn
          variant="tonal"
          prepend-icon="mdi-star-outline"
          :disabled="account.is_primary"
          :loading="settingPrimary"
          class="shrink-0"
          @click="setPrimary"
        >
          {{ t('netdisk.actions.setPrimary') }}
        </VBtn>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">{{ t('netdisk.hints.isPrimary') }}</div>
    </section>

    <!-- 危险区 -->
    <VDivider class="mb-4" />
    <section>
      <VBtn variant="text" color="error" prepend-icon="mdi-delete-outline" @click="deleteAccount">
        {{ t('netdisk.actions.delete') }}
      </VBtn>
      <div class="text-caption text-medium-emphasis mt-2">{{ t('netdisk.detail.deleteHint') }}</div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.netdisk-account-detail__title {
  overflow-wrap: anywhere;
}

.netdisk-account-detail__dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 0;
  font-size: 0.875rem;

  dt {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    white-space: nowrap;
  }

  dd {
    margin: 0;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
}
</style>
